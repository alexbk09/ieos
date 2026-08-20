import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { updateQuoteSettings } from '@/services/quotes'

/**
 * API: Actualizar configuración de cotizaciones (solo admin).
 * Permite editar el % de descuento por pago en efectivo en divisas,
 * días de validez, nota por defecto y correlativo.
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const result = await updateQuoteSettings(body)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ settings: result.settings })
}