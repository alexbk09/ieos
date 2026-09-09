import { createClient as createServerClient } from '@/lib/supabase/server'
import { SCRAPER_ALIEXPRESS_MODULE_SLUG } from '@/lib/constants'

/**
 * Servicio de persistencia del historial de Scraping AliExpress.
 * ------------------------------------------------------------------
 * Cada invocación a scrapearProductoAliExpress (éxito o error) queda
 * registrada en la tabla `scraper_logs` para que el panel admin de
 * monitoreo muestre el flujo completo: qué URL se intentó, quién lo
 * disparó, estado, duración y el payload extraído (o el error).
 *
 * Respeta la capa de abstracción: ningún componente llama a Supabase.
 */

/** Nivel de severidad del log de scraping. */
export type ScraperEstadoLog = 'inicio' | 'exito' | 'error'

/** Registro persistido en scraper_logs. */
export type ScraperLogRow = {
  id: string
  url_producto: string
  estado: ScraperEstadoLog
  mensaje: string | null
  datos_json: unknown | null
  error_json: string | null
  usuario_email: string | null
  duracion_ms: number | null
  created_at: string
}

/**
 * Registra un evento del scraper en scraper_logs.
 * Incluye siempre datos defensivos: si la inserción falla, solo se loguea
 * en consola para no romper el flujo original que invocó al scraper.
 */
export async function registrarLogScraper(input: {
  urlProducto: string
  estado: ScraperEstadoLog
  mensaje?: string | null
  datosJson?: unknown
  errorJson?: string | null
  usuarioEmail?: string | null
  duracionMs?: number | null
}) {
  try {
    const supabase = await createServerClient()
    const { error } = await supabase.from('scraper_logs').insert({
      url_producto: input.urlProducto,
      estado: input.estado,
      mensaje: input.mensaje ?? null,
      datos_json: input.datosJson ?? null,
      error_json: input.errorJson ?? null,
      usuario_email: input.usuarioEmail ?? null,
      duracion_ms: input.duracionMs ?? null,
    })
    if (error) {
      console.error('[aliScraperLogs] No se pudo insertar log:', error.message)
      return { success: false as const, error: error.message }
    }
    return { success: true as const }
  } catch (err: any) {
    console.error('[aliScraperLogs] Error al registrar log:', err?.message ?? err)
    return { success: false as const, error: err?.message ?? 'Error registrando log' }
  }
}

/**
 * Devuelve los últimos N registros de scraping para el panel admin.
 * Solo se ejecuta en servidor (requiere sesión de admin en la API route).
 */
export async function obtenerHistorialScraper(limite = 50) {
  try {
    const supabase = await createServerClient()
    const { data, error } = await supabase
      .from('scraper_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limite)
    if (error) return { success: false as const, error: error.message }
    return { success: true as const, data: (data ?? []) as ScraperLogRow[] }
  } catch (err: any) {
    console.error('[aliScraperLogs] obtenerHistorialScraper:', err?.message)
    return { success: false as const, error: err?.message ?? 'Error leyendo historial' }
  }
}

/**
 * Limpia el historial de scraping (uso admin con confirmación).
 */
export async function limpiarHistorialScraper() {
  try {
    const supabase = await createServerClient()
    const { error } = await supabase.from('scraper_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
  } catch (err: any) {
    console.error('[aliScraperLogs] limpiarHistorialScraper:', err?.message)
    return { success: false as const, error: err?.message ?? 'Error limpiando historial' }
  }
}

export function protegerModuloScraper() {
  return { moduleSlug: SCRAPER_ALIEXPRESS_MODULE_SLUG }
}