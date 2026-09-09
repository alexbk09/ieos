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
  /** Marca del producto (ej: "Xiaomi", "Anker"). Null si no se detecta. */
  marca: string | null
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

/**
 * Detecta si una URL de imagen de AliExpress corresponde a una variante
 * DIFUMINADA o con MARCA DE AGUA (watermark), que AliExpress genera como
 * "preview" borroso antes de cargar la imagen real o como copia protegida.
 * Estas variantes NO deben guardarse ni mostrarse porque son redundantes
 * (existe la misma imagen limpia) y se ven mal en el catálogo.
 *
 * Patrones detectados (según el CDN alicdn.com / aliexpress-media.com):
 *  - Marcadores explícitos en el nombre: "_blur", "_watermark", "blur",
 *    "watermark", "_preview", "_placeholder".
 *  - Miniaturas de preview borroso por tamaño: "_350x350", "_220x220",
 *    "_100x100", "_50x50" (AliExpress usa estas como thumb borrosas).
 */
function esImagenDifuminadaOMarcaDeAgua(url: string): boolean {
  const nombre = url.toLowerCase()
  return (
    /_blur|_watermark|_preview|_placeholder|blur|watermark/i.test(nombre) ||
    /_(?:50|100|220|350)x(?:50|100|220|350)\.(?:jpg|jpeg|png|webp)/i.test(nombre)
  )
}

/**
 * Devuelve la "identidad base" de una imagen AliExpress: la URL sin los
 * sufijos de tamaño/calidad que AliExpress añade para servir la misma foto
 * en varias resoluciones (ej: ".../HB123.jpg_350x350.jpg" y
 * ".../HB123.jpg_640x640.jpg" son la MISMA imagen). Al normalizar ambas a
 * su base común podemos detectar duplicados y quedarnos con la versión limpia.
 *
 * Ejemplos:
 *   ".../kf/HBabc.jpg_350x350.jpg"  -> ".../kf/HBabc.jpg"
 *   ".../kf/HBabc.jpg_640x640.jpg"  -> ".../kf/HBabc.jpg"
 *   ".../kf/HBabc.jpg"              -> ".../kf/HBabc.jpg"  (sin cambios)
 */
function normalizarIdentidadImagen(url: string): string {
  // Quita el sufijo "_WxH.ext" que AliExpress añade tras la extensión real.
  // Ej: "HBabc.jpg_350x350.jpg" -> "HBabc.jpg". Se repite por si hay varios.
  let base = url
  for (let i = 0; i < 3; i += 1) {
    const nueva = base.replace(/_(?:\d{2,4})x(?:\d{2,4})\.(?:jpg|jpeg|png|webp)$/i, '')
    if (nueva === base) break
    base = nueva
  }
  // Quita marcadores de blur/watermark para que la versión limpia y la
  // difuminada de la misma foto compartan identidad.
  base = base.replace(/_(?:blur|watermark|preview|placeholder)/gi, '')
  return base
}

/**
 * Filtra y deduplica una lista de URLs de imágenes AliExpress:
 *  - Descarta las variantes difuminadas/watermark cuando existe la versión
 *    limpia de la misma foto (misma identidad base).
 *  - Si SOLO existe la variante difuminada (raro), la conserva para no perder
 *    la imagen por completo.
 *  - Elimina duplicados exactos y conserva el orden original.
 */
function filtrarImagenesLimpias(urls: string[]): string[] {
  const limpias: string[] = []
  const identidadesLimpias = new Set<string>()
  const identidadesDifuminadas = new Set<string>()

  // Primera pasada: registrar qué identidades tienen versión limpia.
  for (const url of urls) {
    if (esImagenDifuminadaOMarcaDeAgua(url)) identidadesDifuminadas.add(normalizarIdentidadImagen(url))
    else identidadesLimpias.add(normalizarIdentidadImagen(url))
  }

  // Segunda pasada: conservar solo limpias, o difuminadas sin versión limpia.
  for (const url of urls) {
    if (esImagenDifuminadaOMarcaDeAgua(url)) {
      // Solo se conserva la difuminada si NO existe su versión limpia.
      if (!identidadesLimpias.has(normalizarIdentidadImagen(url))) limpias.push(url)
    } else {
      limpias.push(url)
    }
  }
  return limpias
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
 * NOTA (2026): AliExpress ya NO hidrata el producto en `window.runParams`
 * (queda vacío {}). El estado real vive en `window._d_c_.DCData` (imagenes)
 * y en llamadas XHR posteriores. Por eso esta funcion tambien intenta
 * capturar DCData como fuente de imagenes.
 */
function extraerRunParams($: ReturnType<typeof load>): unknown {
  const textos: string[] = []
  $('script').each((_, elemento) => {
    const contenido = $(elemento).text() || $(elemento).html() || ''
    if (
      contenido.includes('window.runParams') ||
      contenido.includes('_init_data_') ||
      contenido.includes('_d_c_.DCData')
    ) {
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
        if (esObjeto(parseado) && Object.keys(parseado).length > 0) return parseado
      }
    }
    // DCData trae la galeria de imagenes del producto (imagePathList).
    const indiceDC = texto.indexOf('window._d_c_.DCData')
    if (0 <= indiceDC) {
      const desdeIgual = texto.indexOf('=', indiceDC)
      if (0 <= desdeIgual) {
        const parseado = tryParsearJson(primerObjetoJson(texto.slice(desdeIgual + 1)))
        if (esObjeto(parseado) && Object.keys(parseado).length > 0) return parseado
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

/**
 * Parsea un texto de precio crudo a numeros, soportando los formatos que
 * AliExpress muestra segun la moneda/locale del visitante:
 *   - USD:  "US $0.75 ~ US $1.20" o "$1.09"
 *   - EUR:  "9,29€" (decimal con coma, simbolo € al final)
 *   - MXN/COP: "$1,234.56" (miles con coma, decimal con punto)
 * Detecta la moneda por el simbolo y normaliza el separador decimal.
 */
function parsearPrecioTexto(texto: string): AliScraperPrecio | null {
  if (!texto) return null
  const esEuro = /€/.test(texto)
  const esDolar = /\$\s?\d|US\s?D/i.test(texto)
  if (!esEuro && !esDolar) return null
  const moneda = esEuro ? 'EUR' : 'USD'

  // Normaliza el separador decimal: en formato europeo "9,29" la coma es
  // decimal; en formato anglosajon "1,234.56" la coma es separador de miles.
  // Estrategia segura: si hay coma seguida de 1-2 digitos y NO hay punto
  // decimal despues, la coma es decimal -> se reemplaza por punto.
  const numeros: number[] = []
  const coincidencias = texto.matchAll(/(\d[\d.,]*)/g)
  for (const m of coincidencias) {
    let crudo = m[1]
    // Si el numero usa coma como decimal (ej: 9,29) y no tiene punto, la
    // convertimos a punto. Si usa punto como decimal (ej: 1.09), queda igual.
    if (crudo.includes(',') && !crudo.includes('.')) {
      crudo = crudo.replace(',', '.')
    } else if (crudo.includes(',') && crudo.includes('.')) {
      // Formato "1,234.56": la coma es miles -> se elimina.
      crudo = crudo.replace(/,/g, '')
    }
    const numero = parseFloat(crudo)
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
    moneda,
    texto_original: texto.replace(/\s+/g, ' ').trim(),
  }
}

/** Recorre el JSON buscando textos de precio (profundidad limitada). */
function recolectarPrecios(nodo: unknown, salida: string[] = [], prof = 0): string[] {
  if (!nodo) return salida
  if (prof > 8) return salida
  if (typeof nodo === 'string') {
    if (/\$\s?\d|US\s?D|€/i.test(nodo)) salida.push(nodo.trim())
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
    // AliExpress usa dos CDN: alicdn.com (clasico) y aliexpress-media.com (nuevo).
    if (url && (url.includes('alicdn.com') || url.includes('aliexpress-media.com')) && !salida.includes(url)) {
      salida.push(url)
    }
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

/**
 * Filtra una lista de URLs de imágenes AliExpress descartando las variantes
 * difuminadas/watermark que duplican una versión limpia de la misma foto.
 * Se usa como paso final de saneamiento en la galería (JSON y DOM).
 */
function limpiarListaImagenes(urls: string[]): string[] {
  return filtrarImagenesLimpias(urls)
}

/** Construye la galeria con variantes color/SKU desde window.runParams o DCData. */
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
  // DCData (estructura nueva 2026) trae la galeria en imagePathList a nivel
  // raiz del objeto, no bajo `data`. Por eso tambien recorremos el objeto
  // completo (runParams) como fuente de imagenes.
  if (resultado.length === 0) {
    const generales = limpiarListaImagenes(recolectarImagenes(datos)).slice(0, SCRAPER_MAX_IMAGES_PER_COLOR)
    const generalesRaiz = limpiarListaImagenes(recolectarImagenes(runParams)).slice(0, SCRAPER_MAX_IMAGES_PER_COLOR)
    const fuente = generales.length > 0 ? generales : generalesRaiz
    for (const url of fuente) resultado.push({ color: null, url })
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

/**
 * Limpia y valida un nombre de marca detectado.
 * Descarta valores genéricos/no útiles (AliExpress, tiendas, "No brand",
 * "Sin marca", "Generic", etc.) que no aportan al filtro por marca.
 */
function limpiarMarca(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpia = valor.replace(/\s+/g, ' ').trim()
  if (!limpia) return null
  // Longitud razonable (evita ruido) y descarta genéricos.
  if (limpia.length > 60) return null
  const genericos = /^(aliexpress|no\s?brand|sin\s?marca|generic|unbranded|unknown|store|tienda|official|original|factory|drop\s?shipping|wholesale|aliexpress\s?store)$/i
  if (genericos.test(limpia)) return null
  return limpia
}

/**
 * Extrae la marca del producto desde el JSON hidratado (runParams/DCData).
 * AliExpress la expone en varias rutas según la versión:
 *   - data.productInfoComponent.content.brandName
 *   - data.productInfoComponent.content.brand
 *   - data.brandComponent.content (objeto con brandName)
 *   - data.storeComponent.content.storeName (tienda, NO es marca real)
 * También recorre las especificaciones buscando la clave "Brand Name"/"Marca".
 */
function extraerMarcaRunParams(runParams: unknown): string | null {
  if (!esObjeto(runParams)) return null

  // 1) Rutas oficiales de marca.
  const rutasDirectas = [
    ['data', 'productInfoComponent', 'content', 'brandName'],
    ['data', 'productInfoComponent', 'content', 'brand'],
    ['data', 'brandComponent', 'content', 'brandName'],
    ['data', 'brandComponent', 'content', 'brand'],
    ['data', 'brandName'],
    ['brandName'],
  ]
  for (const ruta of rutasDirectas) {
    const marca = limpiarMarca(obtenerRuta(runParams, ruta))
    if (marca) return marca
  }

  // 2) La marca suele aparecer como especificación "Brand Name"/"Marca".
  const metadatos = extraerMetadatosRunParams(runParams)
  for (const clave of Object.keys(metadatos)) {
    if (/brand|marca/i.test(clave)) {
      const marca = limpiarMarca(metadatos[clave])
      if (marca) return marca
    }
  }

  // 3) Deep search: primer valor bajo una clave que contenga "brand".
  const visitar = (nodo: unknown, prof = 0): string | null => {
    if (!nodo || prof > 6) return null
    if (esArreglo(nodo)) {
      for (const item of nodo) {
        const hallado = visitar(item, prof + 1)
        if (hallado) return hallado
      }
      return null
    }
    if (!esObjeto(nodo)) return null
    for (const [clave, valor] of Object.entries(nodo)) {
      if (/brand/i.test(clave)) {
        const marca = limpiarMarca(valor)
        if (marca) return marca
      }
      const hallado = visitar(valor, prof + 1)
      if (hallado) return hallado
    }
    return null
  }
  return visitar(obtenerRuta(runParams, ['data']))
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
  // El <h1> de AliExpress suele ser genérico ("Aliexpress"), mientras que el
  // meta og:title trae el título REAL del producto. Por eso priorizamos
  // og:title y og:description ANTES que el h1, y limpiamos el sufijo
  // " - AliExpress" que AliExpress añade al final del og:title.
  const tituloCrudo =
    limpiarTitulo($('meta[property="og:title"]').attr('content')) ||
    limpiarTitulo($('[itemprop="name"]').first().text()) ||
    limpiarTitulo($('h1').first().text()) ||
    null
  const titulo = tituloCrudo ? tituloCrudo.replace(/\s*-\s*AliExpress.*$/i, '').trim() : null

  // PRECIO (AliExpress 2026): el precio ACTUAL que ve el usuario vive en un
  // elemento con clase "price-default--current--*" (puede ser <span> o <div>,
  // ej: <span class="price-default--current--F8OlYIo">9,29€</span>), y el
  // precio ORIGINAL tachado vive en "price-default--original--*". Por eso el
  // selector es AGNOSTICO de etiqueta ([class*=...]) para capturar ambos.
  // Los selectores antiguos (product-price-value, price--currentPriceText)
  // ya NO existen en el DOM actual, por eso el scraper no capturaba precio.
  // Se concatenan ambos para que parsearPrecioTexto devuelva min=actual y
  // max=original (asi el catalogo muestra el precio real con su descuento).
  const textoPrecioActual =
    $('[class*="price-default--current"]').first().text() ||
    $('span[itemprop="price"]').first().attr('content') ||
    ''
  const textoPrecioOriginal =
    $('[class*="price-default--original"]').first().text() || ''
  const textoPrecio = [textoPrecioActual, textoPrecioOriginal]
    .filter(Boolean)
    .join(' ')
    .trim()
  const precio = parsearPrecioTexto(textoPrecio)

  const metadatos: Record<string, string> = {}
  $('li[class*="specification--prop"]').each((_, fila) => {
    const nombreFila = $(fila).find('[class*="specification--name"]').first().text().trim()
    const valorFila = $(fila).find('[class*="specification--value"]').first().text().trim()
    if (nombreFila && valorFila && !(nombreFila in metadatos)) metadatos[nombreFila] = valorFila
  })

  // MARCA desde el DOM: meta tags de producto (og:brand / product:brand) o el
  // elemento itemprop="brand". Si no aparece, se busca en las especificaciones
  // ya extraidas bajo la clave "Brand Name"/"Marca".
  const marcaDom =
    limpiarMarca($('meta[property="og:brand"]').attr('content')) ||
    limpiarMarca($('meta[property="product:brand"]').attr('content')) ||
    limpiarMarca($('[itemprop="brand"]').first().attr('content')) ||
    limpiarMarca($('[itemprop="brand"]').first().text()) ||
    null
  const marcaDesdeSpecs = (() => {
    for (const clave of Object.keys(metadatos)) {
      if (/brand|marca/i.test(clave)) {
        const marca = limpiarMarca(metadatos[clave])
        if (marca) return marca
      }
    }
    return null
  })()

  const imagenes: string[] = []
  $('img').each((_, img) => {
    const fuente = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src') || ''
    const url = urlAbsolutaHttps(fuente)
    if (url && url.includes('alicdn.com/kf') && !imagenes.includes(url)) imagenes.push(url)
  })
  // Descarta las variantes difuminadas/watermark que duplican la versión
  // limpia de la misma foto (AliExpress sirve ambas en el DOM).
  const galeria: AliScraperImagenColor[] = limpiarListaImagenes(imagenes)
    .slice(0, SCRAPER_MAX_IMAGES_PER_COLOR)
    .map((urlDeImagen) => ({ color: null, url: urlDeImagen }))

  return {
    titulo_original: titulo,
    marca: marcaDom || marcaDesdeSpecs,
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
  // ZenRows rechaza el parámetro `premium` (error REQS004). Solo se envían
  // parámetros válidos: apikey, url y js_render=true (renderizado JS).
  return `${ZENROWS_ENDPOINT}?apikey=${encodeURIComponent(ZENROWS_API_KEY)}&url=${encodeURIComponent(urlAliExpress)}&js_render=true`
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
      marca: extraerMarcaRunParams(runParams),
      precio_base: extraerPrecioRunParams(runParams),
      metadatos_fisicos: extraerMetadatosRunParams(runParams),
      galeria_imagenes: extraerGaleriaRunParams(runParams),
    }
    const delDom = parsearDesdeDom($)

    const dataFinal: AliScraperProductoData = {
      ali_product_id: extraerProductId(urlValida, html, runParams, $),
      titulo_original: delJson.titulo_original || delDom.titulo_original || null,
      // Marca: prioriza el JSON hidratado (runParams) y cae al DOM si falta.
      marca: delJson.marca || delDom.marca || null,
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
