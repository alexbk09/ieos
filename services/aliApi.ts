import CryptoJS from 'crypto-js'

/**
 * Servicio de la API oficial de AliExpress Open Platform (Fase 2.2).
 * ------------------------------------------------------------------
 * Responsabilidad exclusiva: comunicarse con los endpoints REST oficiales
 * de AliExpress para descubrir productos mejor vendidos por keyword y
 * generar enlaces de afiliado oficiales con tracking ID.
 *
 * Requerido en .env:
 *   ALI_APP_KEY    -> App Key de tu aplicación AliExpress Open Platform
 *   ALI_APP_SECRET -> App Secret de tu aplicación (firma HMAC-SHA256)
 *   ALI_TRACKING_ID-> ID de seguimiento de tus enlaces (AliExpress Union)
 *   ALI_LOCALE     -> 'es_ES' (idioma español) por defecto
 *
 * Reglas de oro:
 *  - Capa de abstracción pura (NO llama Supabase ni React).
 *  - Contrato { success: true, data } | { success: false, error }.
 *  - Las llaves NUNCA se exponen al cliente: consumido por API routes server.
 */

import {
  ALIEXPRESS_OPEN_API_ENDPOINT,
  ALI_SEARCH_METHOD,
  ALI_LINK_METHOD,
  ALI_DETAIL_METHOD,
  ALI_BRAND_FIELD_CANDIDATES,
  ALI_TARGET_CURRENCY,
  ALI_SHIP_TO_COUNTRY,
} from '@/lib/constants'

// ---------- Tipos ----------

export type AliProductoBuscado = {
  /** ID numérico largo del producto AliExpress. */
  ali_product_id: string
  /** Título tal cual devuelve la API (sin traducir). */
  titulo_fabrica: string
  /** Marca del producto si la API la expone (ej: "Xiaomi"). Null si no viene. */
  marca: string | null
  /** URL oficial del producto (para scrapear detalle). */
  url_producto: string
  /** URL de la imagen principal del producto (CDN de AliExpress). */
  imagen_principal: string | null
  /** Precio base inferior visible en USD (string crudo de Ali). */
  precio_min_venta: number | null
  /** Precio base superior (rango) en USD o null si no hay rango. */
  precio_max_venta: number | null
  /** Porcentaje de comisión del afiliado. */
  comision_porcentaje: number | null
  /** Volumen de ventas reportado por AliExpress (`lastest_volume`). Null si no viene. */
  ventas_recientes: number | null
  /**
   * Valoración positiva del producto tal cual la reporta AliExpress
   * (`evaluate_rate`, ej: "97.6%"). Se normaliza con lib/reviews.mjs.
   * Null si la API no la expone.
   */
  rating_porcentaje: string | null
  /**
   * Número de valoraciones/opiniones reportado por la API (si lo expone).
   * Es lo que hace HONESTA la emisión de AggregateRating en el schema.
   */
  rating_count: number | null
  /**
   * Enlace de afiliado YA generado por la API de búsqueda (s.click.aliexpress.com).
   * La API `product.query` devuelve el promotion_link listo por producto, así
   * que NO hace falta llamar a `link.generate` para estos productos.
   */
  promotion_link: string | null
}

export type AliEnlaceAfiliado = {
  /** URL de afiliado larga con tracking (lista). */
  enlace_largo: string
  /** URL de afiliado corta si la API devuelve shortlink. */
  enlace_corto: string | null
  /** Tracking ID usado en la generación. */
  tracking_id: string
}

// Credenciales centralizadas (solo servidor).
const ALI_APP_KEY = process.env.ALI_APP_KEY?.trim() || ''
const ALI_APP_SECRET = process.env.ALI_APP_SECRET?.trim() || ''
const ALI_TRACKING_ID = process.env.ALI_TRACKING_ID?.trim() || ''
const ALI_LOCALE = process.env.ALI_LOCALE?.trim() || 'es_ES'

/** Valida credenciales y devuelve error descriptivo si faltan. */
function validarCredenciales(): string | null {
  if (!ALI_APP_KEY) return 'Falta ALI_APP_KEY en el .env del servidor.'
  if (!ALI_APP_SECRET) return 'Falta ALI_APP_SECRET en el .env del servidor.'
  if (!ALI_TRACKING_ID) return 'Falta ALI_TRACKING_ID (de AliExpress Union).'
  return null
}

/**
 * Devuelve el primer valor con contenido entre una lista de claves candidatas.
 * POR QUÉ: el "envelope" de AliExpress cambia entre versiones y la marca puede
 * venir como `brand`, `brand_name` o `brandName`; así no dependemos de una ruta
 * fija y evitamos perder el dato si el API lo renombra.
 */
function primerTextoConValor(fuente: any, claves: readonly string[]): string | null {
  if (!fuente || typeof fuente !== 'object') return null
  for (const clave of claves) {
    const valor = fuente[clave]
    if (valor === undefined || valor === null) continue
    const texto = String(valor).trim()
    if (texto) return texto
  }
  return null
}

/**
 * Construye la firma HMAC-SHA256 que AliExpress exige en cada petición.
 * 1) Ordena alfabéticamente los parámetros incluidos en la firma.
 * 2) Arma "app_key..." con valores concatenados sin separador (formato Ali).
 * 3) Calcula HMAC-SHA256 con el app secret.
 */
function generarFirma(paramsOrdenados: Record<string, string | number>): string {
  const cadenaFirma = Object.keys(paramsOrdenados)
    .sort()
    .map((clave) => `${clave}${paramsOrdenados[clave]}`)
    .join('')
  return CryptoJS.HmacSHA256(cadenaFirma, ALI_APP_SECRET).toString(CryptoJS.enc.Hex).toUpperCase()
}

/**
 * Ejecuta una petición GET firmada a una BUSINESS API de AliExpress Open
 * Platform. Según la documentación oficial, las business APIs (afiliado)
 * se llaman así:
 *
 *   https://api-sg.aliexpress.com/sync?method={api_path}&{query}
 *
 *  - El método viaja en el query como parámetro "method".
 *  - Parámetros de sistema: app_key, timestamp (yyyy-MM-dd HH:mm:ss),
 *    sign_method=sha256, sign, format=json, v=2.0.
 *  - La firma se calcula sobre TODOS los parámetros (sistema + negocio,
 *    incluido "method") ordenados alfabéticamente y concatenados "clavevalor".
 *  - Todo se envía en la query string de la URL (GET).
 */
async function llamarApiAliExpress(
  metodo: string,
  parametrosSinSistema: Record<string, string | number>,
) {
  const errorCredenciales = validarCredenciales()
  if (errorCredenciales) return { success: false as const, error: errorCredenciales }

  // Timestamp en el formato clásico que exige la business API /sync:
  // yyyy-MM-dd HH:mm:ss (ej: 2024-01-01 12:00:00).
  const ahora = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timestamp = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`

  const paramsBase: Record<string, string | number> = {
    app_key: ALI_APP_KEY,
    timestamp,
    sign_method: 'sha256',
    // El método es parte de la firma y viaja en el query.
    method: metodo,
    format: 'json',
    v: '2.0',
    ...parametrosSinSistema,
  }

  const firma = generarFirma(paramsBase)
  // URLSearchParams exige valores string: convertimos cada valor a texto.
  const paramsComoTexto: Record<string, string> = Object.fromEntries(
    Object.entries(paramsBase).map(([clave, valor]) => [clave, String(valor)]),
  )
  const query = new URLSearchParams({ ...paramsComoTexto, sign: firma })
  const urlCompleta = `${ALIEXPRESS_OPEN_API_ENDPOINT}?${query.toString()}`

  try {
    const respuesta = await fetch(urlCompleta, {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })

    if (!respuesta.ok) {
      return { success: false as const, error: `AliExpress API HTTP ${respuesta.status}.` }
    }

    const datos = (await respuesta.json()) as any
    // Formato de error ANTIGUO: la API envuelve el fallo en error_response.
    if (datos?.error_response) {
      const msg = datos.error_response.msg || datos.error_response.sub_msg || 'Error desconocido de AliExpress.'
      console.error('[aliApi] error_response:', JSON.stringify(datos.error_response))
      return { success: false as const, error: `AliExpress API: ${msg}` }
    }
    // Formato de error NUEVO (open.aliexpress.com): responde HTTP 200 con un
    // cuerpo { type, code, message, request_id, _trace_id_ } en vez de datos.
    // Si no hay "code" de éxito (200) y viene "message", es un error real.
    if (datos && typeof datos === 'object' && datos.code !== undefined && datos.code !== 200 && datos.code !== '200') {
      const msg = datos.message || datos.msg || `Código de error ${datos.code}.`
      console.error('[aliApi] error nuevo formato:', JSON.stringify(datos))
      return { success: false as const, error: `AliExpress API: ${msg}` }
    }

    return { success: true as const, data: datos }
  } catch (error: any) {
    console.error('[aliApi] llamarApiAliExpress:', error?.message)
    return { success: false as const, error: error?.message ?? 'Error de red al llamar AliExpress API.' }
  }
}

/**
 * Busca productos de AliExpress ordenados por volumen de ventas o comisión.
 * @param keyword Término semilla (ej: 'tira led rgb').
 * @param page Página de resultados (1-based).
 * @param sort Orden: 'volume_desc' (más vendidos) o 'commission_desc' (mejor comisión).
 */
export async function buscarProductosMasVendidos(
  keyword: string,
  page = 1,
  sort: 'volume_desc' | 'commission_desc' = 'volume_desc',
) {
  const palabra = (keyword || '').trim()
  if (!palabra) return { success: false as const, error: 'La keyword es obligatoria.' }

  const resultado = await llamarApiAliExpress(ALI_SEARCH_METHOD, {
    // Campo de texto libre de la búsqueda.
    keywords: palabra,
    page_no: String(Math.max(page, 1)),
    page_size: '20',
    sort,
    // Moneda en la que la API devuelve los precios. El usuario quiere que los
    // productos de AliExpress muestren el precio en EUROS (igual que ve en su
    // navegador), así que pedimos los precios directamente en EUR a la API.
    // Asi el valor numerico que guardamos coincide con el 9,29€ que muestra
    // AliExpress, sin depender de conversiones manuales USD->EUR.
    target_currency: 'EUR',
    target_language: ALI_LOCALE,
    tracking_id: ALI_TRACKING_ID,
  })

  if (!resultado.success) return resultado

  // La API puede devolver el listado en varias rutas según la versión.
  // Se busca de forma defensiva en cualquier nivel del JSON de respuesta.
  const productosCrudos = extraerProductosDeRespuesta(resultado.data)

  const productos: AliProductoBuscado[] = (Array.isArray(productosCrudos)
    ? productosCrudos
    : [productosCrudos]
  ).map((p: any) => {
    const precioTarget = p?.target_sale_price ?? p?.sale_price ?? p?.app_sale_price
    const precioTargetAlto = p?.target_sale_price_high ?? p?.app_sale_price_high
    return {
      ali_product_id: String(p?.product_id ?? p?.productId ?? ''),
      titulo_fabrica: String(p?.product_title ?? p?.productTitle ?? ''),
      // Marca del producto: la API puede exponerla con distintas claves según
      // la versión (`brand`, `brand_name`, `brandName`). Si no viene ninguna,
      // el pipeline cae a la marca detectada por el scraper (o queda sin marca).
      marca: primerTextoConValor(p, ALI_BRAND_FIELD_CANDIDATES),
      url_producto: String(p?.product_detail_url ?? p?.productDetailUrl ?? ''),
      // Imagen principal del producto (CDN). Sirve de fallback cuando el
      // scraper no logra extraer la galería (AliExpress bloquea proxies).
      imagen_principal: String(p?.product_main_image_url ?? p?.image_url ?? '') || null,
      precio_min_venta: precioTarget != null ? Number(precioTarget) : null,
      precio_max_venta: precioTargetAlto != null ? Number(precioTargetAlto) : null,
      comision_porcentaje: Number(p?.commission_rate ?? p?.commissionRate ?? 0) || null,
      // Volumen de ventas real de AliExpress (`lastest_volume`). Antes se mapeaba
      // por error `sale_price` (un PRECIO) en este campo de ventas.
      ventas_recientes: Number(p?.lastest_volume ?? p?.lastestVolume ?? 0) || null,
      // Valoración positiva real (ej: "97.6%"). Alimenta products.rating_average.
      rating_porcentaje: primerTextoConValor(p, ['evaluate_rate', 'evaluateRate']),
      // Nº de valoraciones reportado (si el API lo expone). Habilita el
      // AggregateRating del schema solo cuando el dato es real.
      rating_count: Number(
        primerTextoConValor(p, ['total_valid_num', 'totalValidNum', 'review_count', 'reviewCount', 'evaluate_count']) ?? 0,
      ) || null,
      // La API de búsqueda ya devuelve el promotion_link listo por producto.
      promotion_link: String(p?.promotion_link ?? '') || null,
    }
  })

  // Diagnóstico (BK-0): registra UNA vez las claves reales del primer producto
  // para confirmar qué campos expone hoy la cuenta (brand, evaluate_rate,
  // lastest_volume, etc.) sin exponer datos sensibles.
  if (productosCrudos.length > 0) {
    const primerProducto = productosCrudos[0]
    if (primerProducto && typeof primerProducto === 'object') {
      console.info('[aliApi] Campos disponibles en product.query:', Object.keys(primerProducto).join(', '))
    }
  }

  const productosValidos = productos.filter((x) => x.ali_product_id)

  // Si AliExpress respondió OK pero sin productos, adjuntamos un diagnóstico
  // con las claves de la respuesta cruda para poder depurar el "envelope".
  if (productosValidos.length === 0) {
    const clavesRespuesta = Object.keys(resultado.data ?? {})
    console.error('[aliApi] Respuesta sin productos. Claves:', JSON.stringify(clavesRespuesta))
    console.error('[aliApi] Respuesta cruda:', JSON.stringify(resultado.data)?.slice(0, 800))
    return {
      success: true as const,
      data: [],
      diagnostico: `AliExpress respondió OK pero sin productos. Claves de la respuesta: ${clavesRespuesta.join(', ') || '(vacío)'}`,
    }
  }

  return { success: true as const, data: productosValidos }
}

/** Detalle enriquecido de un producto obtenido por ID (precio, imágenes, ventas). */
export type AliProductoDetalle = {
  ali_product_id: string
  /** Precio de venta actual (el más bajo) en la moneda objetivo. */
  precio_min_venta: number | null
  /** Precio original/referencia (tachado), si lo hay. */
  precio_original: number | null
  /** Imagen principal vigente. */
  imagen_principal: string | null
  /** Galería de imágenes vigente (CDN). */
  imagenes: string[]
  /** Título real actual del producto. */
  titulo: string | null
  /** Volumen de ventas reportado. */
  ventas_recientes: number | null
}

/** Localiza el array de productos dentro del "envelope" de productdetail.get. */
function extraerProductosDetalle(nodo: any, profundidad = 0): any[] {
  if (!nodo || typeof nodo !== 'object' || profundidad > 8) return []
  if (Array.isArray(nodo)) return nodo
  // Ruta documentada: resp_result.result.products.product
  const candidato = nodo?.resp_result?.result?.products?.product
  if (Array.isArray(candidato)) return candidato
  if (candidato && typeof candidato === 'object') return [candidato]
  for (const valor of Object.values(nodo)) {
    const hallado = extraerProductosDetalle(valor, profundidad + 1)
    if (hallado.length > 0) return hallado
  }
  return []
}

/**
 * Obtiene el DETALLE actualizado de varios productos por su ID en UNA sola
 * llamada a `aliexpress.affiliate.productdetail.get` (precio, imágenes, ventas).
 * Es la fuente FIABLE para el re-enriquecimiento: a diferencia del scraper (que
 * devuelve el HTML sin `runParams`), esta API sí entrega datos reales.
 *
 * ⚠️ La API limita la frecuencia (~1 llamada/seg): el llamador debe espaciar
 * los lotes.
 *
 * @param ids IDs de producto AliExpress (se limpian a dígitos).
 */
export async function obtenerDetalleProductosPorIds(ids: string[]) {
  const limpios = [...new Set((ids ?? []).map((id) => String(id).replace(/\D/g, '')).filter(Boolean))]
  if (limpios.length === 0) return { success: false as const, error: 'No hay IDs de AliExpress para consultar.' }

  const resultado = await llamarApiAliExpress(ALI_DETAIL_METHOD, {
    product_ids: limpios.join(','),
    tracking_id: ALI_TRACKING_ID,
    target_currency: ALI_TARGET_CURRENCY,
    target_language: ALI_LOCALE,
    ship_to_country: ALI_SHIP_TO_COUNTRY,
  })
  if (!resultado.success) return { success: false as const, error: resultado.error }

  const crudos = extraerProductosDetalle(resultado.data)
  const detalles: AliProductoDetalle[] = crudos
    .map((p: any) => {
      const precioVenta = Number(p?.target_sale_price ?? p?.sale_price ?? p?.app_sale_price ?? 0)
      const precioOriginal = Number(p?.target_original_price ?? p?.original_price ?? 0)
      const galeriaCruda = p?.product_small_image_urls?.string ?? p?.product_small_image_urls ?? []
      const galeria = (Array.isArray(galeriaCruda) ? galeriaCruda : [galeriaCruda])
        .map((u: any) => String(u ?? '').trim())
        .filter(Boolean)
      return {
        ali_product_id: String(p?.product_id ?? '').trim(),
        precio_min_venta: Number.isFinite(precioVenta) && precioVenta > 0 ? precioVenta : null,
        precio_original: Number.isFinite(precioOriginal) && precioOriginal > 0 ? precioOriginal : null,
        imagen_principal: String(p?.product_main_image_url ?? '').trim() || null,
        imagenes: galeria,
        titulo: String(p?.product_title ?? '').trim() || null,
        ventas_recientes: Number(p?.lastest_volume ?? 0) || null,
      }
    })
    .filter((d) => d.ali_product_id)

  if (detalles.length === 0) {
    const claves = Object.keys(resultado.data ?? {})
    return {
      success: false as const,
      error: `AliExpress no devolvió el detalle. Claves: ${claves.join(', ') || '(vacío)'}`,
    }
  }
  return { success: true as const, data: detalles }
}


/**
 * Recorre el JSON de respuesta de AliExpress buscando el array de productos
 * sin depender de una ruta fija. AliExpress cambia el "envelope" según la
 * versión del API, así que se inspecciona recursivamente hasta hallar un
 * array cuyos elementos tengan `product_id` (o `productId`).
 */
function extraerProductosDeRespuesta(nodo: any, profundidad = 0): any[] {
  if (!nodo || typeof nodo !== 'object' || profundidad > 6) return []
  // Si este nodo ya parece un producto, lo devolvemos envuelto en array.
  if (Array.isArray(nodo)) {
    if (nodo.length > 0 && (nodo[0]?.product_id || nodo[0]?.productId)) return nodo
    for (const item of nodo) {
      const hallado = extraerProductosDeRespuesta(item, profundidad + 1)
      if (hallado.length > 0) return hallado
    }
    return []
  }
  // Objeto: revisamos sus valores en busca del array de productos.
  for (const valor of Object.values(nodo)) {
    const hallado = extraerProductosDeRespuesta(valor, profundidad + 1)
    if (hallado.length > 0) return hallado
  }
  return []
}

/**
 * Genera un enlace de afiliado oficial de AliExpress para una URL dada.
 * La API devuelve urls cortas/largas con el tracking_id.
 */
export async function generarEnlaceAfiliado(urlProducto: string) {
  const url = (urlProducto || '').trim()
  if (!url) return { success: false as const, error: 'La URL del producto es obligatoria.' }

  const resultado = await llamarApiAliExpress(ALI_LINK_METHOD, {
    // La API `link.generate` exige el parámetro `source_values`: un array JSON
    // de URLs de producto a convertir en enlace de afiliado.
    source_values: JSON.stringify([url]),
    tracking_id: ALI_TRACKING_ID,
    // Tipo de enlace promocional obligatorio (enum numérico de AliExpress):
    //   0 = enlace promocional largo con tracking (promotionLink)
    //   1 = enlace corto (shortLink)
    // Se envía como número (AliExpress lo exige numérico); la capa de firma
    // y query lo convierte a texto internamente.
    promotion_link_type: 0,
  })

  if (!resultado.success) return resultado

  // AliExpress envuelve el resultado en `aliexpress_affiliate_link_generate_response`
  // y reporta el estado en `resp_result.resp_code`/`resp_result.resp_msg`
  // (200 = éxito). Si resp_code no es 200, es un error de negocio real que
  // debemos mostrar tal cual (ej: 405 "The result is empty").
  const envelope = resultado.data?.aliexpress_affiliate_link_generate_response
  const resultadoNegocio = envelope?.resp_result ?? envelope
  const codigoRespuesta = resultadoNegocio?.resp_code ?? envelope?.code
  if (codigoRespuesta !== undefined && Number(codigoRespuesta) !== 200) {
    const msgNegocio =
      resultadoNegocio?.resp_msg ?? envelope?.message ?? `Código ${codigoRespuesta}`
    console.error('[aliApi] link.generate error negocio:', JSON.stringify(envelope))
    return { success: false as const, error: `AliExpress API: ${msgNegocio}` }
  }

  // AliExpress cambia el "envelope" de la respuesta según la versión del API.
  // En lugar de depender de una ruta fija, buscamos recursivamente el primer
  // objeto que contenga un `promotion_link` (URL de afiliado larga).
  const enlaceHallado = extraerEnlacePromocional(resultado.data)

  if (!enlaceHallado) {
    // Log de diagnóstico para depurar la estructura real de la respuesta.
    console.error('[aliApi] Respuesta link.generate sin enlace. Cruda:', JSON.stringify(resultado.data)?.slice(0, 2000))
    return { success: false as const, error: 'AliExpress no devolvió un enlace promocional.' }
  }

  return {
    success: true as const,
    data: {
      enlace_largo: String(enlaceHallado.promotion_link ?? ''),
      enlace_corto: String(enlaceHallado.promotion_short_link ?? '') || null,
      tracking_id: ALI_TRACKING_ID,
    } as AliEnlaceAfiliado,
  }
}

/**
 * Recorre recursivamente la respuesta de `link.generate` buscando el primer
 * objeto con un `promotion_link` válido (URL http). AliExpress anida el
 * resultado en rutas distintas según la versión, así que se inspecciona todo.
 */
function extraerEnlacePromocional(nodo: any, profundidad = 0): any | null {
  if (!nodo || typeof nodo !== 'object' || profundidad > 8) return null
  if (Array.isArray(nodo)) {
    for (const item of nodo) {
      const hallado = extraerEnlacePromocional(item, profundidad + 1)
      if (hallado) return hallado
    }
    return null
  }
  // Si este objeto ya es un enlace promocional con URL http, lo devolvemos.
  if (typeof nodo.promotion_link === 'string' && nodo.promotion_link.includes('http')) {
    return nodo
  }
  for (const valor of Object.values(nodo)) {
    const hallado = extraerEnlacePromocional(valor, profundidad + 1)
    if (hallado) return hallado
  }
  return null
}

/** Función de diagnóstico simple para UI: dice si las claves están configuradas. */
export function estadoCredencialesAliExpress() {
  return {
    appKeyConfigurada: Boolean(ALI_APP_KEY),
    appSecretConfigurado: Boolean(ALI_APP_SECRET),
    trackingIdConfigurado: Boolean(ALI_TRACKING_ID),
  }
}