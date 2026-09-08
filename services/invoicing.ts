import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  calculateInvoiceTotals,
  isValidEmail,
  type InvoiceTotals,
} from '@/lib/invoice-calculator'
import nodemailer from 'nodemailer'
import { moneyUsd } from '@/lib/currency'
import { createNotification } from '@/services/notifications'

/**
 * Servicio de facturación venezolana (SENIAT).
 * Capa única de acceso a Supabase para las tablas invoice_settings e invoices.
 * Toda la lógica pura (RIF, IVA, correlativos) vive en /lib/invoice-calculator.
 * El siguiente número correlativo se consume de forma atómica vía RPC.
 */

// ---------- Tipos ----------

export type InvoiceSettings = {
  id: number
  issuer_name: string
  issuer_rif: string
  issuer_address: string
  issuer_city: string
  issuer_state: string
  issuer_phone: string
  issuer_email: string
  regimen: 'contribuyente_formal' | 'no_contribuyente'
  iva_rate: number
  prices_include_iva: boolean
  invoice_prefix: string
  invoice_series: string
  invoice_current_number: number
  invoice_digits: number
  control_series: string
  control_current_number: number
  resolution_number: string | null
  resolution_date: string | null
  footer_note: string
  show_rate_on_invoice: boolean
}

export type InvoiceCustomer = {
  name: string
  document_type: 'rif' | 'ci' | 'pasaporte'
  document: string
  address?: string
  email?: string
  phone?: string
}

export type Invoice = {
  id: string
  solicitud_id: string | null
  user_id: string | null
  invoice_number: string
  control_number: string | null
  status: 'issued' | 'cancelled'
  issued_at: string
  due_date: string | null
  issuer_rif: string
  issuer_name: string
  issuer_address: string | null
  customer_name: string | null
  customer_document_type: 'rif' | 'ci' | 'pasaporte' | null
  customer_document: string | null
  customer_address: string | null
  customer_email: string | null
  customer_phone: string | null
  subtotal: number
  iva_amount: number
  exento_amount: number
  iva_rate: number
  total: number
  currency: 'USD' | 'VES'
  exchange_rate: number
  items: { product_name: string; quantity: number; unit_price_usd: number }[]
  notes: string | null
  cancelled_at: string | null
  cancelled_reason: string | null
  created_at: string
}

// ---------- Configuración ----------

/** Valores por defecto de invoice_settings (para el mapeo seguro). */
function mapSettings(row: any): InvoiceSettings {
  return {
    id: row?.id ?? 1,
    issuer_name: row?.issuer_name ?? 'ilumaX C.A.',
    issuer_rif: row?.issuer_rif ?? 'J-00000000-0',
    issuer_address: row?.issuer_address ?? 'Caracas, Venezuela',
    issuer_city: row?.issuer_city ?? 'Caracas',
    issuer_state: row?.issuer_state ?? 'Distrito Capital',
    issuer_phone: row?.issuer_phone ?? '584122649707',
    issuer_email: row?.issuer_email ?? 'hola@ilumax.ve',
    regimen: row?.regimen ?? 'contribuyente_formal',
    iva_rate: Number(row?.iva_rate ?? 16),
    prices_include_iva: Boolean(row?.prices_include_iva ?? true),
    invoice_prefix: row?.invoice_prefix ?? 'FAC',
    invoice_series: row?.invoice_series ?? '0001',
    invoice_current_number: Number(row?.invoice_current_number ?? 0),
    invoice_digits: Number(row?.invoice_digits ?? 8),
    control_series: row?.control_series ?? 'B',
    control_current_number: Number(row?.control_current_number ?? 0),
    resolution_number: row?.resolution_number ?? null,
    resolution_date: row?.resolution_date ?? null,
    footer_note: row?.footer_note ?? 'Gracias por su compra.',
    show_rate_on_invoice: Boolean(row?.show_rate_on_invoice ?? true),
  }
}

const DEFAULT_SETTINGS: InvoiceSettings = {
  id: 1,
  issuer_name: 'ilumaX C.A.',
  issuer_rif: 'J-00000000-0',
  issuer_address: 'Caracas, Venezuela',
  issuer_city: 'Caracas',
  issuer_state: 'Distrito Capital',
  issuer_phone: '584122649707',
  issuer_email: 'hola@ilumax.ve',
  regimen: 'contribuyente_formal',
  iva_rate: 16,
  prices_include_iva: true,
  invoice_prefix: 'FAC',
  invoice_series: '0001',
  invoice_current_number: 0,
  invoice_digits: 8,
  control_series: 'B',
  control_current_number: 0,
  resolution_number: null,
  resolution_date: null,
  footer_note: 'Gracias por su compra.',
  show_rate_on_invoice: true,
}

/**
 * Obtiene la configuración de facturación para el admin.
 * Usa cliente servidor (requireAdmin se aplica en la página/API).
 */
export async function getInvoiceSettings() {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('invoice_settings').select('*').eq('id', 1).maybeSingle()
  if (error) return { data: null, settings: DEFAULT_SETTINGS, error }
  return { data, settings: mapSettings(data), error: null }
}

/**
 * Actualiza la configuración de facturación.
 * Solo acepta columnas conocidas y valida tipos antes de escribir.
 */
export async function updateInvoiceSettings(payload: Partial<InvoiceSettings>) {
  const supabase = await createServerClient()

  // Columnas editables (texto o número/booleano).
  const update: Record<string, unknown> = {}
  const textFields = [
    'issuer_name', 'issuer_rif', 'issuer_address', 'issuer_city', 'issuer_state',
    'issuer_phone', 'issuer_email', 'invoice_prefix', 'invoice_series',
    'control_series', 'resolution_number', 'footer_note',
  ] as const
  const numberFields = ['iva_rate', 'invoice_current_number', 'invoice_digits', 'control_current_number'] as const
  const booleanFields = ['prices_include_iva', 'show_rate_on_invoice'] as const

  for (const key of textFields) {
    if (payload[key] !== undefined) {
      update[key] = String(payload[key] ?? '').trim()
    }
  }
  for (const key of numberFields) {
    if (payload[key] !== undefined) {
      const value = Number(payload[key])
      if (!Number.isFinite(value)) return { data: null, error: { message: `${key} debe ser un número` }, settings: null }
      update[key] = value
    }
  }
  for (const key of booleanFields) {
    if (payload[key] !== undefined) update[key] = Boolean(payload[key])
  }
  if (payload.regimen !== undefined) {
    if (payload.regimen !== 'contribuyente_formal' && payload.regimen !== 'no_contribuyente') {
      return { data: null, error: { message: 'Régimen inválido' }, settings: null }
    }
    update.regimen = payload.regimen
  }
  // Fecha de resolución (opcional)
  if (payload.resolution_date !== undefined) {
    update.resolution_date = payload.resolution_date || null
  }

  if (Object.keys(update).length === 0) {
    const { settings } = await getInvoiceSettings()
    return { data: { id: 1 }, error: null, settings }
  }

  const { data, error } = await supabase
    .from('invoice_settings')
    .update(update)
    .eq('id', 1)
    .select('*')
    .single()

  if (error) return { data: null, error, settings: null }
  return { data, error: null, settings: mapSettings(data) }
}

// ---------- Facturas ----------

/** Normaliza una fila de invoices para la UI. */
function mapInvoice(row: any): Invoice {
  return {
    id: row?.id,
    solicitud_id: row?.solicitud_id ?? null,
    user_id: row?.user_id ?? null,
    invoice_number: row?.invoice_number,
    control_number: row?.control_number ?? null,
    status: row?.status ?? 'issued',
    issued_at: row?.issued_at,
    due_date: row?.due_date ?? null,
    issuer_rif: row?.issuer_rif,
    issuer_name: row?.issuer_name,
    issuer_address: row?.issuer_address ?? null,
    customer_name: row?.customer_name ?? null,
    customer_document_type: row?.customer_document_type ?? null,
    customer_document: row?.customer_document ?? null,
    customer_address: row?.customer_address ?? null,
    customer_email: row?.customer_email ?? null,
    customer_phone: row?.customer_phone ?? null,
    subtotal: Number(row?.subtotal ?? 0),
    iva_amount: Number(row?.iva_amount ?? 0),
    exento_amount: Number(row?.exento_amount ?? 0),
    iva_rate: Number(row?.iva_rate ?? 0),
    total: Number(row?.total ?? 0),
    currency: row?.currency ?? 'USD',
    exchange_rate: Number(row?.exchange_rate ?? 0),
    items: Array.isArray(row?.items) ? row.items : [],
    notes: row?.notes ?? null,
    cancelled_at: row?.cancelled_at ?? null,
    cancelled_reason: row?.cancelled_reason ?? null,
    created_at: row?.created_at,
  }
}

/**
 * Obtiene todas las facturas con los datos de la solicitud y el cliente.
 * Hace dos consultas y combina los datos manualmente para no depender de
 * hints de FK de PostgREST (mismo patrón que /services/requests).
 */
export async function getInvoicesWithDetails() {
  const supabase = await createServerClient()

  // 1) Facturas con información de la solicitud.
  const { data, error } = await supabase
    .from('invoices')
    .select('*, solicitudes(user_id, created_at, status)')
    .order('created_at', { ascending: false })
  if (error) return { data: [], error }

  // 2) Recolecta IDs de usuarios para enriquecer.
  const userIds = (data ?? [])
    .map((row: any) => row.user_id ?? row.solicitudes?.user_id ?? null)
    .filter(Boolean)

  // 3) Consulta perfiles en una sola pasada.
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .in('id', userIds)

  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]))

  // 4) Normaliza cada factura con su solicitud y perfil del cliente.
  const normalized = ((data ?? []) as any[]).map((row) => ({
    ...mapInvoice(row),
    solicitud: row.solicitudes ?? null,
    customer_profile: row.solicitudes?.user_id ? (profileMap.get(row.solicitudes.user_id) ?? null) : null,
  }))

  return { data: normalized, error: null }
}

/**
 * Obtiene las solicitudes que pueden facturarse (confirmadas/completadas
 * y sin factura emitida), con datos del cliente para el modal de emisión.
 * Hace dos consultas: solicitudes y facturas existentes, y filtra en JS.
 */
export async function getInvoiceableRequests() {
  const supabase = await createServerClient()

  // 1) Solicitudes confirmadas/completadas (el perfil se consulta aparte).
  const { data, error } = await supabase
    .from('solicitudes')
    .select('id, user_id, status, total_usd, created_at')
    .in('status', ['confirmed', 'completed'])
    .order('created_at', { ascending: false })
  if (error) return { data: [], error }

  // 2) Facturas ya emitidas para excluir solicitudes facturadas.
  const { data: emitted } = await supabase
    .from('invoices')
    .select('solicitud_id, status')
    .in('status', ['issued'])

  const emittedIds = new Set((emitted ?? []).map((inv: any) => inv.solicitud_id))

  // 2b) Perfiles de los clientes en una sola pasada.
  const userIds = (data ?? []).map((row: any) => row.user_id).filter(Boolean)
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .in('id', userIds)
  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]))

  // 3) Normaliza las solicitudes disponibles.
  const normalized = ((data ?? []) as any[])
    .filter((row) => !emittedIds.has(row.id))
    .map((row) => {
      const profile = row.user_id ? (profileMap.get(row.user_id) ?? null) : null
      return {
        id: row.id,
        id_short: row.id.slice(0, 8).toUpperCase(),
        total_usd: Number(row.total_usd ?? 0),
        status: row.status,
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
      }
    })

  return { data: normalized, error: null }
}

/**
 * Obtiene una factura por su ID (para envío por correo o detalle).
 * @param id ID de la factura.
 */
export async function getInvoiceById(id: string) {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) return { data: null, error: { message: error.message } }
  return { data: data ? mapInvoice(data) : null, error: null }
}

/**
 * Verifica si una solicitud ya tiene una factura emitida.
 * Contrato: Factura y notas deben asociarse a una única factura activa.
 * @param solicitudId ID de la solicitud.
 */
export async function getInvoiceByRequest(solicitudId: string) {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('solicitud_id', solicitudId)
    .eq('status', 'issued')
    .maybeSingle()
  if (error) return { data: null, error }
  return { data: data ? mapInvoice(data) : null, error: null }
}

/**
 * Emite una factura electrónica desde una solicitud confirmada.
 *
 * Proceso (cumple Providencia SENIAT):
 *   1. Lee la solicitud con ítems y perfil del cliente.
 *   2. Lee la configuración del emisor (RIF, IVA, correlativos).
 *   3. Consume el siguiente número de factura y número de control vía RPC
 *      (atómicos: bloquean la fila singleton). Si el INSERT falla, el
 *      correlativo no se reutiliza (agujero permitido por el SENIAT).
 *   4. Calcula el desglose de IVA con lógica pura (lib/invoice-calculator).
 *   5. Snapshot emisor/receptor/ítems y persiste la factura.
 *
 * @param solicitudId ID de la solicitud a facturar.
 * @param customer Datos fiscales del receptor.
 */
export async function issueInvoice(solicitudId: string, customer: InvoiceCustomer) {
  const supabase = await createServerClient()

  // 1) Solicitud con ítems (el perfil se consulta aparte, no hay FK a profiles).
  const { data: request, error: requestError } = await supabase
    .from('solicitudes')
    .select('id, user_id, status, total_usd, exchange_rate, created_at, solicitud_items(*)')
    .eq('id', solicitudId)
    .maybeSingle()
  if (requestError) return { data: null, error: { message: 'No se pudo leer la solicitud' } }
  if (!request) return { data: null, error: { message: 'Solicitud no encontrada' } }
  if (request.status !== 'confirmed' && request.status !== 'completed') {
    return { data: null, error: { message: 'Solo se pueden facturar solicitudes confirmadas o completadas' } }
  }

  // 1b) Perfil del cliente de la solicitud (consulta separada).
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('full_name, email, phone')
    .eq('id', request.user_id)
    .maybeSingle()
  const requestProfile = profileRows ?? null

  // Evitar factura duplicada.
  const { data: existing } = await getInvoiceByRequest(solicitudId)
  if (existing) return { data: null, error: { message: `La solicitud ya tiene la factura ${existing.invoice_number}` } }

  // 2) Configuración del emisor.
  const { settings, error: settingsError } = await getInvoiceSettings()
  if (settingsError) return { data: null, error: { message: 'No se pudo leer la configuración de facturación' } }

  // 3) Consumir correlativos (RPC atómico).
  const { data: invoiceNumber, error: numberError } = await supabase.rpc('consume_next_invoice_number', {
    p_prefix: settings.invoice_prefix,
    p_series: settings.invoice_series,
    p_digits: settings.invoice_digits,
  })
  if (numberError || !invoiceNumber) {
    return { data: null, error: { message: numberError?.message ?? 'No se pudo generar el número de factura' } }
  }
  const { data: controlNumber } = await supabase.rpc('consume_next_control_number', {
    p_series: settings.control_series,
    p_digits: 8,
  })

  // 4) Desglose de IVA con lógica pura.
  const items = (request.solicitud_items ?? []).map((item: any) => ({
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price_usd: Number(item.unit_price_usd),
  }))
  const totals: InvoiceTotals = calculateInvoiceTotals(
    items.map((i) => ({ quantity: i.quantity, unit_price: i.unit_price_usd })),
    Number(settings.iva_rate),
    Boolean(settings.prices_include_iva),
  )

  // Datos del receptor: prioriza los datos fiscales ingresados; fallback al perfil.
  const finalCustomer = {
    name: customer.name.trim() || requestProfile?.full_name || 'Consumidor Final',
    document_type: customer.document_type ?? 'ci',
    document: customer.document.trim(),
    address: customer.address?.trim() || null,
    email: customer.email?.trim() || requestProfile?.email || null,
    phone: customer.phone?.trim() || requestProfile?.phone || null,
  }

  // 5) Insertar la factura.
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      solicitud_id: solicitudId,
      user_id: request.user_id,
      invoice_number: invoiceNumber,
      control_number: controlNumber || null,
      issued_at: new Date().toISOString(),
      issuer_rif: settings.issuer_rif,
      issuer_name: settings.issuer_name,
      issuer_address: settings.issuer_address,
      customer_name: finalCustomer.name,
      customer_document_type: finalCustomer.document_type,
      customer_document: finalCustomer.document,
      customer_address: finalCustomer.address,
      customer_email: finalCustomer.email,
      customer_phone: finalCustomer.phone,
      subtotal: totals.subtotal,
      iva_amount: totals.iva_amount,
      exento_amount: 0,
      iva_rate: Number(settings.iva_rate),
      total: totals.total,
      currency: 'USD',
      exchange_rate: Number(request.exchange_rate ?? 0),
      items,
      notes: null,
    })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: `No se pudo emitir la factura: ${error.message}` } }

  // Notifica al cliente dueño de la solicitud: su factura quedó emitida.
  if (request.user_id) {
    try {
      await createNotification({
        userId: request.user_id,
        type: 'factura',
        title: `Factura ${invoiceNumber} emitida`,
        body: `Tu factura por ${moneyUsd(Number(totals.total))} fue generada correctamente.`,
        href: '/dashboard',
      })
    } catch { /* Las notificaciones nunca bloquean la facturación. */ }
  }

  return { data: mapInvoice(data), error: null }
}

/**
 * Anula una factura emitida (debe quedar registro histórico).
 * La factura no se elimina; se marca como 'cancelled' con motivo.
 * @param id ID de la factura.
 * @param reason Motivo de la anulación.
 */
export async function cancelInvoice(id: string, reason: string) {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('invoices')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reason.trim() || 'Anulada por el administrador',
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return { data: null, error: { message: error.message } }
  return { data: mapInvoice(data), error: null }
}

// ---------- Envío por correo ----------

/**
 * Envía la factura por correo usando nodemailer.
 * Reutiliza las variables SMTP del módulo de cotizaciones.
 */
export async function sendInvoiceEmail(invoice: Invoice, companyName: string) {
  const email = invoice.customer_email
  if (!email || !isValidEmail(email)) {
    return { ok: false as const, error: 'El correo del cliente es inválido' }
  }

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || user

  if (!host || !user || !pass || !from) {
    return { ok: false as const, error: 'SMTP no configurado. Agrega SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM al .env' }
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: Number(process.env.SMTP_SECURE ?? 0) === 1,
    auth: { user, pass },
  })

  const html = renderInvoiceEmailHtml(invoice, companyName)

  try {
    await transporter.sendMail({
      from: `"${companyName}" <${from}>`,
      to: email,
      subject: `Factura ${invoice.invoice_number} · ${companyName}`,
      html,
    })
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err?.message ?? 'No se pudo enviar el correo' }
  }
}


function renderInvoiceEmailHtml(inv: Invoice, cn: string) {
  return 'Factura ' + inv.invoice_number + ' - Total: ' + moneyUsd(Number(inv.total)) + '\n'
}