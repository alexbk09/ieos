import { buscarProductosMasVendidos, generarEnlaceAfiliado } from '@/services/aliApi'
import { scrapearProductoAliExpress } from '@/services/aliScraper'
import {
  existeProductoAliExpress,
  insertAutomatedProduct,
  obtenerCategoriaAliExpress,
} from '@/services/aliProducts'
import { generateSeoContent } from '@/services/seo-content'
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
  }
}

async function procesarUnProducto(params: {
  urlProducto: string
  aliProductId: string
  tituloFabrica: string
  categoriaId: string
}): Promise<{ data?: { slug?: string; id?: string }; error?: string }> {
  try {
    // 1) Extraccion fria via scraper (sin IA): titulo, precio, specs e imagenes.
    const scrape = await scrapearProductoAliExpress(params.urlProducto)
    if (!scrape.success || !scrape.data) {
      return { error: scrape.error ?? 'Error al scrapear el detalle.' }
    }
    const dataScraper = scrape.data
    const precioMin = dataScraper.precio_base?.minimo ?? 0
    const precioMax = dataScraper.precio_base?.maximo ?? null
    if (!precioMin || precioMin <= 0) {
      return { error: 'El producto scrapeado no tiene precio.' }
    }

    // 2) Enlace de afiliado oficial con tracking ID.
    const enlace = await generarEnlaceAfiliado(params.urlProducto)
    if (!enlace.success || !enlace.data) {
      return { error: enlace.error ?? 'No se pudo generar enlace afiliado.' }
    }

    // 3) Cerebro SEO: DeepSeek traduce el titulo y genera HTML + FAQ.
    const seo = await generateSeoContent({
      nombre: dataScraper.titulo_original ?? params.tituloFabrica,
      crudo: JSON.stringify({
        titulo_fabrica: dataScraper.titulo_original ?? params.tituloFabrica,
        precio: dataScraper.precio_base?.texto_original ?? null,
        specs: dataScraper.metadatos_fisicos ?? {},
      }),
      specs: dataScraper.metadatos_fisicos,
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
      enlaceAfiliado: enlace.data.enlace_largo || enlace.data.enlace_corto || params.urlProducto,
      aliProductId: params.aliProductId,
      specs: dataScraper.metadatos_fisicos,
      imagenes: dataScraper.galeria_imagenes,
      categoriaId: params.categoriaId,
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

    // 2) Resolver categoria para los productos nuevos.
    const categoria = await obtenerCategoriaAliExpress()
    if (!categoria.success || !categoria.categoriaId) {
      notificar({ etapa: 'error', mensaje: 'No se pudo resolver la categoria.' })
      return { success: false as const, error: categoria.error ?? 'Sin categoria.' }
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
