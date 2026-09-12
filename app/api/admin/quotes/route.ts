import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { COTIZACIONES_MODULE_SLUG } from '@/lib/constants'
import { createQuote } from '@/services/quotes'

/**
 * API: Crear una nueva cotización (solo admin).
 * La lógica de negocio (validación + cálculos) vive en /services/quotes.
 */
export async function POST(request: Request) {
  await requireAdmin()
  // Módulo legado oculto (RBAC): sin permiso, la API queda bloqueada.
  if (!(await hasPermission(COTIZACIONES_MODULE_SLUG, 'write'))) {
    return NextResponse.json({ error: 'Módulo no disponible.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const customer_name = String(body.customer_name ?? '').trim()
  if (!customer_name) {
    return NextResponse.json({ error: 'El nombre del cliente es obligatorio' }, { status: 400 })
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    return NextResponse.json({ error: 'Agrega al menos un producto' }, { status: 400 })
  }

  const result = await createQuote({
    customer_name,
    customer_email: body.customer_email ?? null,
    customer_phone: body.customer_phone ?? null,
    customer_address: body.customer_address ?? null,
    items,
    discount_percent: Number(body.discount_percent ?? 0),
    payment_method: body.payment_method ?? 'other',
    notes: body.notes ?? null,
    validity_days: body.validity_days ? Number(body.validity_days) : undefined,
  })

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ quote: result.data })
}