import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { SCRAPER_ALIEXPRESS_MODULE_SLUG } from '@/lib/constants'
import { scrapearProductoAliExpress } from '@/services/aliScraper'
import {
  obtenerHistorialScraper,
  limpiarHistorialScraper,
  registrarLogScraper,
} from '@/services/aliScraperLogs'

/**
 * API route del módulo Scraper AliExpress (solo administrador).
 * ------------------------------------------------------------------
 * - POST   -> ejecuta el scraper sobre una URL y registra el log completo.
 * - GET    -> devuelve el historial de extracciones (monitoreo admin).
 * - DELETE -> limpia el historial.
 *
 * Seguridad integrada:
 *   1) requireAdmin() fuerza sesión activa + rol administrador.
 *   2) hasPermission('scraper_aliexpress', action) valida el permiso RBAC
 *      del rol del usuario sobre este módulo específico.
 *   3) El scraper corre en el servidor; nunca se exponen API keys al cliente.
 */

export const runtime = 'nodejs'
export const maxDuration = 90

/** Valida la URL enviada en el body. */
function parsearUrlProducto(body: { urlProduct?: unknown }): { url: string | null; error: string | null } {
  const cruda = typeof body?.urlProduct === 'string' ? body.urlProduct.trim() : ''
  if (!cruda) return { url: null, error: 'El campo urlProduct es obligatorio.' }
  const esAliExpress = /aliexpress\./i.test(cruda)
  if (!esAliExpress) return { url: null, error: 'La URL debe pertenecer a AliExpress.' }
  return { url: cruda, error: null }
}

export async function POST(request: Request) {
  const { user } = await requireAdmin()
  const puedeEscribir = await hasPermission(SCRAPER_ALIEXPRESS_MODULE_SLUG, 'write')
  if (!puedeEscribir) {
    return NextResponse.json({ error: 'No tienes permiso para ejecutar el scraper.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as { urlProduct?: unknown }
  const { url, error } = parsearUrlProducto(body)
  if (error || !url) return NextResponse.json({ error }, { status: 400 })

  const inicio = Date.now()
  const emailUsuario = user?.email ?? null

  try {
    // Log inicial del intento (flujo de monitoreo).
    await registrarLogScraper({
      urlProducto: url,
      estado: 'inicio',
      mensaje: 'Inicia extracción con renderizado JS.',
      usuarioEmail: emailUsuario,
    })

    const resultado = await scrapearProductoAliExpress(url)
    const duracionMs = Date.now() - inicio

    if (!resultado.success) {
      // Registro de error con mensaje descriptivo para el panel admin.
      await registrarLogScraper({
        urlProducto: url,
        estado: 'error',
        mensaje: resultado.error,
        errorJson: resultado.error,
        usuarioEmail: emailUsuario,
        duracionMs,
      })
      return NextResponse.json({ success: false, error: resultado.error }, { status: 422 })
    }

    // Log de éxito incluyendo el payload extraído (JSONB en scraper_logs).
    await registrarLogScraper({
      urlProducto: url,
      estado: 'exito',
      mensaje: `Extracción completada en ${duracionMs} ms.`,
      datosJson: resultado.data,
      usuarioEmail: emailUsuario,
      duracionMs,
    })

    return NextResponse.json({ success: true, data: resultado.data, duracionMs })
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Error inesperado al scrapear.'
    console.error('[api/scraper-aliexpress] POST:', mensaje)
    return NextResponse.json({ success: false, error: mensaje }, { status: 500 })
  }
}

export async function GET() {
  await requireAdmin()
  const puedeLeer = await hasPermission(SCRAPER_ALIEXPRESS_MODULE_SLUG, 'read')
  if (!puedeLeer) {
    return NextResponse.json({ error: 'No tienes permiso para ver el historial.' }, { status: 403 })
  }

  const historial = await obtenerHistorialScraper(100)
  if (!historial.success) {
    return NextResponse.json({ error: historial.error }, { status: 500 })
  }
  return NextResponse.json({ success: true, data: historial.data })
}

export async function DELETE() {
  await requireAdmin()
  const puedeBorrar = await hasPermission(SCRAPER_ALIEXPRESS_MODULE_SLUG, 'delete')
  if (!puedeBorrar) {
    return NextResponse.json({ error: 'No tienes permiso para limpiar el historial.' }, { status: 403 })
  }

  const resultado = await limpiarHistorialScraper()
  if (!resultado.success) {
    return NextResponse.json({ error: resultado.error }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}