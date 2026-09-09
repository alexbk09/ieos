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
} from '@/lib/constants'

// ---------- Tipos ----------

export type AliProductoBuscado = {
  /** ID numérico largo del producto AliExpress. */
  ali_product_id: string
  /** Título tal cual devuelve la API (sin traducir). */
  titulo_fabrica: string
  /** URL oficial del producto (para scrapear detalle). */
  url_producto: string
  /** Precio base inferior visible en USD (string crudo de Ali). */
  precio_min_venta: number | null
  /** Precio base superior (rango) en USD o null si no hay rango. */
  precio_max_venta: number | null
  /** Porcentaje de comisión del afiliado. */
  comision_porcentaje: number | null
  /** Volumen de ventas reportado (si viene). */
  ventas_recientes: number | null
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
 * Construye la firma HMAC-SHA256 que AliExpress exige en cada petición.
 * 1) Ordena alfabéticamente los parámetros incluidos en la firma.
 * 2) Arma "app_key..." con valores concatenados sin separador (formato Ali).
 * 3) Calcula HMAC-SHA256 con el app secret.
 */
function generarFirma(paramsOrdenados: Record<string, string>): string {
  const cadenaFirma = Object.keys(paramsOrdenados)
    .sort()
    .map((clave) => `${clave}${paramsOrdenados[clave]}`)
    .join('')
  return CryptoJS.HmacSHA256(cadenaFirma, ALI_APP_SECRET).toString(CryptoJS.enc.Hex).toUpperCase()
}

/**
 * Ejecuta una petición genérica POST al API REST de AliExpress Open
 * Platform con los parámetros firmados correctamente.
 *
 * Contrato real de AliExpress Open Platform (open.aliexpress.com):
 *  - Parámetros de sistema: app_key, timestamp (yyyy-MM-dd HH:mm:ss),
 *    sign_method=sha256, sign, format=json, v=2.0, api=<método>.
 *  - La firma se calcula sobre TODOS los parámetros (sistema + negocio)
 *    ordenados alfabéticamente y concatenados como "clavevalor".
 *  - El resultado se envía como application/x-www-form-urlencoded.
 */
async function llamarApiAliExpress(
  metodo: string,
  parametrosSinSistema: Record<string, string>,
) {
  const errorCredenciales = validarCredenciales()
  if (errorCredenciales) return { success: false as const, error: errorCredenciales }

  // Timestamp en el formato exacto que exige AliExpress: yyyy-MM-dd HH:mm:ss.
  const ahora = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timestamp = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`

  const paramsBase: Record<string, string> = {
    app_key: ALI_APP_KEY,
    timestamp,
    sign_method: 'sha256',
    // En la plataforma nueva el método viaja en el parámetro "api".
    api: metodo,
    format: 'json',
    v: '2.0',
    simplify: 'true',
    ...parametrosSinSistema,
  }

  const firma = generarFirma(paramsBase)
  const body = new URLSearchParams({ ...paramsBase, sign: firma })

  try {
    const respuesta = await fetch(ALIEXPRESS_OPEN_API_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      cache: 'no-store',
    })

    if (!respuesta.ok) {
      return { success: false as const, error: `AliExpress API HTTP ${respuesta.status}.` }
    }

    const datos = (await respuesta.json()) as any
    // La API envuelve la respuesta en un objeto con error_response cuando falla.
    if (datos?.error_response) {
      const msg = datos.error_response.msg || datos.error_response.sub_msg || 'Error desconocido de AliExpress.'
      console.error('[aliApi] error_response:', JSON.stringify(datos.error_response))
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
    // Moneda/country por defecto para la comisión.
    target_currency: 'USD',
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
      url_producto: String(p?.product_detail_url ?? p?.productDetailUrl ?? ''),
      precio_min_venta: precioTarget != null ? Number(precioTarget) : null,
      precio_max_venta: precioTargetAlto != null ? Number(precioTargetAlto) : null,
      comision_porcentaje: Number(p?.commission_rate ?? p?.commissionRate ?? 0) || null,
      ventas_recientes: p?.sale_price ? Number(p.sale_price) : null,
    }
  })

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
    // La URL que se convertirá a afiliado. Ali requiere el protocolo completo.
    source: url,
    tracking_id: ALI_TRACKING_ID,
  })

  if (!resultado.success) return resultado

  const respuestaNivelUno = resultado.data?.aliexpress_affiliate_link_generate_response
  const urls = respuestaNivelUno?.result?.promotion_links?.promotion_link ?? []

  const lista = Array.isArray(urls) ? urls : [urls]
  const primerEnlace = lista.find((l: any) => (l?.promotion_link ?? '').includes('http'))

  if (!primerEnlace) {
    return { success: false as const, error: 'AliExpress no devolvió un enlace promocional.' }
  }

  return {
    success: true as const,
    data: {
      enlace_largo: String(primerEnlace.promotion_link ?? ''),
      enlace_corto: String(primerEnlace.promotion_short_link ?? '') || null,
      tracking_id: ALI_TRACKING_ID,
    } as AliEnlaceAfiliado,
  }
}

/** Función de diagnóstico simple para UI: dice si las claves están configuradas. */
export function estadoCredencialesAliExpress() {
  return {
    appKeyConfigurada: Boolean(ALI_APP_KEY),
    appSecretConfigurado: Boolean(ALI_APP_SECRET),
    trackingIdConfigurado: Boolean(ALI_TRACKING_ID),
  }
}