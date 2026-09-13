import crypto from 'node:crypto'
import {
  GOOGLE_INDEXING_API_ENDPOINT,
  GOOGLE_INDEXING_OAUTH_SCOPES,
  GOOGLE_OAUTH_TOKEN_ENDPOINT,
  GOOGLE_OAUTH_TOKEN_REFRESH_MARGIN_SECONDS,
  GOOGLE_OAUTH_TOKEN_TTL_SECONDS,
  GOOGLE_SEARCH_CONSOLE_SITEMAPS_ENDPOINT,
  GOOGLE_URL_INSPECTION_ENDPOINT,
  SEO_INDEXING_REQUEST_TIMEOUT_MS,
} from '@/lib/constants'
import { DEFAULT_LOCALE } from '@/lib/i18n-config'
import { getSiteOrigin } from '@/lib/seo-url'
import { leerBanderaEntorno } from '@/lib/runtime-flags'
import { estadoDesdeInspeccion, planificarCanales } from '@/lib/indexing-rules.mjs'

/**
 * Servicio de Google para indexaciÃ³n (SOLO servidor).
 * ------------------------------------------------------------------
 * Responsabilidad Ãºnica: hablar con Google usando la cuenta de servicio
 * configurada en el entorno. AquÃ­ NO hay UI, y Google nunca se llama desde
 * catalog/entries: esas rutas solo encolan y delegan en /services/seo-indexing
 * (regla de oro del proyecto).
 *
 * Capacidades y por quÃ© cada una:
 *   1. Indexing API (`urlNotifications:publish`)
 *      Google la restringe a pÃ¡ginas con JobPosting o BroadcastEvent. Se
 *      expone completa, pero con guardia de polÃ­tica activada por defecto.
 *   2. URL Inspection API (`urlInspection.index:inspect`)
 *      SOLO LECTURA: devuelve el estado real de una URL en el Ã­ndice de Google
 *      (`coverageState`). Es la Ãºnica vÃ­a oficial de auditar quÃ© falta.
 *   3. Search Console Sitemaps API (`sitemaps.put`)
 *      ReenvÃ­a el sitemap: canal correcto para volver a pedir el rastreo de
 *      muchas URLs normales (el ping GET desapareciÃ³ en 2023).
 *
 * AutenticaciÃ³n: JWT firmado con RS256 (node:crypto) canjeado por un access
 * token OAuth2, cacheado en memoria y renovado 5 min antes de expirar.
 */

/** DiagnÃ³stico de la configuraciÃ³n de Google (lo muestra el panel). */
export type GoogleIndexingConfig = {
  /** true si hay credenciales utilizables. */
  configurado: boolean
  /** true = solo se envÃ­an tipos soportados por Google (JobPosting/BroadcastEvent). */
  estricto: boolean
  /** Correo de la cuenta de servicio (nunca la clave privada). */
  clientEmail: string | null
  projectId: string | null
  /** Propiedad de Search Console usada para inspeccionar y reenviar sitemap. */
  siteUrl: string | null
  /** ExplicaciÃ³n legible para el operador. */
  motivo: string
}

/** Resultado de una operaciÃ³n contra Google. */
export type ResultadoGoogle = {
  ok: boolean
  httpStatus: number
  /** true si el envÃ­o se evitÃ³ por la polÃ­tica de Google. */
  bloqueadoPolitica: boolean
  /** true si se enviÃ³ un tipo fuera de las directrices (modo no estricto). */
  riesgoPolitica: boolean
  detalle: string
}

/** Resultado de una inspecciÃ³n de URL en Google (solo lectura). */
export type ResultadoInspeccion = {
  ok: boolean
  httpStatus: number
  estado: 'indexado' | 'no_indexado' | 'excluido' | 'desconocido'
  /** `coverageState` crudo de Google (diagnÃ³stico para el operador). */
  cobertura: string | null
  detalle: string
}

/** Token OAuth2 cacheado en memoria del proceso. */
let tokenCache: { valor: string; expiraEnSegundos: number } | null = null

/**
 * Indica si el mÃ³dulo debe respetar ESTRICTAMENTE las directrices de Google.
 * @returns true (por defecto) si no se envÃ­an tipos no soportados.
 */
export function estaEnModoEstricto(): boolean {
  return leerBanderaEntorno('GOOGLE_INDEXING_STRICT', true)
}

/**
 * Lee las credenciales de la cuenta de servicio desde el entorno.
 * Acepta la clave privada tal cual (con saltos reales) o con `\n` escapados,
 * que es como se pega normalmente en un .env o en Vercel.
 * @returns Credenciales listas para firmar, o null si falta algo.
 */
function leerCredenciales(): { clientEmail: string; privateKey: string } | null {
  const clientEmail = (process.env.GOOGLE_INDEXING_CLIENT_EMAIL ?? '').trim()
  let privateKey = (process.env.GOOGLE_INDEXING_PRIVATE_KEY ?? '').trim()

  if (!clientEmail || !privateKey) return null

  // En .env la clave llega con "\n" literales: se convierten en saltos reales.
  privateKey = privateKey.replace(/\\n/g, '\n')
  // Soporte defensivo por si la clave se pegÃ³ en base64 (una sola lÃ­nea).
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    try {
      const decodificada = Buffer.from(privateKey, 'base64').toString('utf8')
      if (decodificada.includes('BEGIN PRIVATE KEY')) privateKey = decodificada
    } catch {
      // Si no es base64 vÃ¡lido se deja el original: el error aparecerÃ¡ al
      // firmar y quedarÃ¡ registrado en el log de indexaciÃ³n.
    }
  }

  return { clientEmail, privateKey }
}

/**
 * Propiedad de Search Console sobre la que se inspeccionan las URLs.
 * Se admite el formato de prefijo (`https://dominio/`) o de dominio
 * (`sc-domain:dominio`); si no se configura, se deriva del origin del sitio.
 * @returns Propiedad a usar, o null si no se puede determinar.
 */
export function getSearchConsoleSiteUrl(): string | null {
  const configurada = (process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ?? '').trim()
  if (configurada) return configurada
  try {
    return `${getSiteOrigin()}/`
  } catch {
    return null
  }
}

/**
 * Snapshot legible de la configuraciÃ³n de Google para el panel del admin.
 * @returns Estado de credenciales, modo estricto y propiedad de Search Console.
 */
export function getGoogleIndexingConfig(): GoogleIndexingConfig {
  const credenciales = leerCredenciales()
  const siteUrl = getSearchConsoleSiteUrl()

  return {
    configurado: Boolean(credenciales),
    estricto: estaEnModoEstricto(),
    clientEmail: credenciales?.clientEmail ?? null,
    projectId: (process.env.GOOGLE_INDEXING_PROJECT_ID ?? '').trim() || null,
    siteUrl,
    motivo: credenciales
      ? siteUrl
        ? 'Listo: credenciales y propiedad de Search Console configuradas.'
        : 'Falta la propiedad de Search Console (GOOGLE_SEARCH_CONSOLE_SITE_URL).'
      : 'Faltan GOOGLE_INDEXING_CLIENT_EMAIL / GOOGLE_INDEXING_PRIVATE_KEY en el entorno.',
  }
}

/**
 * Codifica en base64url (formato obligatorio de JWT y de las firmas RS256).
 * @param entrada Texto o buffer a codificar.
 * @returns Cadena base64url sin relleno.
 */
function base64Url(entrada: Buffer | string): string {
  return Buffer.from(entrada)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Ejecuta un fetch con tiempo mÃ¡ximo de espera.
 * POR QUÃ‰: si Google no responde, la operaciÃ³n (publicar/inspeccionar) no debe
 * colgar el panel ni la publicaciÃ³n; se corta y se registra el fallo.
 * @param url Endpoint a invocar.
 * @param init Opciones del fetch.
 * @returns Respuesta HTTP o null si se agotÃ³ el tiempo / fallÃ³ la red.
 */
async function fetchConTimeout(url: string, init: RequestInit): Promise<Response | null> {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), SEO_INDEXING_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controlador.signal, cache: 'no-store' })
  } catch {
    return null
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Obtiene un access token OAuth2 para la cuenta de servicio (con cachÃ©).
 * Flujo: JWT firmado (RS256) â†’ POST al endpoint de token â†’ access_token.
 * @returns Token utilizable o el motivo del fallo.
 */
export async function obtenerTokenDeGoogle(): Promise<{ token: string | null; error: string | null }> {
  // 1) CachÃ© en memoria: Google emite tokens de 1 hora y pedir uno nuevo en
  //    cada request desperdicia cuota y aÃ±ade latencia innecesaria.
  const ahora = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.expiraEnSegundos - GOOGLE_OAUTH_TOKEN_REFRESH_MARGIN_SECONDS > ahora) {
    return { token: tokenCache.valor, error: null }
  }

  const credenciales = leerCredenciales()
  if (!credenciales) {
    return { token: null, error: 'Faltan las credenciales de la cuenta de servicio de Google.' }
  }

  // 2) Construir el JWT de aserciÃ³n (formato exigido por Google).
  const cabecera = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const cuerpo = base64Url(
    JSON.stringify({
      iss: credenciales.clientEmail,
      scope: GOOGLE_INDEXING_OAUTH_SCOPES.join(' '),
      aud: GOOGLE_OAUTH_TOKEN_ENDPOINT,
      iat: ahora,
      exp: ahora + GOOGLE_OAUTH_TOKEN_TTL_SECONDS,
    }),
  )
  const sinFirma = `${cabecera}.${cuerpo}`

  let firma = ''
  try {
    firma = base64Url(crypto.createSign('RSA-SHA256').update(sinFirma).sign(credenciales.privateKey))
  } catch (err: any) {
    return {
      token: null,
      error: 'La clave privada de la cuenta de servicio no es vÃ¡lida: ' + (err?.message ?? 'error'),
    }
  }

  const respuesta = await fetchConTimeout(GOOGLE_OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${sinFirma}.${firma}`,
    }).toString(),
  })
  if (!respuesta) return { token: null, error: 'Google no respondiÃ³ al pedir el token (tiempo agotado).' }

  const datos: any = await respuesta.json().catch(() => null)
  if (!respuesta.ok || !datos?.access_token) {
    return {
      token: null,
      error:
        datos?.error_description ??
        datos?.error ??
        `No se pudo obtener el token de Google (HTTP ${respuesta.status}).`,
    }
  }

  tokenCache = {
    valor: String(datos.access_token),
    expiraEnSegundos: ahora + Number(datos.expires_in ?? GOOGLE_OAUTH_TOKEN_TTL_SECONDS),
  }
  return { token: tokenCache.valor, error: null }
}

/**
 * Notifica a Google una URL por la Indexing API (`urlNotifications:publish`).
 * ------------------------------------------------------------------
 * GUARDIA DE POLÃTICA: Google solo admite JobPosting/BroadcastEvent. Si el
 * tipo no estÃ¡ soportado, NO se envÃ­a y se devuelve `bloqueadoPolitica` para
 * que la URL siga por los canales permitidos (IndexNow + sitemap). AsÃ­ un uso
 * indebido nunca hace que Google revoque el acceso del proyecto.
 *
 * @param url URL absoluta del propio dominio.
 * @param tipo Tipo de contenido ('producto', 'guia', 'job_posting'â€¦).
 * @returns Resultado normalizado con el cÃ³digo HTTP y el motivo.
 */
export async function publicarUrlEnGoogleIndexingApi(url: string, tipo: string): Promise<ResultadoGoogle> {
  const plan = planificarCanales(tipo, { googleIndexingEstricto: estaEnModoEstricto() })

  if (!plan.google) {
    return {
      ok: false,
      httpStatus: 0,
      bloqueadoPolitica: true,
      riesgoPolitica: false,
      detalle: plan.motivo,
    }
  }

  const { token, error } = await obtenerTokenDeGoogle()
  if (!token) {
    return {
      ok: false,
      httpStatus: 0,
      bloqueadoPolitica: false,
      riesgoPolitica: plan.riesgoPolitica,
      detalle: error ?? 'Sin token.',
    }
  }

  const respuesta = await fetchConTimeout(`${GOOGLE_INDEXING_API_ENDPOINT}:publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ url, type: 'URL_UPDATED' }),
  })
  if (!respuesta) {
    return {
      ok: false,
      httpStatus: 0,
      bloqueadoPolitica: false,
      riesgoPolitica: plan.riesgoPolitica,
      detalle: 'Google no respondiÃ³ (tiempo agotado).',
    }
  }

  if (respuesta.ok) {
    return {
      ok: true,
      httpStatus: respuesta.status,
      bloqueadoPolitica: false,
      riesgoPolitica: plan.riesgoPolitica,
      detalle: 'NotificaciÃ³n aceptada: Google programarÃ¡ un rastreo.',
    }
  }

  const datos: any = await respuesta.json().catch(() => null)
  return {
    ok: false,
    httpStatus: respuesta.status,
    bloqueadoPolitica: false,
    riesgoPolitica: plan.riesgoPolitica,
    detalle: datos?.error?.message ?? `Google rechazÃ³ la notificaciÃ³n (HTTP ${respuesta.status}).`,
  }
}

/**
 * Consulta el estado real de una URL en el Ã­ndice de Google.
 * Es SOLO LECTURA (cuota amplia: ~2.000 consultas/dÃ­a por propiedad) y es la
 * pieza que permite listar desde el panel "las que aÃºn NO estÃ¡n indexadas".
 * @param url URL absoluta del propio dominio.
 * @returns Estado normalizado + cobertura cruda de Google.
 */
export async function inspeccionarUrlEnGoogle(url: string): Promise<ResultadoInspeccion> {
  const siteUrl = getSearchConsoleSiteUrl()
  if (!siteUrl) {
    return {
      ok: false,
      httpStatus: 0,
      estado: 'desconocido',
      cobertura: null,
      detalle: 'Falta la propiedad de Search Console.',
    }
  }

  const { token, error } = await obtenerTokenDeGoogle()
  if (!token) {
    return { ok: false, httpStatus: 0, estado: 'desconocido', cobertura: null, detalle: error ?? 'Sin token.' }
  }

  const respuesta = await fetchConTimeout(GOOGLE_URL_INSPECTION_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ inspectionUrl: url, siteUrl, languageCode: DEFAULT_LOCALE }),
  })
  if (!respuesta) {
    return {
      ok: false,
      httpStatus: 0,
      estado: 'desconocido',
      cobertura: null,
      detalle: 'Google no respondiÃ³ (tiempo agotado).',
    }
  }

  const datos: any = await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    return {
      ok: false,
      httpStatus: respuesta.status,
      estado: 'desconocido',
      cobertura: null,
      detalle: datos?.error?.message ?? `No se pudo inspeccionar la URL (HTTP ${respuesta.status}).`,
    }
  }

  const cobertura = datos?.inspectionResult?.indexStatusResult?.coverageState ?? null
  return {
    ok: true,
    httpStatus: respuesta.status,
    estado: estadoDesdeInspeccion(datos) as ResultadoInspeccion['estado'],
    cobertura: cobertura ? String(cobertura) : null,
    detalle: cobertura ? String(cobertura) : 'Sin datos de cobertura.',
  }
}

/**
 * ReenvÃ­a el sitemap a Google Search Console.
 * POR QUÃ‰ es la vÃ­a correcta para pÃ¡ginas normales: Google eliminÃ³ el ping GET
 * de sitemaps en 2023 y no existe API de "solicitar indexaciÃ³n" masiva;
 * reenviar el sitemap hace que Google vuelva a leer los `lastmod` frescos.
 * @param sitemapUrl URL absoluta del sitemap.
 * @returns Resultado con el cÃ³digo HTTP de Search Console.
 */
export async function reenviarSitemapAGoogle(sitemapUrl: string): Promise<ResultadoGoogle> {
  const siteUrl = getSearchConsoleSiteUrl()
  if (!siteUrl) {
    return {
      ok: false,
      httpStatus: 0,
      bloqueadoPolitica: false,
      riesgoPolitica: false,
      detalle: 'Falta la propiedad de Search Console.',
    }
  }

  const { token, error } = await obtenerTokenDeGoogle()
  if (!token) {
    return {
      ok: false,
      httpStatus: 0,
      bloqueadoPolitica: false,
      riesgoPolitica: false,
      detalle: error ?? 'Sin token.',
    }
  }

  const endpoint = `${GOOGLE_SEARCH_CONSOLE_SITEMAPS_ENDPOINT}/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`
  const respuesta = await fetchConTimeout(endpoint, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
  })
  if (!respuesta) {
    return {
      ok: false,
      httpStatus: 0,
      bloqueadoPolitica: false,
      riesgoPolitica: false,
      detalle: 'Google no respondiÃ³ (tiempo agotado).',
    }
  }

  const datos: any = await respuesta.json().catch(() => null)
  return {
    ok: respuesta.ok,
    httpStatus: respuesta.status,
    bloqueadoPolitica: false,
    riesgoPolitica: false,
    detalle: respuesta.ok
      ? 'Sitemap reenviado a Search Console.'
      : datos?.error?.message ?? `Search Console rechazÃ³ el sitemap (HTTP ${respuesta.status}).`,
  }
}
