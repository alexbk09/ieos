import { NextResponse } from 'next/server'
import { getServerUser } from '@/services/auth-server'
import { createRequest } from '@/services/requests'

/**
 * API: Crear una solicitud desde el carrito del cliente.
 * La lógica de negocio (validación + cálculo) vive en /services/requests.
 */
export async function POST(request: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const items = Array.isArray(body?.items) ? body.items : []
  if (!items.length) return NextResponse.json({ error: 'empty_cart' }, { status: 400 })

  const result = await createRequest(user.id, items)

  if ('error' in result) {
    const status: Record<string, number> = {
      products_unavailable: 500,
      stock_or_quantity_invalid: 400,
      solicitud_failed: 500,
      items_failed: 500,
    }
    return NextResponse.json({ error: result.error }, { status: status[result.error] ?? 500 })
  }

  return NextResponse.json({ id: result.id, total: result.total })
}