import { buscarProductosMasVendidos, generarEnlaceAfiliado } from '@/services/aliApi'
import { scrapearProductoAliExpress } from '@/services/aliScraper'
import {
  existeProductoAliExpress,
  insertAutomatedProduct,
  obtenerCategoriaAliExpress,
  obtenerMarcaAliExpress,
} from '@/services/aliProducts'
import { generateSeoContent } from '@/services/seo-content'
import { existeTituloSimilar } from '@/services/seoDedupe'
import { generateHubContent } from '@/services/seo-hub'
import { getCategorySeo, updateCategorySeo, slugify } from '@/services/catalog'
// Traducción del nicho (idiomas soportados) hacia categories.*_i18n.
import { traducirCategoria } from '@/services/i18n-translate'
import type { SeoFaqItem } from '@/lib/seo-types'
import type { ProductInput } from '@/services/catalog'
import { ALI_PIPELINE_MAX_PRODUCTS } from '@/lib/constants'

/**
 * Pipeline maestro de automatizacion AliExpress (Fase 2.2).
 * Une descubrimiento por API, filtrado anti-duplicados, scraper,
 * enlace de afiliado, SEO con DeepSeek y persistencia en Supabase.
 */

export type EtapaPipeline =
  | 'descubriendo'
  | 'filtrado'
  | 'extrayendo'
  | 'generando_enlace'
  | 'procesando_seo'
  | 'traduciendo'
  | 'guardando'
  | 'completado'
  | 'error'

export type NotificacionPipeline = {
  etapa: EtapaPipeline
  mensaje: string
  productoId?: string | null
  index?: number
  total?: number
}

type ResultadoProductoPipeline = {
  aliasImagenTitulo: string
  aliProductId: string
  tituloGabriel: string
  guardado: boolean
  error?: string | null
  slug?: string | null
}

function construirProductInput(params: {
  tituloSeo: string
  slugSeo: string
  descripcionHtml: string
  precioMinimo: number
  precioMaximo: number | null
  enlaceAfiliado: string
  aliProductId: string
  specs: Record<string, string>
  imagenes: { color: string | null; url: string }[]
  categoriaId: string
  /** ID de la marca resuelta (FK products.marca_id). Null = sin marca. */
  marcaId?: string | null
  /** FAQ estructurada generada por la IA (schema FAQPage). */
  seoFaq: SeoFaqItem[]
  /** Palabras clave long-tail objetivo. */
  seoKeywords: string[]
}): ProductInput {
  const colores = [...new Set(params.imagenes.map((i) => i.color).filter(Boolean) as string[])]
  const imagenesGenerales = params.imagenes.filter((i) => !i.color).map((i) => i.url)
  const imagenesConColor = params.imagenes
    .filter((i) => i.color)
    .map((i) => ({ color_name: i.color!, url: i.url }))

  return {
    name: params.tituloSeo,
    slug: params.slugSeo,
    description: params.descripcionHtml,
    price_usd: Number(params.precioMinimo) || 0,
    precio_original: params.precioMaximo ?? null,
    stock: 50,
    costo_inicial: (Number(params.precioMinimo) || 0) * 0.5,
    category_ids: [params.categoriaId],
    marca_id: params.marcaId ?? null,
    images: imagenesGenerales,
    colorImages: imagenesConColor,
    colors: colores,
    specifications: params.specs,
    url_afiliado_ali: params.enlaceAfiliado,
    asin: params.aliProductId,
    titulo_seo: params.tituloSeo,
    indexado_google: true,
    is_available: true,
    peso: params.specs['Peso del producto'] ?? params.specs['Peso'] ?? null,
    tamaño: params.specs['Tamaño'] ?? params.specs['Dimensiones'] ?? null,
    // Contenido SEO estructurado generado por DeepSeek (0047).
    seo_faq: params.seoFaq,
    seo_keywords: params.seoKeywords,
  }
}

async function procesarUnProducto(params: {
  urlProducto: string
  aliProductId: string
  tituloFabrica: string
  categoriaId: string
  /** Precio minimo ya devuelto por la API oficial (fuente autoritativa). */
  precioApiMin?: number | null
  /** Precio maximo (rango) devuelto por la API oficial. */
  precioApiMax?: number | null
  /** Imagen principal devuelta por la API (fallback si el scraper no da galería). */
  imagenPrincipal?: string | null
  /**
   * Enlace de afiliado YA generado por la API de búsqueda (s.click.aliexpress.com).
   * La API `product.query` lo devuelve listo por producto, así que NO hace falta
   * llamar a `link.generate` (que en esta cuenta responde 405 "result is empty").
   */
  promotionLink?: string | null
  /** Marca detectada por la API oficial (fuente autoritativa si viene). */
  marcaApi?: string | null
  /** Keyword del nicho (orienta el título SEO y el anti-duplicado). */
  keyword?: string
}): Promise<{ data?: { slug?: string; id?: string }; error?: string }> {
  try {
    // 1) Extraccion fria via scraper (sin IA): titulo, precio, specs e imagenes.
    // Si el scraper falla (CAPTCHA/cambio de estructura) NO abortamos el
    // producto: degradamos con el titulo y precio que ya trae la API oficial.
    const scrape = await scrapearProductoAliExpress(params.urlProducto)
    const dataScraper = scrape.success && scrape.data ? scrape.data : null

    // MARCA: la API oficial (product.query) es la fuente AUTORITATIVA cuando
    // trae el campo brand; si no, usamos la marca que detectó el scraper en el
    // HTML (runParams/DOM). Se resuelve/crea en la tabla `marcas` para que el
    // producto quede filtrable por marca en el catálogo público.
    const marcaNombre = params.marcaApi || dataScraper?.marca || null
    const marcaResuelta = await obtenerMarcaAliExpress(marcaNombre)
    // Si resolver la marca falla (red/DB), NO abortamos el producto: se guarda
    // sin marca (marca_id null) y se registra el fallo en consola.
    if (!marcaResuelta.success) {
      console.error('[aliPipeline] No se pudo resolver la marca "' + (marcaNombre ?? '') + '":', marcaResuelta.error)
    }
    const marcaId = marcaResuelta.success ? marcaResuelta.marcaId : null

    // El precio de la API oficial (product.query) es la fuente AUTORITATIVA y
    // SIEMPRE disponible. El scraper NO se usa para el precio porque el plan
    // gratis de ZenRows devuelve la pagina ANTES de que AliExpress cargue el
    // precio (via XHR), asi que el scraper casi nunca logra extraerlo y el
    // resultado es inconsistente. La API devuelve el precio en EUR (porque
    // pedimos target_currency='EUR'), que es el valor que el usuario quiere
    // ver en su tienda. Solo si la API no trae precio (producto raro) usamos
    // el del scraper como ultimo recurso para no perder el producto.
    const precioMin = params.precioApiMin ?? dataScraper?.precio_base?.minimo ?? 0
    const precioMax = params.precioApiMax ?? dataScraper?.precio_base?.maximo ?? null
    if (!precioMin || precioMin <= 0) {
      return { error: 'El producto no tiene precio (ni API ni scraper).' }
    }

    // Titulo: la API oficial (product.query) es la fuente AUTORITATIVA y real
    // del producto. El scraper puede devolver un titulo generico ("Aliexpress")
    // o fallar, asi que SOLO usamos el del scraper si la API no trae titulo.
    const tituloFinal = params.tituloFabrica || dataScraper?.titulo_original || ''
    const specsFinal = dataScraper?.metadatos_fisicos ?? {}
    // Galeria: si el scraper no logro extraer imagenes (AliExpress bloquea
    // proxies), usamos la imagen principal que ya trae la API oficial.
    const imagenesScraper = dataScraper?.galeria_imagenes ?? []
    const imagenesFinal =
      imagenesScraper.length > 0
        ? imagenesScraper
        : params.imagenPrincipal
          ? [{ color: null, url: params.imagenPrincipal }]
          : []

    // 2) Enlace de afiliado oficial con tracking ID.
    // La API `product.query` ya devuelve el promotion_link listo por producto
    // (s.click.aliexpress.com). Lo usamos DIRECTAMENTE para no depender de
    // `link.generate`, que en esta cuenta responde 405 "result is empty".
    // Solo si el producto NO trae promotion_link (ej: URL scrapeada a mano)
    // intentamos generarlo con `link.generate` como respaldo.
    let enlaceLargo = params.promotionLink || ''
    if (!enlaceLargo) {
      const enlace = await generarEnlaceAfiliado(params.urlProducto)
      if (!enlace.success || !enlace.data) {
        return { error: enlace.error ?? 'No se pudo generar enlace afiliado.' }
      }
      enlaceLargo = enlace.data.enlace_largo || enlace.data.enlace_corto || ''
    }
    if (!enlaceLargo) {
      return { error: 'No se obtuvo un enlace de afiliado para este producto.' }
    }

    // 3) Cerebro SEO: DeepSeek traduce el titulo y genera HTML + FAQ + keywords.
    // Anti-duplicado: si ya hay un producto con título similar, se le pasan al
    // modelo para forzar un título diferenciado (evita contenido duplicado).
    const similares = await existeTituloSimilar(tituloFinal)
    const evitarTitulos = similares.success && similares.tituloSimilar ? [similares.tituloSimilar] : []
    const seo = await generateSeoContent({
      nombre: tituloFinal,
      marca: marcaNombre ?? undefined,
      keyword: params.keyword,
      crudo: JSON.stringify({
        titulo_fabrica: tituloFinal,
        precio: dataScraper?.precio_base?.texto_original ?? null,
        specs: specsFinal,
      }),
      specs: specsFinal,
      evitarTitulos,
    })
    if (!seo.success || !seo.data) {
      return { error: seo.error ?? 'DeepSeek no devolvio SEO.' }
    }

    // 4) Payload tipado listo para insertar.
    const input = construirProductInput({
      tituloSeo: seo.data.titulo_seo,
      slugSeo: seo.data.slug + '-' + params.aliProductId.slice(-6),
      descripcionHtml: seo.data.descripcion_html,
      precioMinimo: precioMin,
      precioMaximo: precioMax,
      enlaceAfiliado: enlaceLargo || params.urlProducto,
      aliProductId: params.aliProductId,
      specs: specsFinal,
      imagenes: imagenesFinal,
      categoriaId: params.categoriaId,
      // Marca resuelta (FK products.marca_id). Null si no se detectó ninguna.
      marcaId,
      // Contenido SEO estructurado (schema FAQPage + enlazado interno).
      seoFaq: seo.data.faq,
      seoKeywords: seo.data.keywords,
    })

    // 5) Persistencia final en Supabase.
    const guardado = await insertAutomatedProduct(input)
    if (!guardado.success) {
      return { error: guardado.error ?? 'No se pudo guardar en Supabase.' }
    }
    const productoGuardado = guardado.data as { slug?: string; id?: string } | undefined
    return { data: { slug: productoGuardado?.slug, id: productoGuardado?.id } }
  } catch (error: any) {
    console.error('[aliPipeline] procesarUnProducto:', error?.message)
    return { error: error?.message ?? 'Error inesperado procesando producto.' }
  }
}

export async function ejecutarPipelineAutomatizacion(
  keyword: string,
  notificar: (n: NotificacionPipeline) => void,
) {
  const resultados: ResultadoProductoPipeline[] = []
  const palabra = (keyword || '').trim()
  if (!palabra) {
    notificar({ etapa: 'error', mensaje: 'La keyword es obligatoria.' })
    return { success: false as const, error: 'La keyword es obligatoria.' }
  }

  try {
    // 1) Descubrimiento por keyword via API oficial (mas vendidos).
    notificar({ etapa: 'descubriendo', mensaje: 'Buscando productos top de "' + palabra + '" por volumen de ventas...' })
    const descubrimiento = await buscarProductosMasVendidos(palabra, 1, 'volume_desc')
    // Si la API fallo, devolvemos el error descriptivo de inmediato.
    if (!descubrimiento.success) {
      const mensajeError = descubrimiento.error ?? 'Sin productos devueltos.'
      notificar({ etapa: 'error', mensaje: mensajeError })
      return { success: false as const, error: mensajeError }
    }
    // Si la API respondio OK pero sin resultados, mostramos el diagnostico
    // (claves de la respuesta cruda) para poder depurar el "envelope".
    if (!descubrimiento.data || descubrimiento.data.length === 0) {
      const diagnostico = (descubrimiento as any).diagnostico
      const mensajeVacio = diagnostico
        ? 'AliExpress no devolvio productos. ' + diagnostico
        : 'AliExpress no devolvio productos para "' + palabra + '".'
      notificar({ etapa: 'error', mensaje: mensajeVacio })
      return { success: false as const, error: mensajeVacio }
    }

    const disponibles = descubrimiento.data.slice(0, ALI_PIPELINE_MAX_PRODUCTS)
    notificar({ etapa: 'filtrado', mensaje: disponibles.length + ' candidatos encontrados. Verificando duplicados...' })

    // 2) Resolver categoria del nicho (derivada de la keyword) para los
    // productos nuevos. Asi cada lote queda en una categoria real y filtrable
    // en el catalogo publico (relacion N:N via product_categories).
    const categoria = await obtenerCategoriaAliExpress(palabra)
    if (!categoria.success || !categoria.categoriaId) {
      notificar({ etapa: 'error', mensaje: 'No se pudo resolver la categoria.' })
      return { success: false as const, error: categoria.error ?? 'Sin categoria.' }
    }

    // 2.1) Contenido del HUB de la categoria (pSEO): se genera UNA vez por
    // nicho si aún no tiene intro editorial. Convierte el listado plano en
    // una "categoria de nicho" con guía de compra y FAQ (retiene + rankea).
    try {
      const seoHubActual = await getCategorySeo(categoria.categoriaId)
      if (!seoHubActual.data?.seo_intro) {
        notificar({ etapa: 'procesando_seo', mensaje: 'Generando contenido de la categoria (hub)...' })
        const hub = await generateHubContent(categoria.nombre ?? palabra)
        if (hub.success) {
          await updateCategorySeo(
            categoria.categoriaId,
            {
              seo_title: hub.data.seo_title,
              seo_intro: hub.data.seo_intro,
              seo_faq: hub.data.seo_faq,
            },
            // Revalida la landing del hub + sitemap al instante.
            { slug: slugify(categoria.nombre ?? palabra) },
          )
        } else {
          console.error('[aliPipeline] hub SEO:', hub.error)
        }
      }
    } catch (err: any) {
      // Un fallo del hub NO debe abortar la carga de productos.
      console.error('[aliPipeline] hub SEO inesperado:', err?.message)
    }

    // 2.2) Traducciones del nicho (i18n): completa los idiomas que falten para
    // que la landing exista en todos los idiomas soportados. Es idempotente y
    // de coste cero si ya está traducido. Un fallo aquí NO aborta el pipeline
    // (la categoría queda en su idioma raíz y el backfill puede reintentar).
    try {
      notificar({ etapa: 'traduciendo', mensaje: 'Traduciendo el nicho a los idiomas soportados...' })
      const traduccion = await traducirCategoria(categoria.categoriaId)
      if (traduccion.success) {
        if (traduccion.data.traducidos.length > 0) {
          notificar({
            etapa: 'traduciendo',
            mensaje: 'Nicho traducido: ' + traduccion.data.traducidos.join(', ') + '.',
          })
        }
      } else {
        console.error('[aliPipeline] i18n:', traduccion.error)
      }
    } catch (err: any) {
      console.error('[aliPipeline] i18n inesperado:', err?.message)
    }

    // Filtrar duplicados en Supabase.
    const pendientes: typeof disponibles = []
    for (const item of disponibles) {
      const duplicado = await existeProductoAliExpress(item.ali_product_id)
      if (duplicado.success && !duplicado.existe) pendientes.push(item)
    }
    if (pendientes.length === 0) {
      notificar({ etapa: 'completado', mensaje: 'Todos los productos ya existen. Sin novedades.' })
      return { success: true as const, data: resultados }
    }

    const lote = pendientes.slice(0, 5)
    notificar({ etapa: 'extrayendo', mensaje: lote.length + ' productos nuevos por procesar.', total: lote.length })

    // 3) Por cada nuevo: scrape + enlace + SEO + guardado.
    for (let i = 0; i < lote.length; i += 1) {
      const itemProducto = lote[i]
      const urlProductoFinal =
        itemProducto.url_producto || 'https://www.aliexpress.com/item/' + itemProducto.ali_product_id + '.html'
      const indiceActual = i + 1

      notificar({
        etapa: 'extrayendo',
        mensaje: '[' + indiceActual + '/' + lote.length + '] Extrayendo producto ' + itemProducto.ali_product_id + '...',
        productoId: itemProducto.ali_product_id,
        index: indiceActual,
        total: lote.length,
      })

      const resultado = await procesarUnProducto({
        urlProducto: urlProductoFinal,
        aliProductId: itemProducto.ali_product_id,
        tituloFabrica: itemProducto.titulo_fabrica,
        categoriaId: categoria.categoriaId,
        // El precio de la API oficial es la fuente autoritativa; el scraper
        // solo complementa specs/imagenes/colores. Asi nunca falla por precio.
        precioApiMin: itemProducto.precio_min_venta,
        precioApiMax: itemProducto.precio_max_venta,
        // Imagen principal de la API como fallback si el scraper no da galeria.
        imagenPrincipal: itemProducto.imagen_principal,
        // Enlace de afiliado YA generado por la API de búsqueda (evita link.generate).
        promotionLink: itemProducto.promotion_link,
        // Marca detectada por la API oficial (fuente autoritativa si viene).
        marcaApi: itemProducto.marca,
        // Keyword del nicho (orienta título SEO + anti-duplicado).
        keyword: palabra,
      })

      if (resultado.error) {
        resultados.push({
          aliasImagenTitulo: itemProducto.titulo_fabrica,
          aliProductId: itemProducto.ali_product_id,
          tituloGabriel: '',
          guardado: false,
          error: resultado.error,
        })
        notificar({
          etapa: 'error',
          mensaje: '[' + indiceActual + '/' + lote.length + '] Fallo en ' + itemProducto.ali_product_id + ': ' + resultado.error,
          productoId: itemProducto.ali_product_id,
          index: indiceActual,
          total: lote.length,
        })
        continue
      }

      resultados.push({
        aliasImagenTitulo: itemProducto.titulo_fabrica,
        aliProductId: itemProducto.ali_product_id,
        tituloGabriel: resultado.data?.slug ?? '',
        guardado: true,
        slug: resultado.data?.slug,
      })
      notificar({
        etapa: 'guardando',
        mensaje: '[' + indiceActual + '/' + lote.length + '] Guardado con exito: ' + (resultado.data?.slug ?? itemProducto.ali_product_id),
        productoId: itemProducto.ali_product_id,
        index: indiceActual,
        total: lote.length,
      })
    }

    const totalExitos = resultados.filter((r) => r.guardado).length
    notificar({
      etapa: 'completado',
      mensaje: 'Pipeline finalizado: ' + totalExitos + ' productos guardados de ' + resultados.length + ' procesados.',
    })
    return { success: true as const, data: resultados }
  } catch (error: any) {
    console.error('[aliPipeline] ejecutarPipelineAutomatizacion:', error?.message)
    notificar({ etapa: 'error', mensaje: error?.message ?? 'Error fatal del pipeline.' })
    return { success: false as const, error: error?.message ?? 'Error fatal del pipeline.' }
  }
}
