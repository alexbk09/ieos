/**
 * Declaración de tipos para lib/indexing-rules.mjs.
 * Lógica pura de indexación (Google Indexing API / Search Console / IndexNow).
 */

/** Tipos de contenido publicable en la plataforma. */
export type TipoContenidoIndexable =
  | 'producto'
  | 'categoria'
  | 'guia'
  | 'pagina'
  | 'job_posting'
  | 'broadcast_event'

/** Estados internos de una URL en la cola de indexación. */
export type EstadoIndexacion = 'pendiente' | 'enviado' | 'indexado' | 'no_indexado' | 'excluido' | 'error'

/** Canales de notificación a buscadores soportados. */
export type CanalIndexacion = 'indexnow' | 'google_indexing' | 'sitemap'

export const TIPOS_CONTENIDO_INDEXABLE: readonly TipoContenidoIndexable[]
export const TIPOS_SOPORTADOS_POR_GOOGLE_INDEXING_API: readonly string[]

/** Indica si el tipo está soportado por la Indexing API (JobPosting/BroadcastEvent). */
export function esTipoSoportadoPorGoogle(tipo: string): boolean

/** Plan de canales a usar para un tipo de contenido. */
export type PlanCanales = {
  indexnow: boolean
  google: boolean
  sitemap: boolean
  riesgoPolitica: boolean
  motivo: string
}

/** Decide a qué canales se envía una URL recién publicada. */
export function planificarCanales(
  tipo: string,
  opciones?: { googleIndexingEstricto?: boolean },
): PlanCanales

/** Resultado de normalizar/validar una URL para buscadores. */
export type UrlValidada = { valida: boolean; url: string; motivo: string }

/** Normaliza y valida una URL contra el origin del sitio. */
export function normalizarUrlParaBuscadores(valor: string, origin: string): UrlValidada

/** Valida la clave de IndexNow (8-128 caracteres [a-zA-Z0-9-]). */
export function validarClaveIndexNow(clave: string): boolean

/** Cuota diaria de envíos. */
export type CuotaDiaria = {
  consumidos: number
  limite: number
  restantes: number
  agotada: boolean
}

/** Calcula la cuota diaria consumida/restante. */
export function calcularCuotaDiaria(consumidos: number, limite: number): CuotaDiaria

/** Recorta la lista de URLs respetando tamaño de lote y cuota diaria. */
export function seleccionarLote<T>(urls: T[], tamanoLote: number, cuotaRestante: number): T[]

/** Cuerpo JSON del POST a IndexNow. */
export type CargaIndexNow = {
  host: string
  key: string
  keyLocation?: string
  urlList: string[]
}

/** Construye el payload de IndexNow (null si falta host/clave/URLs). */
export function construirCargaIndexNow(entrada: {
  host: string
  key: string
  keyLocation?: string
  urls: string[]
}): CargaIndexNow | null

/** Decide si un envío fallido debe reintentarse. */
export function decidirReintento(httpStatus: number, intentos: number, maxIntentos: number): boolean

/** Traduce la respuesta de la URL Inspection API al estado interno. */
export function estadoDesdeInspeccion(
  respuesta:
    | {
        inspectionResult?: {
          indexStatusResult?: {
            verdict?: string
            coverageState?: string
            indexingState?: string
            robotsTxtState?: string
          }
        }
      }
    | null
    | undefined,
): 'indexado' | 'no_indexado' | 'excluido' | 'desconocido'

/** Resumen de la cola por estado. */
export type ResumenEstados = {
  total: number
  pendiente: number
  enviando: number
  enviado: number
  indexado: number
  no_indexado: number
  excluido: number
  error: number
}

/** Agrupa las filas de la cola por estado. */
export function resumirEstados(items: Array<{ estado?: string }>): ResumenEstados
