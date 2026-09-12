import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { FACTURACION_MODULE_SLUG } from '@/lib/constants'
import { getInvoiceById, sendInvoiceEmail } from '@/services/invoicing'
import { getSiteSettings } from '@/services/site-settings'

/**
 * API: Acciones sobre una factura específica (solo admin).
 * POST { action: 'send' } → envía la factura por correo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  // Módulo legado oculto (RBAC): sin permiso, la API queda bloqueada.
  if (!(await hasPermission(FACTURACION_MODULE_SLUG, 'write'))) {
    return NextResponse.json({ error: 'Módulo no disponible.' }, { status: 403 })
  }
  const { id } = await params
  const { action } = await request.json().catch(() => ({})) as { action?: string }

  if (action !== 'send') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  const { data: invoice, error: invoiceError } = await getInvoiceById(id)
  if (invoiceError || !invoice) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
  }

  const { settings } = await getSiteSettings()
  const { ok, error } = await sendInvoiceEmail(invoice, settings.company_name)
  if (!ok) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ ok: true, invoice })
}