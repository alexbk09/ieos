import { INDEXNOW_ENDPOINT, SEO_INDEXING_REQUEST_TIMEOUT_MS } from '@/lib/constants'
import { getSiteOrigin } from '@/lib/seo-url'
import { leerBanderaEntorno } from '@/lib/runtime-flags'
import { construirCargaIndexNow, validarClaveIndexNow } from '@/lib/indexing-rules.mjs'

/**
 * Servicio IndexNow (SOLO servidor).
 * ------------------------------------------------------------------
 * POR QUÉ es el canal de empuje inmediato de este proyecto:
 *   - Google NO ofrece API pública para pedir la indexación de páginas
 *     normales (su Indexing API está restringida a JobPosting/BroadcastEvent
 *     y su ping de sitemaps se eliminó en 2023).
 *   - IndexNow es un protocolo ABIERTO que acepta CUALQUIER tipo de página y
 *     comparte la notificación entre los buscadores participantes (Bing,
 *     Yandex, Seznam, Naver). Es la forma legítima de "avisar ya" cuando la IA
 *     publica un producto, una categoría o una guía.
 *
 * Requisitos que cumple la implementación:
 *   - La clave se publica en `/{clave}.txt` en la raíz del dominio (ver
 *     `public/<clave>.txt`), que es la verificación de propiedad exigida.
 *   - El `host` del payload debe coincidir con el dominio de las URLs
 *     (si no, IndexNow responde 422).
 *   - Se envía en lotes acotados por el límite diario del panel para no
 *     comportarse como spam a escala.
 */

/** Diagnóstico de la configuración de IndexNow (lo muestra el panel). */
export type IndexNowConfig = {
  /** Flag INDEXNOW_ENABLED (true por defecto). */
  habilitado: boolean
  /** true si hay clave válida y host resoluble. */
  configurado: boolean
  /** Clave pública de verificación (no es un secreto). */
  clave: string | null
  endpoint: string
  host: string | null
  /** URL del archivo de verificación que debe existir en el dominio. */
  keyLocation: string | null
  motivo: string
}

/** Resultado de un envío a IndexNow. */
export type ResultadoIndexNow = {
  ok: boolean
  httpStatus: number
  enviadas: number
  detalle: string
}

/**
 * Devuelve la configuración efectiva de IndexNow.
 * @returns Flag, clave, endpoint, host y archivo de verificación.
 */
export function getIndexNowConfig(): IndexNowConfig {
  const habilitado = leerBanderaEntorno('INDEXNOW_ENABLED', true)
  const clave = (process.env.INDEXNOW_KEY ?? '').trim()
  const endpoint = (process.env.INDEXNOW_ENDPOINT ?? '').trim() || INDEXNOW_ENDPOINT

  let host: string | null = null
  let keyLocation: string | null = null
  try {
    const origin = getSiteOrigin()
    host = new URL(origin).host
    keyLocation = validarClaveIndexNow(clave) ? `${origin}/${clave}.txt` : null
  } catch {
    host = null
  }

  const claveValida = validarClaveIndexNow(clave)
  const configurado = habilitado && claveValida && Boolean(host)

  return {
    habilitado,
    configurado,
    clave: claveValida ? clave : null,
    endpoint,
    host,
    keyLocation,
    motivo: !habilitado
      ? 'IndexNow desactivado (INDEXNOW_ENABLED=0).'
      : !claveValida
        ? 'Falta INDEXNOW_KEY o no cumple el formato (8-128 caracteres [a-zA-Z0-9-]).'
        : !host
          ? 'No se pudo resolver el dominio del sitio (NEXT_PUBLIC_SITE_URL).'
          : 'Listo: IndexNow configurado.',
  }
}

/** Resultado del auto-diagnóstico del archivo de verificación de IndexNow. */
export type VerificacionClaveIndexNow = {
  ok: boolean
  httpStatus: number
  url: string | null
  detalle: string
}

/**
 * Comprueba que el archivo de verificación existe en el dominio y contiene la
 * clave configurada.
 * POR QUÉ existe: IndexNow rechaza TODOS los envíos (403) si ese archivo falta o
 * no coincide; sin esta comprobación, una instalación nueva enviaría a ciegas.
 * @returns Resultado con el código HTTP y el motivo legible.
 */
export async function verificarArchivoClaveIndexNow(): Promise<VerificacionClaveIndexNow> {
  const config = getIndexNowConfig()
  if (!config.clave || !config.keyLocation) {
    return { ok: false, httpStatus: 0, url: config.keyLocation, detalle: config.motivo }
  }

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), SEO_INDEXING_REQUEST_TIMEOUT_MS)
  try {
    const respuesta = await fetch(config.keyLocation, { signal: controlador.signal, cache: 'no-store' })
    if (!respuesta.ok) {
      return {
        ok: false,
        httpStatus: respuesta.status,
        url: config.keyLocation,
        detalle: `El archivo respondió HTTP ${respuesta.status}. Genera el archivo con «npm run indexnow:key» y vuelve a desplegar.`,
      }
    }

    const cuerpo = (await respuesta.text()).trim()
    const ok = cuerpo === config.clave
    return {
      ok,
      httpStatus: respuesta.status,
      url: config.keyLocation,
      detalle: ok
        ? 'Archivo de verificación correcto.'
        : `El archivo no contiene la clave configurada (contiene "${cuerpo.slice(0, 40)}"). Regenera con «npm run indexnow:key».`,
    }
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 0,
      url: config.keyLocation,
      detalle: 'No se pudo descargar el archivo de verificación: ' + (err?.message ?? 'error de red'),
    }
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Envía un lote de URLs a IndexNow en UNA petición (máx. el tamaño de tanda).
 * @param urls URLs absolutas del propio dominio.
 * @returns Resultado con el código HTTP (200/202 se consideran correctos).
 */
export async function enviarUrlsAIndexNow(urls: string[]): Promise<ResultadoIndexNow> {
  const config = getIndexNowConfig()
  if (!config.configurado || !config.host) {
    return { ok: false, httpStatus: 0, enviadas: 0, detalle: config.motivo }
  }

  const carga = construirCargaIndexNow({
    host: config.host,
    key: config.clave ?? '',
    keyLocation: config.keyLocation ?? undefined,
    urls,
  })
  if (!carga) {
    return { ok: false, httpStatus: 0, enviadas: 0, detalle: 'No hay URLs válidas para enviar.' }
  }

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), SEO_INDEXING_REQUEST_TIMEOUT_MS)
  try {
    const respuesta = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(carga),
      signal: controlador.signal,
      cache: 'no-store',
    })

    // 200 = aceptado; 202 = aceptado con verificación de clave pendiente.
    const ok = respuesta.status === 200 || respuesta.status === 202
    return {
      ok,
      httpStatus: respuesta.status,
      enviadas: ok ? carga.urlList.length : 0,
      detalle: ok
        ? `IndexNow aceptó ${carga.urlList.length} URL(s).`
        : `IndexNow rechazó el lote (HTTP ${respuesta.status}). Revisa la clave y el archivo /${config.clave}.txt.`,
    }
  } catch (err: any) {
    return {
      ok: false,
      httpStatus: 0,
      enviadas: 0,
      detalle: 'No se pudo contactar con IndexNow: ' + (err?.message ?? 'error de red'),
    }
  } finally {
    clearTimeout(temporizador)
  }
}
