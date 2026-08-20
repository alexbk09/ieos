import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { validateRif } from '@/lib/invoice-calculator'
import { cancelInvoice, getInvoicesWithDetails, issueInvoice, type InvoiceCustomer } from '@/services/invoicing'

/**
 * API: Obtener todas las facturas (solo admin).
 * Toda la lógica de datos vive en /services/invoicing.
 */
export async function GET() {
  await requireAdmin()
  const { data, error } = await getInvoicesWithDetails()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ invoices: data })
}

/**
 * API: Emitir una factura desde una solicitud confirmada (solo admin).
 * Valida los datos fiscales del receptor (RIF opcionalmente) antes de emitir.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const body = await request.json().catch(() => ({}))
  const { solicitud_id, customer } = body as {
    solicitud_id?: string
    customer?: Partial<InvoiceCustomer>
  }

  if (!solicitud_id) {
    return NextResponse.json({ error: 'ID de solicitud requerido' }, { status: 400 })
  }
  if (!customer?.document?.trim()) {
    return NextResponse.json({ error: 'El documento fiscal del receptor es obligatorio' }, { status: 400 })
  }
  if (customer.document_type === 'rif') {
    const rif = validateRif(customer.document)
    if (!rif.valid) return NextResponse.json({ error: rif.reason ?? 'RIF inválido del receptor' }, { status: 400 })
  }

  const result = await issueInvoice(solicitud_id, {
    name: customer?.name?.trim() ?? '',
    document_type: customer?.document_type ?? 'ci',
    document: customer?.document?.trim() ?? '',
    address: customer?.address?.trim() || undefined,
    email: customer?.email?.trim() || undefined,
    phone: customer?.phone?.trim() || undefined,
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ invoice: result.data })
}

/**
 * API: Anular una factura emitida (solo admin).
 * La factura se marca como 'cancelled' y queda registro histórico.
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const body = await request.json().catch(() => ({}))
  const { id, reason } = body as { id?: string; reason?: string }

  if (!id) return NextResponse.json({ error: 'ID de factura requerido' }, { status: 400 })
  if (!reason?.trim()) return NextResponse.json({ error: 'El motivo de anulación es obligatorio' }, { status: 400 })

  const result = await cancelInvoice(id, reason)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ invoice: result.data })
}