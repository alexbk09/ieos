import { createClient as createServerClient } from '@/lib/supabase/server'
import { scrapearProductoAliExpress } from '@/services/aliScraper'
import { obtenerMarcaAliExpress } from '@/services/aliProducts'
import { traducirResenas } from '@/services/aliReviews'
import { parsearValoracion } from '@/lib/reviews'
import { revalidarSitemap } from '@/lib/sitemap-revalidate'
import type { ProductReview } from '@/services/catalog'
import {
  ALIEXPRESS_PRODUCT_ID_REGEX,
  ALI_ENRICH_BATCH_SIZE,
  ALI_ENRICH_MAX_PRODUCTS,
  AFFILIATE_DEFAULT_STOCK,
} from '@/lib/constants'

/**
 * Servicio de RE-ENRIQUECIMIENTO de productos afiliados ya publicados (Fase 2.6).
 * ------------------------------------------------------------------
 * POR QUÉ existe: los precios, la disponibilidad y las valoraciones cambian con
 * el tiempo. Este servicio vuelve a extraer el detalle real de AliExpress y
 * ACTUALIZA únicamente los campos volátiles (precio, specs, marca, valoración y
 * reseñas), SIN tocar el contenido SEO ya indexado (nombre, slug, descripción,
 * FAQ y keywords), para no perder posicionamiento.
 *
 * Reglas de oro respetadas:
 *  - Capa de abstracción pura: NO toca React (lo consume una API route).
 *  - Contrato estable { success, data } | { success, error }.
 *  - Nunca inventa datos: si el scraper no devuelve un campo, se CONSERVA el valor
 *    actual (no se blanquea) y solo se escribe lo que realmente cambió.
 *  - Revalida el sitemap y la ficha al terminar (SEO al instante).
 */

/** Etapas notificables del re-enriquecimiento (para el log en vivo del panel). */
export type EtapaEnriquecimiento =
  | 'preparando'
  | 'extrayendo'
  | 'actualizando'
  | 'completado'
  | 'error'

/** Notificación de progreso emitida al panel admin. */
export type NotificacionEnriquecimiento = {
  etapa: EtapaEnriquecimiento
  mensaje: string
  productoId?: string | null
  index?: number
  total?: number
}

/** Resultado por producto del re-enriquecimiento. */
export type ResultadoEnriquecimiento = {
  id: string
  slug: string
  nombre: string
  actualizado: boolean
  /** Campos que realmente cambiaron (para feedback claro al admin). */
  campos: string[]
  error?: string | null
}

/** Fila mínima del producto que se va a re-enriquecer. */
type FilaProducto = {
  id: string
  slug: string
  name: string
  asin: string | null
  url_afiliado_ali: string | null
  price_usd: number | null
  precio_original: number | null
  specifications: Record<string, string> | null
  marca_id: string | null
  rating_average: number | null
  rating_count: number | null
}

/** Ajusta el límite pedido por la UI a un rango seguro. */
function normalizarLimite(valor: unknown): number {
  const numero = Math.floor(Number(valor))
  if (!Number.isFinite(numero) || numero <= 0) return ALI_ENRICH_BATCH_SIZE
  return Math.min(numero, ALI_ENRICH_MAX_PRODUCTS)
}

/**
 * Resuelve el ID de AliExpress del producto.
 * Prioriza `asin` (lo escribe el pipeline) y, como respaldo, lo busca en la URL.
 */
function resolverAliProductId(fila: FilaProducto): string | null {
  const asin = fila.asin?.trim() ?? ''
  if (asin && ALIEXPRESS_PRODUCT_ID_REGEX.test(asin)) return asin.match(ALIEXPRESS_PRODUCT_ID_REGEX)?.[0] ?? null

  const url = fila.url_afiliado_ali?.trim() ?? ''
  const enUrl = url.match(/\/item\/(\d{5,})|\/(\d{5,})\.html/)
  if (enUrl) return enUrl[1] ?? enUrl[2] ?? null
  return null
}

/** Construye la URL canónica del producto (para el scraper). */
function construirUrlProducto(aliProductId: string | null, urlAfiliado: string | null): string | null {
  if (aliProductId) return `https://www.aliexpress.com/item/${aliProductId}.html`
  return urlAfiliado?.trim() || null
}

/**
 * Calcula SOLO los campos que deben cambiar, comparando el dato nuevo (scraper)
 * con el actual. Devuelve un objeto listo para el UPDATE de Supabase y la lista
 * de nombres de campo modificados. Nunca blanquea un dato existente.
 */
function calcularActualizaciones(
  fila: FilaProducto,
  detalle: {
    precioMin: number | null
    precioMax: number | null
    specs: Record<string, string>
    marcaId: string | null
    rating: number | null
    reviews: ProductReview[]
  },
): { cambios: Record<string, unknown>; campos: string[] } {
  const cambios: Record<string, unknown> = {}
  const campos: string[] = []

  // Precio de venta (fuente: scraper). Solo si viene un valor válido distinto.
  const precioMin = Number(detalle.precioMin ?? 0)
  if (Number.isFinite(precioMin) && precioMin > 0 && precioMin !== Number(fila.price_usd)) {
    cambios.price_usd = precioMin
    campos.push('precio')
  }

  // Precio original/referencia (tachado).
  const precioMax = Number(detalle.precioMax ?? 0)
  if (Number.isFinite(precioMax) && precioMax > 0 && precioMax !== Number(fila.precio_original ?? 0)) {
    cambios.precio_original = precioMax
    campos.push('precio_original')
  }

  // Especificaciones: se fusionan (las nuevas tienen prioridad) sin perder las
  // existentes; solo se escribe si hay al menos un atributo nuevo o cambiado.
  const specsActuales = fila.specifications ?? {}
  const nuevosSpecs = detalle.specs ?? {}
  if (Object.keys(nuevosSpecs).length > 0) {
    const fusionadas = { ...specsActuales, ...nuevosSpecs }
    if (JSON.stringify(fusionadas) !== JSON.stringify(specsActuales)) {
      cambios.specifications = fusionadas
      campos.push('especificaciones')
    }
  }

  // Marca: solo se asigna si el producto NO tenía marca (no pisa una manual).
  if (!fila.marca_id && detalle.marcaId) {
    cambios.marca_id = detalle.marcaId
    campos.push('marca')
  }

  // Valoración real (escala 0-5). No se toca el nº de valoraciones (el scraper
  // no lo aporta): se conserva el que ya existía.
  if (detalle.rating != null && detalle.rating !== Number(fila.rating_average ?? -1)) {
    cambios.rating_average = detalle.rating
    cambios.rating_source = 'aliexpress'
    campos.push('valoracion')
  }

  // Reseñas: solo si se lograron extraer (no se borran las ya guardadas).
  if (detalle.reviews.length > 0) {
    cambios.reviews = detalle.reviews
    campos.push('opiniones')
  }

  // Disponibilidad: si hay precio, el producto está a la venta y se refresca el
  // stock al valor por defecto de afiliados (no gestionan inventario local).
  if (campos.includes('precio')) {
    cambios.stock = AFFILIATE_DEFAULT_STOCK
    cambios.is_available = true
    campos.push('stock')
  }

  return { cambios, campos }
}


/**
 * Re-enriquece UN producto ya publicado. Extrae el detalle real y actualiza solo
 * los campos volátiles. Devuelve el resumen (o el error) sin lanzar excepciones.
 */
async function enriquecerProducto(fila: FilaProducto): Promise<{ campos: string[]; error?: string }> {
  const aliProductId = resolverAliProductId(fila)
  const urlProducto = construirUrlProducto(aliProductId, fila.url_afiliado_ali)
  if (!urlProducto) {
    return { campos: [], error: 'El producto no tiene ID ni URL de AliExpress para re-extraer.' }
  }

  const scrape = await scrapearProductoAliExpress(urlProducto)
  if (!scrape.success || !scrape.data) {
    return { campos: [], error: scrape.error ?? 'No se pudo extraer el detalle actualizado.' }
  }

  const detalle = scrape.data
  // Marca: se reutiliza/crea la fila en `marcas` si el scraper la detectó.
  let marcaId: string | null = null
  if (detalle.marca) {
    const marca = await obtenerMarcaAliExpress(detalle.marca)
    if (marca.success) marcaId = marca.marcaId
  }

  const valoracion = parsearValoracion(detalle.valoracion)
  const resenasTraducidas = await traducirResenas(detalle.resenas ?? [])
  const reviews: ProductReview[] = resenasTraducidas.success ? resenasTraducidas.data : []

  const { cambios, campos } = calcularActualizaciones(fila, {
    precioMin: detalle.precio_base?.minimo ?? null,
    precioMax: detalle.precio_base?.maximo ?? null,
    specs: detalle.metadatos_fisicos ?? {},
    marcaId,
    rating: valoracion ? valoracion.escala05 : null,
    reviews,
  })

  if (campos.length === 0) return { campos: [] }

  const supabase = await createServerClient()
  const { error } = await supabase.from('products').update(cambios).eq('id', fila.id)
  if (error) return { campos: [], error: error.message }

  // El precio y la disponibilidad cambiaron: se revalida la ficha y el sitemap.
  revalidarSitemap({ productoSlug: fila.slug })
  return { campos }
}

/**
 * Re-enriquece un LOTE de productos afiliados visibles (los más recientes).
 * Emite notificaciones de progreso para el log en vivo del panel admin.
 */
export async function ejecutarEnriquecimientoLote(
  opciones: { limit?: unknown } = {},
  notificar: (notificacion: NotificacionEnriquecimiento) => void,
): Promise<{ success: boolean; data?: ResultadoEnriquecimiento[]; error?: string }> {
  const limite = normalizarLimite(opciones.limit)

  try {
    notificar({ etapa: 'preparando', mensaje: `Seleccionando hasta ${limite} productos afiliados publicados...` })

    const supabase = await createServerClient()
    const { data, error } = await supabase
      .from('products')
      .select(
        'id,slug,name,asin,url_afiliado_ali,price_usd,precio_original,specifications,marca_id,rating_average,rating_count',
      )
      .eq('is_available', true)
      .not('url_afiliado_ali', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limite)

    if (error) return { success: false, error: error.message }

    const productos = (data ?? []) as FilaProducto[]
    if (productos.length === 0) {
      notificar({ etapa: 'completado', mensaje: 'No hay productos afiliados publicados para actualizar.' })
      return { success: true, data: [] }
    }

    const resultados: ResultadoEnriquecimiento[] = []
    for (const [i, fila] of productos.entries()) {
      const indice = i + 1
      notificar({
        etapa: 'extrayendo',
        mensaje: `[${indice}/${productos.length}] Extrayendo detalle actualizado de ${fila.name}...`,
        productoId: fila.id,
        index: indice,
        total: productos.length,
      })

      const resultado = await enriquecerProducto(fila)
      const actualizado = resultado.campos.length > 0

      resultados.push({
        id: fila.id,
        slug: fila.slug,
        nombre: fila.name,
        actualizado,
        campos: resultado.campos,
        error: resultado.error ?? null,
      })

      notificar({
        etapa: resultado.error ? 'error' : 'actualizando',
        mensaje: resultado.error
          ? `[${indice}/${productos.length}] Fallo en ${fila.slug}: ${resultado.error}`
          : actualizado
            ? `[${indice}/${productos.length}] ${fila.slug}: actualizado (${resultado.campos.join(', ')}).`
            : `[${indice}/${productos.length}] ${fila.slug}: sin cambios.`,
        productoId: fila.id,
        index: indice,
        total: productos.length,
      })
    }

    const conCambios = resultados.filter((r) => r.actualizado).length
    notificar({
      etapa: 'completado',
      mensaje: `Re-enriquecimiento finalizado: ${conCambios} productos actualizados de ${resultados.length}.`,
    })
    return { success: true, data: resultados }
  } catch (err: any) {
    console.error('[aliEnrich] ejecutarEnriquecimientoLote:', err?.message)
    notificar({ etapa: 'error', mensaje: err?.message ?? 'Error fatal del re-enriquecimiento.' })
    return { success: false, error: err?.message ?? 'Error fatal del re-enriquecimiento.' }
  }
}

