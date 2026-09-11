import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { CATEGORY_I18N_MODULE_SLUG, I18N_PENDING_BATCH_LIMIT } from '@/lib/constants'
import { getPendingTranslationsSummary, translatePendingBatch } from '@/services/i18n-pending'

/**
 * API: Traducción de contenido pendiente (panel "Idiomas y Traducciones").
 * ------------------------------------------------------------------
 * - GET  → resumen de pendientes (productos / categorías / total). Requiere `read`.
 * - POST → ejecuta una tanda acotada de traducción. Requiere `write`.
 * Todo el acceso a datos vive en /services/i18n-pending (regla de oro).
 */

/** GET: cuenta de productos y categorías con traducciones pendientes. */
export async function GET() {
  await requireAdmin()
  const canRead = await hasPermission(CATEGORY_I18N_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'Sin permiso para ver traducciones.' }, { status: 403 })

  const { data, error } = await getPendingTranslationsSummary()
  if (error) return NextResponse.json({ error: error.message ?? 'No se pudieron contar los pendientes.' }, { status: 400 })
  return NextResponse.json({ pending: data })
}

/**
 * POST: traduce una tanda de contenido pendiente.
 * El `limit` acota la duración de la petición; el panel repite tandas hasta
 * terminar y va mostrando el progreso.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(CATEGORY_I18N_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'Sin permiso para traducir.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const limit = Number(body?.limit) || I18N_PENDING_BATCH_LIMIT

  const { data, error } = await translatePendingBatch({ limit })
  if (error) return NextResponse.json({ error: error.message ?? 'No se pudo traducir.' }, { status: 400 })
  return NextResponse.json(data)
}
