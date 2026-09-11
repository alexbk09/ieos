import { createClient as createServerClient } from '@/lib/supabase/server'
import { obtenerDetalleProductosPorIds, buscarProductosMasVendidos } from '@/services/aliApi'
import type { AliProductoDetalle } from '@/services/aliApi'
import { obtenerMarcaAliExpress } from '@/services/aliProducts'
import { extraerMarcaYSpecs } from '@/services/aliMeta'
import { parsearValoracion } from '@/lib/reviews'
import { revalidarSitemap } from '@/lib/sitemap-revalidate'
import {
  ALIEXPRESS_PRODUCT_ID_REGEX,
  ALI_DETAIL_BATCH_SIZE,
  ALI_ENRICH_CONCURRENCY,
  ALI_API_MIN_INTERVAL_MS,
  AFFILIATE_DEFAULT_STOCK,
} from '@/lib/constants'

/**
 * Servicio de RE-ENRIQUECIMIENTO de productos afiliados (Fase 2.6, v2).
 * ==================================================================
 * HALLAZGO DEL DIAGNÓSTICO (por qué se rediseñó):
 *   El scraper ya NO sirve para esto: AliExpress devuelve el HTML con
 *   `window.runParams = { }` (vacío), sin `specification--name`, sin marca y sin
 *   reseñas. En cambio, la API OFICIAL sí entrega datos reales de precio,
 *   imágenes y ventas (`productdetail.get` por lote de IDs) y la valoración
 *   positiva (`evaluate_rate`) vía búsqueda.
 *
 * Estrategia v2:
 *   1) Lee N productos publicados con `asin`.
 *   2) UNA llamada a `productdetail.get` con todos los IDs → precio real,
 *      precio original, imagen y galería vigentes.
 *   3) Marca y especificaciones se DERIVAN del título real con IA
 *      (`extraerMarcaYSpecs`), verificando que cada valor exista literalmente
 *      en el título (anti-invención).
 *   4) La valoración se busca por título (best-effort) y solo se emite si el
 *      producto coincide por ID (dato real, nunca inventado).
 *
 * Reglas de oro respetadas:
 *  - Capa de abstracción pura: NO toca React.
 *  - Contrato estable { success, data } | { success, error }.
 *  - Solo actualiza CAMPOS VOLÁTILES; nunca toca el SEO indexado (nombre,
 *    slug, descripción, FAQ, keywords) ni los enlaces de afiliado.
 *  - Espaciado entre llamadas para respetar el límite de la API.
 */

/** Etapas notificables del re-enriquecimiento (log en vivo del panel). */
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
  campos: string[]
  error?: string | null
}

/** Fila mínima del producto a re-enriquecer. */
type FilaProducto = {
  id: string
  slug: string
  name: string
  asin: string | null
  price_usd: number | null
  precio_original: number | null
  image_url: string | null
  specifications: Record<string, string> | null
  marca_id: string | null
  rating_average: number | null
}

/** Espera simple para respetar el rate limit de la API. */
function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Interpreta el límite pedido por la UI.
 * @returns Número de productos a procesar, o `null` si se piden TODOS.
 */
function normalizarLimite(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null
  const texto = String(valor).trim().toLowerCase()
  if (texto === '' || texto === 'all' || texto === 'todos' || texto === '0') return null
  const numero = Math.floor(Number(texto))
  if (!Number.isFinite(numero) || numero <= 0) return null
  return numero
}

/** Extrae el ID numérico de AliExpress del `asin` (o null si no es válido). */
function resolverAliProductId(fila: FilaProducto): string | null {
  const asin = fila.asin?.trim() ?? ''
  if (!asin) return null
  return asin.match(ALIEXPRESS_PRODUCT_ID_REGEX)?.[0] ?? null
}

/**
 * Calcula SOLO los campos que deben cambiar comparando el detalle fresco de la
 * API con el valor actual. Nunca blanquea un dato existente.
 */
function calcularActualizaciones(
  fila: FilaProducto,
  detalle: {
    precioMin: number | null
    precioOriginal: number | null
    imagenPrincipal: string | null
    marcaId: string | null
    specs: Record<string, string>
    rating: number | null
  },
): { cambios: Record<string, unknown>; campos: string[] } {
  const cambios: Record<string, unknown> = {}
  const campos: string[] = []

  // Precio de venta actual (fuente autoritativa: API oficial).
  const precioMin = Number(detalle.precioMin ?? 0)
  if (Number.isFinite(precioMin) && precioMin > 0 && precioMin !== Number(fila.price_usd)) {
    cambios.price_usd = precioMin
    campos.push('precio')
  }

  // Precio original (tachado), si la API lo trae.
  const precioOriginal = Number(detalle.precioOriginal ?? 0)
  if (Number.isFinite(precioOriginal) && precioOriginal > 0 && precioOriginal !== Number(fila.precio_original ?? 0)) {
    cambios.precio_original = precioOriginal
    campos.push('precio_original')
  }

  // Imagen principal: solo si la API trae una nueva distinta.
  if (detalle.imagenPrincipal && detalle.imagenPrincipal !== fila.image_url) {
    cambios.image_url = detalle.imagenPrincipal
    campos.push('imagen')
  }

  // Especificaciones derivadas del título: se fusionan sin perder las actuales.
  const specsActuales = fila.specifications ?? {}
  if (Object.keys(detalle.specs).length > 0) {
    const fusionadas = { ...specsActuales, ...detalle.specs }
    if (JSON.stringify(fusionadas) !== JSON.stringify(specsActuales)) {
      cambios.specifications = fusionadas
      campos.push('especificaciones')
    }
  }

  // Marca: solo si el producto aún no tenía marca (no pisa una manual).
  if (!fila.marca_id && detalle.marcaId) {
    cambios.marca_id = detalle.marcaId
    campos.push('marca')
  }

  // Valoración real (0-5). No se toca el nº de valoraciones (no viene en detalle).
  if (detalle.rating != null && detalle.rating !== Number(fila.rating_average ?? -1)) {
    cambios.rating_average = detalle.rating
    cambios.rating_source = 'aliexpress'
    campos.push('valoracion')
  }

  // Disponibilidad: si hay precio vigente, el producto está a la venta.
  if (campos.includes('precio')) {
    cambios.stock = AFFILIATE_DEFAULT_STOCK
    cambios.is_available = true
    campos.push('stock')
  }

  return { cambios, campos }
}

/**
 * Busca la valoración positiva REAL del producto en la API de búsqueda y la
 * normaliza a escala 0-5. Solo devuelve un valor si aparece el MISMO product_id
 * (evita atribuir la valoración de otro producto).
 * @returns Escala 0-5 o null si no se pudo confirmar.
 */
async function buscarValoracionPorTitulo(titulo: string | null, aliProductId: string): Promise<number | null> {
  const palabras = String(titulo ?? '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 4)
    .slice(0, 4)
  if (palabras.length === 0) return null

  const busqueda = await buscarProductosMasVendidos(palabras.join(' '), 1, 'volume_desc')
  if (!busqueda.success || !busqueda.data) return null
  const encontrado = busqueda.data.find((p) => p.ali_product_id === aliProductId)
  if (!encontrado) return null
  const valoracion = parsearValoracion(encontrado.rating_porcentaje)
  return valoracion ? valoracion.escala05 : null
}


/**
 * Re-enriquece productos afiliados publicados.
 * - `limit` numérico → solo esos; `limit` = 0 / vacío / 'todos' → TODOS.
 * Usa la API oficial en LOTES de 20 IDs (precio/imágenes reales) + IA para
 * marca/specs del título. Emite progreso para el log en vivo del panel.
 */

/**
 * Lee los productos afiliados publicados con `asin` (paginado).
 * Cuando `limite` es null se pagina hasta agotar el catálogo (modo "todos").
 */
async function leerProductosAfiliados(limite: number | null) {
  const supabase = await createServerClient()
  const TAMANO_PAGINA = 500
  const filas: FilaProducto[] = []
  let desde = 0

  for (;;) {
    const { data, error } = await supabase
      .from('products')
      .select('id,slug,name,asin,price_usd,precio_original,image_url,specifications,marca_id,rating_average')
      .eq('is_available', true)
      .not('asin', 'is', null)
      .order('created_at', { ascending: false })
      .range(desde, desde + TAMANO_PAGINA - 1)
    if (error) return { filas, error: error.message }

    const lote = (data ?? []) as FilaProducto[]
    filas.push(...lote)
    if (lote.length < TAMANO_PAGINA) break
    desde += TAMANO_PAGINA
  }

  return { filas: limite != null ? filas.slice(0, limite) : filas, error: null as string | null }
}

export async function ejecutarEnriquecimientoLote(
  opciones: { limit?: unknown } = {},
  notificar: (notificacion: NotificacionEnriquecimiento) => void,
): Promise<{ success: boolean; data?: ResultadoEnriquecimiento[]; error?: string }> {
  const limite = normalizarLimite(opciones.limit)

  try {
    notificar({
      etapa: 'preparando',
      mensaje:
        limite == null
          ? 'Seleccionando TODOS los productos publicados...'
          : `Seleccionando hasta ${limite} productos publicados...`,
    })

    const { filas: productos, error } = await leerProductosAfiliados(limite)
    if (error) return { success: false, error }

    // Cliente de escritura para los updates de los campos volátiles.
    const supabase = await createServerClient()

    if (productos.length === 0) {
      notificar({ etapa: 'completado', mensaje: 'No hay productos publicados con ID de AliExpress para actualizar.' })
      return { success: true, data: [] }
    }

    // Se resuelve el ID de cada fila una sola vez.
    const idPorFila = new Map<string, string>()
    for (const fila of productos) {
      const id = resolverAliProductId(fila)
      if (id) idPorFila.set(fila.id, id)
    }
    const ids = [...new Set(idPorFila.values())]
    if (ids.length === 0) {
      notificar({ etapa: 'completado', mensaje: 'Ningún producto tiene un ID de AliExpress válido (asin).' })
      return { success: true, data: [] }
    }

    // Detalle en LOTES de 20 IDs (la API acepta varios por llamada y tiene
    // rate limit): 140 productos se resuelven en ~7 llamadas, no en 140.
    const mapaDetalle = new Map<string, AliProductoDetalle>()
    const totalLotes = Math.ceil(ids.length / ALI_DETAIL_BATCH_SIZE)
    for (let i = 0; i < ids.length; i += ALI_DETAIL_BATCH_SIZE) {
      const loteIds = ids.slice(i, i + ALI_DETAIL_BATCH_SIZE)
      const numLote = Math.floor(i / ALI_DETAIL_BATCH_SIZE) + 1
      notificar({
        etapa: 'extrayendo',
        mensaje: `Consultando precios reales en AliExpress (lote ${numLote}/${totalLotes} · ${loteIds.length} productos)...`,
      })
      const detalle = await obtenerDetalleProductosPorIds(loteIds)
      if (detalle.success && detalle.data) {
        for (const d of detalle.data) mapaDetalle.set(d.ali_product_id, d)
      } else if (!detalle.success) {
        notificar({ etapa: 'error', mensaje: `Lote ${numLote} falló: ${detalle.error}` })
      }
      if (i + ALI_DETAIL_BATCH_SIZE < ids.length) await esperar(ALI_API_MIN_INTERVAL_MS)
    }


    const resultados: ResultadoEnriquecimiento[] = []
    /**
     * Procesa UN producto: marca/specs (IA), valoración (opcional) y update.
     * Se aísla en una función para poder ejecutarla en PARALELO por grupos,
     * que es lo que permite actualizar TODO el catálogo dentro del tiempo límite.
     */
    async function procesarUno(fila: FilaProducto, indice: number): Promise<ResultadoEnriquecimiento> {
      const aliId = idPorFila.get(fila.id)
      const d = aliId ? mapaDetalle.get(aliId) : undefined

      if (!d) {
        notificar({ etapa: 'error', mensaje: `[${indice}/${productos.length}] ${fila.slug}: sin detalle en AliExpress.`, productoId: fila.id, index: indice, total: productos.length })
        return { id: fila.id, slug: fila.slug, nombre: fila.name, actualizado: false, campos: [], error: 'AliExpress no devolvió el detalle de este producto.' }
      }

      // Marca + especificaciones derivadas del TÍTULO real (verificadas
      // literalmente). Se OMITE si el producto ya tiene specs y marca: ahorra
      // tiempo y coste de IA en re-ejecuciones sobre catálogos grandes.
      const tieneSpecs = Object.keys(fila.specifications ?? {}).length > 0
      const necesitaMeta = !tieneSpecs || !fila.marca_id
      let metaData: { marca: string | null; specs: Record<string, string> } = { marca: null, specs: {} }
      if (necesitaMeta) {
        const meta = await extraerMarcaYSpecs(d.titulo ?? fila.name)
        if (meta.success) metaData = meta.data
      }

      let marcaId: string | null = null
      if (!fila.marca_id && metaData.marca) {
        const marca = await obtenerMarcaAliExpress(metaData.marca)
        if (marca.success) marcaId = marca.marcaId
      }

      // Valoración real (best-effort). Solo en ejecuciones ACOTADAS: en modo
      // "todos" se omite porque exige una llamada de búsqueda por producto y no
      // cabría en el tiempo máximo de la función.
      let rating: number | null = null
      if (limite != null) {
        await esperar(ALI_API_MIN_INTERVAL_MS)
        rating = await buscarValoracionPorTitulo(d.titulo, d.ali_product_id)
      }

      const { cambios, campos } = calcularActualizaciones(fila, {
        precioMin: d.precio_min_venta,
        precioOriginal: d.precio_original,
        imagenPrincipal: d.imagen_principal,
        marcaId,
        specs: metaData.specs,
        rating,
      })

      if (campos.length === 0) {
        notificar({ etapa: 'actualizando', mensaje: `[${indice}/${productos.length}] ${fila.slug}: sin cambios.`, productoId: fila.id, index: indice, total: productos.length })
        return { id: fila.id, slug: fila.slug, nombre: fila.name, actualizado: false, campos: [] }
      }

      const { error: updateError } = await supabase.from('products').update(cambios).eq('id', fila.id)
      if (updateError) {
        notificar({ etapa: 'error', mensaje: `[${indice}/${productos.length}] Fallo en ${fila.slug}: ${updateError.message}`, productoId: fila.id, index: indice, total: productos.length })
        return { id: fila.id, slug: fila.slug, nombre: fila.name, actualizado: false, campos: [], error: updateError.message }
      }

      // Precio/imagen cambiaron: se revalida la ficha y el sitemap.
      revalidarSitemap({ productoSlug: fila.slug })
      notificar({
        etapa: 'actualizando',
        mensaje: `[${indice}/${productos.length}] ${fila.slug}: actualizado (${campos.join(', ')}).`,
        productoId: fila.id,
        index: indice,
        total: productos.length,
      })
      return { id: fila.id, slug: fila.slug, nombre: fila.name, actualizado: true, campos }
    }

    // Procesamiento en PARALELO por grupos: la IA por producto es lo más lento,
    // así que se resuelven ALI_ENRICH_CONCURRENCY a la vez para que el catálogo
    // completo entre en el tiempo máximo de la función.
    for (let i = 0; i < productos.length; i += ALI_ENRICH_CONCURRENCY) {
      const grupo = productos.slice(i, i + ALI_ENRICH_CONCURRENCY)
      const parciales = await Promise.all(grupo.map((fila, j) => procesarUno(fila, i + j + 1)))
      resultados.push(...parciales)
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

