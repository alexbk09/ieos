import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { COTIZACIONES_MODULE_SLUG } from '@/lib/constants'
import { getSiteSettings } from '@/services/site-settings'
import { getQuoteById, sendQuoteEmail, updateQuoteStatus, cancelQuote, convertQuoteToRequest } from '@/services/quotes'
import { QUOTE_STATUSES } from '@/lib/quote-calculator'

/**
 * API: Acciones sobre una cotización específica (solo admin).
 * - PATCH  → actualizar estado (sent/accepted/cancelled)
 * - POST   → acción: 'send' (envía por correo), 'convert' (convierte a solicitud)
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  // Módulo legado oculto (RBAC): sin permiso, la API queda bloqueada.
  if (!(await hasPermission(COTIZACIONES_MODULE_SLUG, 'write'))) {
    return NextResponse.json({ error: 'Módulo no disponible.' }, { status: 403 })
  }
  const { id } = await params
  const { status } = await request.json()

  if (!QUOTE_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }
  if (status === 'draft' || status === 'converted') {
    return NextResponse.json({ error: 'No puedes volver a ese estado manualmente' }, { status: 400 })
  }

  const result = await updateQuoteStatus(id, status)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ quote: result.data })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  // Módulo legado oculto (RBAC): sin permiso, la API queda bloqueada.
  if (!(await hasPermission(COTIZACIONES_MODULE_SLUG, 'write'))) {
    return NextResponse.json({ error: 'Módulo no disponible.' }, { status: 403 })
  }
  const { id } = await params
  const { action } = await request.json()

  const { data: quote, error: quoteError } = await getQuoteById(id)
  if (quoteError || !quote) {
    return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  }

  if (action === 'send') {
    // Marca como enviada y envía el correo.
    const { settings } = await getSiteSettings()
    const companyName = settings.company_name

    const { ok, error } = await sendQuoteEmail(quote, companyName)
    if (!ok) return NextResponse.json({ error }, { status: 400 })

    const result = await updateQuoteStatus(id, 'sent')
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
    return NextResponse.json({ quote: result.data, emailSent: true })
  }

  if (action === 'convert') {
    const result = await convertQuoteToRequest(id)
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
    return NextResponse.json(result.data)
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  // Módulo legado oculto (RBAC): sin permiso, la API queda bloqueada.
  if (!(await hasPermission(COTIZACIONES_MODULE_SLUG, 'write'))) {
    return NextResponse.json({ error: 'Módulo no disponible.' }, { status: 403 })
  }
  const { id } = await params

  const result = await cancelQuote(id)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ quote: result.data })
}