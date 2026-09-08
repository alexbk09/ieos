import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { ANALYTICS_PRODUCTS_MODULE_SLUG } from '@/lib/constants'
import { getProductAnalytics } from '@/services/analytics'

/**
 * API: Reporte de analítica de productos (solo admin).
 * Query params: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Requiere permiso de lectura del módulo 'analytics_productos'.
 */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission(ANALYTICS_PRODUCTS_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })

  const url = new URL(request.url)
  const desde = url.searchParams.get('desde') ?? ''
  const hasta = url.searchParams.get('hasta') ?? ''

  // Valida el formato YYYY-MM-DD básico.
  const iso = /^\d{4}-\d{2}-\d{2}$/
  if (!desde || !iso.test(desde) || !hasta || !iso.test(hasta)) {
    return NextResponse.json({ error: 'Parámetros desde y hasta son requeridos en formato YYYY-MM-DD.' }, { status: 400 })
  }

  const result = await getProductAnalytics({ desde, hasta })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })

  return NextResponse.json(result.data)
}