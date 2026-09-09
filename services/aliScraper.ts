import { load } from 'cheerio'
import {
  SCRAPERAPI_ENDPOINT,
  ZENROWS_ENDPOINT,
  SCRAPER_DEFAULT_TIMEOUT_MS,
  SCRAPER_MAX_RETRIES,
  SCRAPER_MAX_IMAGES_PER_COLOR,
} from '@/lib/constants'

/**
 * Servicio de scraping tradicional para AliExpress (Fase 2.1).
 * ------------------------------------------------------------------
 * Responsabilidad exclusiva: obtener el HTML público de un producto
 * AliExpress via un proxy con renderizado JavaScript (ScraperAPI o
 * ZenRows) y extraer la informacion semantica necesaria para el
 * pipeline SEO SIN gastar creditos de IA en el parseo inicial.
 *
 * Reglas de oro respetadas:
 *  - Capa de abstraccion pura: NO toca Supabase ni componentes React.
 *  - Contrato estable { success: true, data } | { success: false, error }.
 *  - Parsea primero el JSON global `window.runParams` (estado hidratado
 *    de React que AliExpress incrusta en el HTML) y luego, si falta info,
 *    hace fallback con selectores CSS semanticos del DOM.
 *  - El guard de rol `administrador` vive en la API route
 *    /api/admin/scraper-aliexpress (requireAdmin + permisos RBAC).
 */

export type AliScraperImagenColor = {
  color: string | null
  url: string
}

export type AliScraperPrecio = {
  minimo: number
  maximo: number | null
  moneda: string
  texto_original: string
}

export type AliScraperProductoData = {
  ali_product_id: string | null
  titulo_original: string | null
  precio_base: AliScraperPrecio | null
  metadatos_fisicos: Record<string, string>
  galeria_imagenes: AliScraperImagenColor[]
  descripcion: string | null
}

const SCRAPER_API_KEY = process.env.SCRAPERAPI_API_KEY?.trim() || ''
const ZENROWS_API_KEY = process.env.ZENROWS_API_KEY?.trim() || ''

type ScraperProxy = 'scraperapi' | 'zenrows'

function esObjeto(nodo: unknown): nodo is Record<string, unknown> {
  return typeof nodo === 'object' ? nodo !== null : false
}

function esArreglo(nodo: unknown): nodo is unknown[] {
  return Array.isArray(nodo)
}

/** Lee una ruta de claves dentro de un JSON sin lanzar errores. */
function obtenerRuta(nodo: unknown, ruta: string[]): unknown {
  let actual: unknown = nodo
  for (let i = 0; ruta.length > i; i += 1) {
    const clave = ruta[i]
    if (esObjeto(actual) && clave in actual) actual = actual[clave]
    else return undefined
  }
  return actual
}

/** Convierte URL relativa de CDN (//ae01.alicdn.com/...) a absoluta https. */
function urlAbsolutaHttps(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpia = valor.trim().replace(/^(["'])|(["'])$/g, '')
  if (!limpia) return null
  if (limpia.startsWith('//')) return `https:${limpia}`
  if (limpia.startsWith('http://')) return limpia
  if (limpia.startsWith('https://')) return limpia
  return null
}

/** Quita espacios multiples de un titulo. */
function limpiarTitulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.replace(/\s+/g, ' ').trim()
  return limpio || null
}

/** Extrae el primer bloque JSON {...} balanceado de un texto. */
function primerObjetoJson(texto: string): string | null {
  const inicio = texto.indexOf('{')
  if (0 > inicio) return null
  let profundidad = 0
  let enString = false
  let escapado = false
  for (let i = inicio; texto.length > i; i += 1) {
    const caracter = texto[i]
    if (enString) {
      if (escapado) escapado = false
      else if (caracter === '\\') escapado = true
      else if (caracter === '"') enString = false
      continue
    }
    if (caracter === '"') {
      enString = true
      continue
    }
    if (caracter === '{') profundidad += 1
    else if (caracter === '}') {
      profundidad -= 1
      if (profundidad === 0) return texto.slice(inicio, i + 1)
    }
  }
  return null
}

function tryParsearJson(texto: string | null | undefined): unknown {
  if (!texto) return null
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

/**
 * Busca window.runParams en los <script>s. Ahí AliExpress hidrata el
 * producto completo: titulo, precios, especificaciones, imagenes y SKUs.
 */
function extraerRunParams($: ReturnType<typeof load>): unknown {
  const textos: string[] = []
  $('script').each((_, elemento) => {
    const contenido = $(elemento).text() || $(elemento).html() || ''
    if (contenido.includes('window.runParams') || contenido.includes('_init_data_')) {
      textos.push(contenido)
    }
  })

  for (let t = 0; textos.length > t; t += 1) {
    const texto = textos[t]
    const indice = texto.indexOf('window.runParams')
    if (0 <= indice) {
      const desdeIgual = texto.indexOf('=', indice)
      if (0 <= desdeIgual) {
        const parseado = tryParsearJson(primerObjetoJson(texto.slice(desdeIgual + 1)))
        if (esObjeto(parseado)) return parseado
      }
    }
    const indiceProducto = texto.indexOf('"productId"')
    if (0 <= indiceProducto) {
      const candidato = texto.slice(texto.lastIndexOf('{', indiceProducto))
      const parseado = tryParsearJson(primerObjetoJson(candidato))
      if (esObjeto(parseado)) return parseado
    }
  }
  return null
}

/** Parsea un texto de precio crudo (US $0.75 ~ US $1.20) a numeros. */
function parsearPrecioTexto(texto: string): AliScraperPrecio | null {
  if (!texto) return null
  const matchMoneda = texto.match(/\$\s?\d|US\s?D/i)
  if (!matchMoneda) return null
  const numeros: number[] = []
  const coincidencias = texto.matchAll(/(\d+(?:[.,]\d{1,2})?)/g)
  for (const m of coincidencias) {
    const numero = parseFloat(m[1].replace(',', '.'))
    if (Number.isFinite(numero) && 0 < numero) numeros.push(numero)
  }
  if (numeros.length === 0) return null
  const minimo = Math.min(...numeros)
  const maximoCandidato = 1 < numeros.length ? Math.max(...numeros) : null
  const hayRango = maximoCandidato !== null
  const esMismoValor = hayRango ? Math.abs(maximoCandidato - minimo) < 0.0001 : false
  return {
    minimo,
    maximo: hayRango && !esMismoValor ? maximoCandidato : null,
    moneda: 'USD',
    texto_original: texto.replace(/\s+/g, ' ').trim(),
  }
}

/** Recorre el JSON buscando textos de precio (profundidad limitada). */
function recolectarPrecios(nodo: unknown, salida: string[] = [], prof = 0): string[] {
  if (!nodo) return salida
  if (prof > 8) return salida
  if (typeof nodo === 'string') {
    if (/\$\s?\d|US\s?D/i.test(nodo)) salida.push(nodo.trim())
    return salida
  }
  if (esArreglo(nodo)) {
    for (const item of nodo) recolectarPrecios(item, salida, prof + 1)
    return salida
  }
  if (esObjeto(nodo)) {
    for (const valor of Object.values(nodo)) recolectarPrecios(valor, salida, prof + 1)
  }
  return salida
}

/** Recorre el JSON buscando URLs de imagenes CDN de AliExpress. */
function recolectarImagenes(nodo: unknown, salida: string[] = [], prof = 0): string[] {
  if (!nodo) return salida
  if (prof > 10) return salida
  if (typeof nodo === 'string') {
    const url = urlAbsolutaHttps(nodo)
    if (url && url.includes('alicdn.com') && !salida.includes(url)) salida.push(url)
    return salida
  }
  if (esArreglo(nodo)) {
    for (const item of nodo) recolectarImagenes(item, salida, prof + 1)
    return salida
  }
  if (esObjeto(nodo)) {
    for (const valor of Object.values(nodo)) recolectarImagenes(valor, salida, prof + 1)
  }
  return salida
}

/** Construye la galeria con variantes color/SKU desde window.runParams. */
function extraerGaleriaRunParams(runParams: unknown): AliScraperImagenColor[] {
  const resultado: AliScraperImagenColor[] = []
  if (!esObjeto(runParams)) return resultado
  const datos = obtenerRuta(runParams, ['data'])

  // La rama skuPropertyList trae { propertyValueDefinitionName, skuPropertyImageSummImageUrl }.
  const visitar = (nodo: unknown, prof = 0): void => {
    if (!nodo) return
    if (prof > 8) return
    if (esArreglo(nodo)) {
      for (const item of nodo) visitar(item, prof + 1)
      return
    }
    if (!esObjeto(nodo)) return
    const nombre = nodo.propertyValueDefinitionName
    const imagenCruda = nodo.skuPropertyImageSummImageUrl
    const url = urlAbsolutaHttps(imagenCruda)
    if (typeof nombre === 'string' && url) {
      const color = nombre.trim()
      const duplicada = resultado.some((v) => v.color === color || v.url === url)
      if (!duplicada && SCRAPER_MAX_IMAGES_PER_COLOR > resultado.length) {
        resultado.push({ color, url })
      }
    }
    for (const valor of Object.values(nodo)) visitar(valor, prof + 1)
  }
  visitar(datos)

  // Si no hay variantes con imagen, usa imagenes generales del CDN.
  if (resultado.length === 0) {
    const generales = recolectarImagenes(datos).slice(0, SCRAPER_MAX_IMAGES_PER_COLOR)
    for (const url of generales) resultado.push({ color: null, url })
  }
  return resultado.slice(0, SCRAPER_MAX_IMAGES_PER_COLOR * 4)
}

/** Reune especificaciones atributo/valor desde runParams (varios formatos). */
function extraerMetadatosRunParams(runParams: unknown): Record<string, string> {
  const metadatos: Record<string, string> = {}
  const agregar = (nombre: unknown, valor: unknown): void => {
    if (typeof nombre !== 'string') return
    const clave = nombre.trim()
    if (!clave) return
    if (clave in metadatos) return
    let textoValor = ''
    if (typeof valor === 'string') textoValor = valor.trim()
    else if (esArreglo(valor)) textoValor = valor.filter((v) => typeof v === 'string').join(', ').trim()
    if (textoValor) metadatos[clave] = textoValor
  }

  const visitar = (nodo: unknown, prof = 0): void => {
    if (!nodo) return
    if (prof > 8) return
    if (esArreglo(nodo)) {
      for (const item of nodo) visitar(item, prof + 1)
      return
    }
    if (!esObjeto(nodo)) return

    if (typeof nodo.attrName === 'string' && ('attrValue' in nodo || 'value' in nodo)) {
      agregar(nodo.attrName, nodo.attrValue ?? nodo.value)
      return
    }
    if (typeof nodo.name === 'string' && ('value' in nodo || 'text' in nodo)) {
      agregar(nodo.name, nodo.value ?? nodo.text)
      return
    }
    if (typeof nodo.propName === 'string' && 'propValue' in nodo) {
      agregar(nodo.propName, nodo.propValue)
      return
    }
    for (const valor of Object.values(nodo)) visitar(valor, prof + 1)
  }

  visitar(obtenerRuta(runParams, ['data', 'productPropComponent']))
  if (Object.keys(metadatos).length === 0) visitar(obtenerRuta(runParams, ['data']))
  return Object.fromEntries(Object.entries(metadatos).slice(0, 60))
}

/** Precio desde runParams: rutas oficiales primero, deep search despues. */
function extraerPrecioRunParams(runParams: unknown): AliScraperPrecio | null {
  const rutasOficiales = [
    ['data', 'priceComponent', 'content', 'formatPrice'],
    ['data', 'priceComponent', 'content', 'formatedPrice'],
    ['data', 'priceComponent', 'content', 'formatedActivityPrice'],
    ['data', 'priceComponent', 'content', 'activityPrice'],
    ['data', 'skuComponent', 'skuAmount', 'rangeMin'],
  ]
  for (const ruta of rutasOficiales) {
    const valor = obtenerRuta(runParams, ruta)
    if (typeof valor === 'string') {
      const precio = parsearPrecioTexto(valor)
      if (precio) return precio
    }
    if (typeof valor === 'number' && Number.isFinite(valor)) {
      const maximoVal = obtenerRuta(runParams, ['data', 'skuComponent', 'skuAmount', 'rangeMax'])
      const texto = `US $${valor}${typeof maximoVal === 'number' ? ` ~ US $${maximoVal}` : ''}`
      const precio = parsearPrecioTexto(texto)
      if (precio) return precio
    }
  }
  const preciosProfundos = recolectarPrecios(obtenerRuta(runParams, ['data']))
  for (const candidato of preciosProfundos) {
    const precio = parsearPrecioTexto(candidato)
    if (precio) return precio
  }
  return null
}

/** Titulo desde runParams. */
function extraerTituloRunParams(runParams: unknown): string | null {
  const rutas = [
    ['data', 'productInfoComponent', 'content', 'title'],
    ['data', 'productInfoComponent', 'content', 'subject'],
    ['data', 'titleComponent', 'content'],
    ['data', 'productInfoComponent', 'content'],
  ]
  for (const ruta of rutas) {
    const titulo = limpiarTitulo(obtenerRuta(runParams, ruta))
    if (titulo) return titulo
  }
  return null
}

/** ID de producto desde URL canónica, runParams o regex en HTML. */
function extraerProductId(url: string, html: string, runParams: unknown, $: ReturnType<typeof load>): string | null {
  const canonica = $('link[rel="canonical"]').attr('href') || url
  const matchUrl = canonica.match(/\/item\/(\d{5,})/i)
  if (matchUrl && matchUrl[1]) return matchUrl[1]

  if (esObjeto(runParams)) {
    const rutas = [
      ['data', 'productId'],
      ['data', 'moduleData', 'productId'],
      ['productId'],
      ['data', 'actionModule', 'productId'],
    ]
    for (const ruta of rutas) {
      const candidato = obtenerRuta(runParams, ruta)
      if (typeof candidato === 'string' || typeof candidato === 'number') {
        const texto = String(candidato).trim()
        const match = texto.match(/\d{5,}/)
        if (match) return match[0]
      }
    }
  }

  const matchHtml = html.match(/"productId"\s*:\s*"(\d{5,})"/)
  if (matchHtml && matchHtml[1]) return matchHtml[1]
  const matchSimple = html.match(/itemId=(\d{5,})|itemId:(\d{5,})/i)
  if (matchSimple && (matchSimple[1] || matchSimple[2])) return matchSimple[1] || matchSimple[2]
  return null
}

/** Fallback por selectores CSS semanticos del DOM renderizado. */
function parsearDesdeDom($: ReturnType<typeof load>): Partial<AliScraperProductoData> {
  const titulo =
    limpiarTitulo($('h1').first().text()) ||
    limpiarTitulo($('[itemprop="name"]').first().text()) ||
    limpiarTitulo($('meta[property="og:title"]').attr('content')) ||
    null

  const textoPrecio =
    $('span[itemprop="price"]').first().attr('content') ||
    $('span[class*="product-price-value"]').first().text() ||
    $('span[class*="price--currentPriceText"]').first().text() ||
    ''
  const precio = parsearPrecioTexto(textoPrecio)

  const metadatos: Record<string, string> = {}
  $('li[class*="specification--prop"]').each((_, fila) => {
    const nombreFila = $(fila).find('[class*="specification--name"]').first().text().trim()
    const valorFila = $(fila).find('[class*="specification--value"]').first().text().trim()
    if (nombreFila && valorFila && !(nombreFila in metadatos)) metadatos[nombreFila] = valorFila
  })

  const imagenes: string[] = []
  $('img').each((_, img) => {
    const fuente = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src') || ''
    const url = urlAbsolutaHttps(fuente)
    if (url && url.includes('alicdn.com/kf') && !imagenes.includes(url)) imagenes.push(url)
  })
  const galeria: AliScraperImagenColor[] = imagenes
    .slice(0, SCRAPER_MAX_IMAGES_PER_COLOR)
    .map((urlDeImagen) => ({ color: null, url: urlDeImagen }))

  return {
    titulo_original: titulo,
    precio_base: precio,
    metadatos_fisicos: metadatos,
    galeria_imagenes: galeria,
  }
}

function extraerDescripcionMeta($: ReturnType<typeof load>): string | null {
  const descripcion =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    ''
  const limpia = descripcion.replace(/\s+/g, ' ').trim()
  if (!limpia) return null
  return limpia.length > 500 ? `${limpia.slice(0, 500)}...` : limpia
}

/** Valida y normaliza URL de AliExpress. */
function normalizarUrlAliExpress(urlProduct: string): string | null {
  const cruda = (urlProduct || '').trim()
  if (!cruda) return null
  const conProtocolo = /^https?:\/\//i.test(cruda) ? cruda : `https://${cruda}`
  try {
    const parsed = new URL(conProtocolo)
    if (!/aliexpress\./.test(parsed.hostname)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

/** Construye la URL del proxy con render JS (AliExpress exige JS). */
function construirUrlProxy(proveedor: ScraperProxy, urlAliExpress: string): string {
  if (proveedor === 'scraperapi') {
    if (!SCRAPER_API_KEY) throw new Error('Falta SCRAPERAPI_API_KEY en el .env del servidor.')
    return `${SCRAPERAPI_ENDPOINT}?api_key=${encodeURIComponent(SCRAPER_API_KEY)}&url=${encodeURIComponent(urlAliExpress)}&render=true&country_code=us&keep_headers=true`
  }
  if (!ZENROWS_API_KEY) throw new Error('Falta ZENROWS_API_KEY en el .env del servidor.')
  return `${ZENROWS_ENDPOINT}?apikey=${encodeURIComponent(ZENROWS_API_KEY)}&url=${encodeURIComponent(urlAliExpress)}&js_render=true&premium=false`
}

// ZenRows tiene plan gratuito permanente; es el proveedor principal.
function elegirProveedor(): ScraperProxy {
  if (ZENROWS_API_KEY) return 'zenrows'
  if (SCRAPER_API_KEY) return 'scraperapi'
  throw new Error('No hay API key de scraping. Define ZENROWS_API_KEY o SCRAPERAPI_API_KEY.')
}

/** Descarga el HTML del producto via proxy con timeout y reintentos. */
async function descargarHtmlConReintentos(urlAliExpress: string): Promise<string> {
  const proveedorInicial = elegirProveedor()
  let ultimoError: unknown = null

  for (let intento = 0; SCRAPER_MAX_RETRIES >= intento; intento += 1) {
    const proveedorActual = intento === 0 ? proveedorInicial : 'zenrows' === proveedorInicial ? 'scraperapi' : 'zenrows'
    const controlador = new AbortController()
    const temporizador = setTimeout(() => controlador.abort(), SCRAPER_DEFAULT_TIMEOUT_MS)
    try {
      const respuesta = await fetch(construirUrlProxy(proveedorActual, urlAliExpress), {
        headers: { accept: 'text/html,application/xhtml+xml' },
        signal: controlador.signal,
        cache: 'no-store',
      })
      if (respuesta.status === 429 || respuesta.status >= 500) {
        throw new Error(`El proxy ${proveedorActual} respondio HTTP ${respuesta.status}.`)
      }
      if (!respuesta.ok) throw new Error(`El proxy ${proveedorActual} respondio HTTP ${respuesta.status}.`)
      const html = await respuesta.text()
      if (!html || html.length < 500) {
        throw new Error('El proxy devolvio un HTML vacio o insuficiente (posible CAPTCHA).')
      }
      return html
    } catch (error) {
      ultimoError = error
      console.error(`[aliScraper] Intento ${intento + 1} fallo con ${proveedorActual}:`, error instanceof Error ? error.message : error)
    } finally {
      clearTimeout(temporizador)
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error('No se pudo descargar el producto tras los reintentos.')
}

/**
 * FUNCION PRINCIPAL DEL SCRAPER.
 * Descarga el HTML e extrae: id, titulo, precio, especificaciones e imagenes.
 *
 * @param urlProduct URL publica del producto AliExpress.
 * @returns Contrato { success: true, data } o { success: false, error }.
 */
export async function scrapearProductoAliExpress(urlProduct: string) {
  try {
    const urlValida = normalizarUrlAliExpress(urlProduct)
    if (!urlValida) {
      return { success: false as const, error: 'La URL no es valida o no pertenece a AliExpress.' }
    }

    const html = await descargarHtmlConReintentos(urlValida)
    if (!html) return { success: false as const, error: 'El proxy no devolvio HTML parseable.' }

    const $ = load(html)
    const runParams = extraerRunParams($)
    const delJson: Partial<AliScraperProductoData> = {
      titulo_original: extraerTituloRunParams(runParams),
      precio_base: extraerPrecioRunParams(runParams),
      metadatos_fisicos: extraerMetadatosRunParams(runParams),
      galeria_imagenes: extraerGaleriaRunParams(runParams),
    }
    const delDom = parsearDesdeDom($)

    const dataFinal: AliScraperProductoData = {
      ali_product_id: extraerProductId(urlValida, html, runParams, $),
      titulo_original: delJson.titulo_original || delDom.titulo_original || null,
      precio_base: delJson.precio_base || delDom.precio_base || null,
      metadatos_fisicos: {
        ...(delDom.metadatos_fisicos || {}),
        ...(delJson.metadatos_fisicos || {}),
      },
      galeria_imagenes:
        delJson.galeria_imagenes && delJson.galeria_imagenes.length > 0
          ? delJson.galeria_imagenes
          : delDom.galeria_imagenes || [],
      descripcion: extraerDescripcionMeta($),
    }

    const tieneAlgo =
      Boolean(dataFinal.titulo_original) ||
      Boolean(dataFinal.precio_base) ||
      dataFinal.galeria_imagenes.length > 0
    if (!tieneAlgo) {
      console.error('[aliScraper] Sin datos parseables en:', urlValida)
      return {
        success: false as const,
        error: 'AliExpress no expuso datos parseables. Posible CAPTCHA o cambio de estructura. Revisa el log.',
      }
    }

    return { success: true as const, data: dataFinal }
  } catch (error: unknown) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido al scrapear AliExpress.'
    console.error('[aliScraper] Error fatal scrapearProductoAliExpress:', mensaje)
    return { success: false as const, error: mensaje }
  }
}
