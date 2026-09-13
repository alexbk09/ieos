/**
 * Reglas PURAS de indexación (Google / IndexNow).
 * ------------------------------------------------------------------
 * POR QUÉ existe este archivo:
 *   1. La lógica de "qué se puede enviar, a dónde y con qué límites" es la
 *      parte crítica del negocio de SEO y debe ser testeable sin red ni
 *      Supabase (Testing Económico: solo cálculo y validación).
 *   2. Concentra la POLÍTICA de Google en un único punto auditable:
 *      "The Indexing API can only be used to crawl pages with either
 *      JobPosting or BroadcastEvent embedded in a VideoObject"
 *      (https://developers.google.com/search/apis/indexing-api/v3/quickstart).
 *   3. Evita magic numbers en los servicios: los valores llegan inyectados
 *      desde lib/constants.ts.
 *
 * Formato .mjs para que Node lo ejecute directamente en los tests.
 */

/** Tipos de contenido que esta plataforma publica (y puede empujar a buscadores). */
export const TIPOS_CONTENIDO_INDEXABLE = [
  'producto', // /productos/[slug]
  'categoria', // /categoria/[slug]
  'guia', // /guias/[slug]
  'pagina', // rutas estáticas (home, catálogo, etc.)
  'job_posting', // empleo: único tipo soportado por la Indexing API
  'broadcast_event', // livestream (VideoObject): único tipo soportado por la Indexing API
]

/**
 * Tipos admitidos OFICIALMENTE por la Indexing API de Google.
 * Cualquier otro uso va contra las directrices y arriesga revocar el acceso.
 */
export const TIPOS_SOPORTADOS_POR_GOOGLE_INDEXING_API = ['job_posting', 'broadcast_event']

/** Código HTTP 429 = se superó la cuota del buscador. */
const HTTP_TOO_MANY_REQUESTS = 429

/** Código HTTP 400 = petición mal formada: reintentar no la arregla. */
const HTTP_BAD_REQUEST = 400

/**
 * Indica si un tipo de contenido puede enviarse por la Indexing API de Google.
 * @param {string} tipo Tipo de contenido ('producto', 'guia', 'job_posting'…).
 * @returns {boolean} true solo para JobPosting/BroadcastEvent.
 */
export function esTipoSoportadoPorGoogle(tipo) {
  return TIPOS_SOPORTADOS_POR_GOOGLE_INDEXING_API.includes(String(tipo ?? '').trim())
}

/**
 * Decide a qué canales se envía una URL recién publicada.
 * ------------------------------------------------------------------
 * Google no ofrece API pública de "solicitar indexación" para páginas
 * normales (el botón de Search Console es solo interfaz) y su Indexing API
 * está restringida por política; por eso el plan por defecto es:
 *   - IndexNow  → empuje inmediato (Bing, Yandex, Seznam, Naver).
 *   - Sitemap    → Google recrawlea por `lastmod` (ISR + revalidate on-demand).
 *   - Google Indexing API → SOLO si el tipo está soportado.
 *
 * @param {string} tipo Tipo de contenido publicado.
 * @param {{ googleIndexingEstricto?: boolean }} [opciones]
 *   `googleIndexingEstricto` (por defecto true) bloquea el envío de tipos no
 *   soportados. Ponerlo en false es una decisión consciente del operador:
 *   el sistema lo marca como riesgo de política y lo deja auditado.
 * @returns {{ indexnow: boolean; google: boolean; sitemap: boolean; riesgoPolitica: boolean; motivo: string }}
 */
export function planificarCanales(tipo, opciones = {}) {
  const { googleIndexingEstricto = true } = opciones
  const tipoNormalizado = String(tipo ?? '').trim()
  if (!TIPOS_CONTENIDO_INDEXABLE.includes(tipoNormalizado)) {
    return {
      indexnow: false,
      google: false,
      sitemap: false,
      riesgoPolitica: false,
      motivo: `Tipo de contenido no indexable: ${tipoNormalizado || '(vacío)'}.`,
    }
  }

  const soportadoPorGoogle = esTipoSoportadoPorGoogle(tipoNormalizado)
  const google = soportadoPorGoogle || googleIndexingEstricto === false

  return {
    indexnow: true,
    google,
    sitemap: true,
    riesgoPolitica: google && !soportadoPorGoogle,
    motivo: soportadoPorGoogle
      ? 'Tipo soportado por la Indexing API (JobPosting/BroadcastEvent).'
      : google
        ? 'AVISO: se enviará a la Indexing API un tipo NO soportado por Google; el acceso puede revocarse.'
        : 'La Indexing API solo admite JobPosting/BroadcastEvent: se usa IndexNow + sitemap (cumplimiento estricto).',
  }
}

/**
 * Normaliza y valida una URL antes de enviarla a un buscador.
 * POR QUÉ: los buscadores rechazan URLs relativas, con fragmento (#) o de un
 * dominio que no sea el tuyo (IndexNow responde 422 si el host no coincide).
 *
 * @param {string} valor URL absoluta o ruta interna ('/productos/x').
 * @param {string} origin Origin del sitio (ej. 'https://zonadehobbies.online').
 * @returns {{ valida: boolean; url: string; motivo: string }}
 */
export function normalizarUrlParaBuscadores(valor, origin) {
  const base = String(origin ?? '').trim().replace(/\/+$/, '')
  if (!base) return { valida: false, url: '', motivo: 'Falta el origin del sitio (NEXT_PUBLIC_SITE_URL).' }

  let hostBase = ''
  try {
    hostBase = new URL(base).host
  } catch {
    return { valida: false, url: '', motivo: 'El origin del sitio no es una URL válida.' }
  }

  const crudo = String(valor ?? '').trim()
  if (!crudo) return { valida: false, url: '', motivo: 'URL vacía.' }

  let destino = null
  try {
    destino = new URL(/^https?:\/\//i.test(crudo) ? crudo : `${base}${crudo.startsWith('/') ? '' : '/'}${crudo}`)
  } catch {
    return { valida: false, url: '', motivo: 'URL inválida (RFC 3986).' }
  }

  if (destino.protocol !== 'https:' && destino.protocol !== 'http:') {
    return { valida: false, url: '', motivo: 'Solo se admiten URLs http(s).' }
  }
  if (destino.host !== hostBase) {
    return { valida: false, url: '', motivo: 'La URL no pertenece al dominio del sitio.' }
  }

  // El fragmento no identifica un recurso indexable: se descarta.
  destino.hash = ''
  return { valida: true, url: destino.toString(), motivo: '' }
}

/**
 * Valida la clave de IndexNow: 8-128 caracteres [a-zA-Z0-9-].
 * @param {string} clave Clave configurada en INDEXNOW_KEY.
 * @returns {boolean} true si el buscador la aceptará.
 */
export function validarClaveIndexNow(clave) {
  const texto = String(clave ?? '').trim()
  return /^[a-zA-Z0-9-]{8,128}$/.test(texto)
}


/**
 * Calcula la cuota diaria consumida/restante de envíos a buscadores.
 * @param {number} consumidos Envíos correctos ya realizados hoy.
 * @param {number} limite Tope diario configurado (INDEXING_DAILY_LIMIT).
 * @returns {{ consumidos: number; limite: number; restantes: number; agotada: boolean }}
 */
export function calcularCuotaDiaria(consumidos, limite) {
  const tope = Math.max(0, Math.floor(Number(limite) || 0))
  const usados = Math.min(tope, Math.max(0, Math.floor(Number(consumidos) || 0)))
  const restantes = Math.max(0, tope - usados)
  return { consumidos: usados, limite: tope, restantes, agotada: restantes === 0 }
}

/**
 * Recorta la lista de URLs a enviar respetando el tamaño de lote y la cuota.
 * @template T Tipo de elemento de la lista (filas de la cola).
 * @param {T[]} urls URLs pendientes en orden de prioridad.
 * @param {number} tamanoLote Máximo de URLs por tanda (SEO_INDEXING_BATCH_SIZE).
 * @param {number} cuotaRestante Envíos que aún permite la cuota diaria.
 * @returns {T[]} Subconjunto a enviar en esta tanda.
 */
export function seleccionarLote(urls, tamanoLote, cuotaRestante) {
  const lista = Array.isArray(urls) ? urls : []
  const porTanda = Math.max(0, Math.floor(Number(tamanoLote) || 0))
  const disponibles = Math.max(0, Math.floor(Number(cuotaRestante) || 0))
  return lista.slice(0, Math.min(porTanda, disponibles))
}

/**
 * Construye el cuerpo JSON del POST a IndexNow.
 * @param {{ host: string; key: string; keyLocation?: string; urls: string[] }} entrada Datos del envío.
 * @returns {{ host: string; key: string; keyLocation?: string; urlList: string[] } | null} Payload o null si falta algo.
 */
export function construirCargaIndexNow(entrada) {
  const host = String(entrada?.host ?? '').trim()
  const key = String(entrada?.key ?? '').trim()
  const urls = (Array.isArray(entrada?.urls) ? entrada.urls : []).filter(Boolean)
  if (!host || !validarClaveIndexNow(key) || urls.length === 0) return null

  const keyLocation = String(entrada?.keyLocation ?? '').trim()
  return keyLocation ? { host, key, keyLocation, urlList: urls } : { host, key, urlList: urls }
}

/**
 * Decide si un envío fallido debe reintentarse más tarde.
 * Reintentar un 4xx (salvo 429) es inútil y solo gasta cuota.
 * @param {number} httpStatus Código HTTP devuelto (0 = fallo de red).
 * @param {number} intentos Intentos ya realizados.
 * @param {number} maxIntentos Tope de intentos configurado.
 * @returns {boolean} true si conviene reintentar.
 */
export function decidirReintento(httpStatus, intentos, maxIntentos) {
  const usados = Math.max(0, Math.floor(Number(intentos) || 0))
  const tope = Math.max(1, Math.floor(Number(maxIntentos) || 1))
  if (usados >= tope) return false

  const status = Math.floor(Number(httpStatus) || 0)
  if (status === 0) return true // fallo de red/tiempo de espera
  if (status === HTTP_TOO_MANY_REQUESTS) return true
  if (status >= HTTP_BAD_REQUEST && status < 500) return false
  return status >= 500
}

/**
 * Traduce la respuesta de la URL Inspection API de Google al estado interno.
 * Referencia: searchconsole.googleapis.com/v1/urlInspection/index:inspect
 * @param {object|null|undefined} respuesta Respuesta cruda del API.
 * @returns {'indexado' | 'no_indexado' | 'excluido' | 'desconocido'}
 */
export function estadoDesdeInspeccion(respuesta) {
  const indexStatus = respuesta?.inspectionResult?.indexStatusResult
  if (!indexStatus) return 'desconocido'

  const verdict = String(indexStatus.verdict ?? '').toUpperCase()
  const cobertura = String(indexStatus.coverageState ?? '').toLowerCase()
  const indexacion = String(indexStatus.indexingState ?? '').toUpperCase()
  const robots = String(indexStatus.robotsTxtState ?? '').toUpperCase()

  // Exclusión deliberada: noindex o bloqueo en robots.txt (no es una incidencia).
  if (
    indexacion === 'BLOCKED_BY_META_TAG' ||
    indexacion === 'BLOCKED_BY_HTTP_HEADER' ||
    robots === 'DISALLOWED' ||
    cobertura.includes('noindex')
  ) {
    return 'excluido'
  }

  if (verdict === 'PASS') return 'indexado'
  if (cobertura.includes('unknown to google')) return 'no_indexado'
  if (verdict === 'FAIL') return 'no_indexado'
  return 'no_indexado'
}

/**
 * Resume una lista de URLs por estado (alimenta las tarjetas del panel).
 * @param {Array<{ estado?: string }>} items Filas de la cola de indexación.
 * @returns {{ total: number; pendiente: number; enviando: number; enviado: number; indexado: number; no_indexado: number; excluido: number; error: number }}
 */
export function resumirEstados(items = []) {
  const resumen = {
    total: 0,
    pendiente: 0,
    enviando: 0,
    enviado: 0,
    indexado: 0,
    no_indexado: 0,
    excluido: 0,
    error: 0,
  }
  for (const item of Array.isArray(items) ? items : []) {
    resumen.total += 1
    const estado = String(item?.estado ?? 'pendiente')
    if (estado !== 'total' && estado in resumen) resumen[estado] += 1
  }
  return resumen
}
