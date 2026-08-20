import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { validateRif } from '@/lib/invoice-calculator'
import { getInvoiceSettings, updateInvoiceSettings, type InvoiceSettings } from '@/services/invoicing'

/**
 * API: Obtener la configuración de facturación (solo admin).
 * Toda la lógica de datos vive en /services/invoicing.
 */
export async function GET() {
  await requireAdmin()
  const { settings, error } = await getInvoiceSettings()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ settings })
}

/**
 * API: Actualizar la configuración de facturación (solo admin).
 * Valida el RIF del emisor y los rangos de números antes de persistir.
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const body = (await request.json().catch(() => ({}))) as Partial<InvoiceSettings>

  // Valida el RIF del emisor si viene en el payload.
  if (body.issuer_rif !== undefined) {
    const rif = validateRif(body.issuer_rif)
    if (!rif.valid) {
      return NextResponse.json({ error: rif.reason ?? 'RIF inválido' }, { status: 400 })
    }
  }

  // Valida dígitos del correlativo.
  if (body.invoice_digits !== undefined) {
    const digits = Number(body.invoice_digits)
    if (!Number.isInteger(digits) || digits < 4 || digits > 12) {
      return NextResponse.json({ error: 'Los dígitos del correlativo deben estar entre 4 y 12' }, { status: 400 })
    }
  }

  // Valida la tasa de IVA.
  if (body.iva_rate !== undefined) {
    const rate = Number(body.iva_rate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return NextResponse.json({ error: 'La tasa de IVA debe estar entre 0 y 100' }, { status: 400 })
    }
  }

  const result = await updateInvoiceSettings(body)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ ok: true, settings: result.settings })
}