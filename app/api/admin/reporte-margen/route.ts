import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { getReporteMargen } from '@/services/margen-neto'
import { REPORTE_MARGEN_MODULE_SLUG } from '@/lib/constants'

/**
 * GET: Genera el reporte de margen neto del período indicado.
 * Query params: ?inicio=YYYY-MM-DD&fin=YYYY-MM-DD
 * Requiere permiso de lectura del módulo 'reporte_margen'.
 */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission(REPORTE_MARGEN_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })

  const url = new URL(request.url)
  const inicio = url.searchParams.get('inicio')
  const fin = url.searchParams.get('fin')

  const result = await getReporteMargen(inicio ?? '', fin ?? '')
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })

  return NextResponse.json(result.data)
}