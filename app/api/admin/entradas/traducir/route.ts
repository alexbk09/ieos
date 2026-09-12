import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { ENTRY_MODULE_SLUG } from '@/lib/constants'
import { logEntryGeneration } from '@/services/entries'
import { traducirEntrada } from '@/services/i18n-translate'

/**
 * API: traduce una entrada SEO a los idiomas que le falten.
 * ------------------------------------------------------------------
 * POR QUÉ está separado del guardado: traducir cuesta tokens y solo se hace
 * cuando el contenido base ya está revisado. Traduce SOLO lo pendiente (si ya
 * está completo, no llama al modelo) y revalida sitemap + página.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  await requireAdmin()
  if (!(await hasPermission(ENTRY_MODULE_SLUG, 'write'))) {
    return NextResponse.json({ error: 'No tienes permiso para traducir entradas.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })

  const locales = Array.isArray(body.locales) ? body.locales.map((locale) => String(locale)) : undefined
  const result = await traducirEntrada(id, { locales })

  if (!result.success) {
    await logEntryGeneration({ entryId: id, exito: false, errores: result.error, etapa: 'traduccion' })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  await logEntryGeneration({ entryId: id, exito: true, etapa: 'traduccion' })
  return NextResponse.json({ traducidos: result.data.traducidos })
}
