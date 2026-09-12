import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { ENTRY_MODULE_SLUG } from '@/lib/constants'
import { logEntryGeneration } from '@/services/entries'
import { generateEntryContent } from '@/services/entry-content'

/**
 * API del "botón IA": genera el borrador de una entrada SEO.
 * ------------------------------------------------------------------
 * Recibe el TIPO y (opcionalmente) los nichos/productos elegidos; si no llega
 * nada, el servicio elige el nicho con más productos ("deja que la IA decida").
 *
 * NO persiste nada: devuelve el borrador para que el administrador lo revise en
 * el editor. La publicación es un acto explícito y separado (PATCH estado).
 */

export const runtime = 'nodejs'
/** El modelo tarda: se amplía el límite de la función serverless. */
export const maxDuration = 60

export async function POST(request: Request) {
  await requireAdmin()
  if (!(await hasPermission(ENTRY_MODULE_SLUG, 'write'))) {
    return NextResponse.json({ error: 'No tienes permiso para generar entradas.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const result = await generateEntryContent({
    tipo: typeof body.tipo === 'string' ? body.tipo : undefined,
    categoryIds: Array.isArray(body.categoryIds) ? body.categoryIds.map((id) => String(id)) : undefined,
    productIds: Array.isArray(body.productIds) ? body.productIds.map((id) => String(id)) : undefined,
  })

  if (!result.success) {
    // Se registra el fallo para poder medir la tasa de éxito del prompt.
    await logEntryGeneration({ exito: false, errores: result.error, etapa: 'generacion' })
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  await logEntryGeneration({ exito: true, etapa: 'generacion' })
  return NextResponse.json({ entry: result.data })
}
