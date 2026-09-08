import { createClient as createServerClient } from '@/lib/supabase/server'
import { formatWeight } from '@/lib/price-calculator'
import {
  calculateQuoteTotals,
  calculateValidUntil,
  formatQuoteNumber,
  isValidEmail,
  normalizeQuoteItems,
  type QuoteTotals,
} from '@/lib/quote-calculator'
import { getOfficialExchangeRate } from '@/services/exchange-rate'
import nodemailer from 'nodemailer'

/**
 * Servicio de cotizaciones.
 * Capa única de acceso a Supabase para las tablas quote_settings, quotes y quote_items.
 * Toda la lógica pura (descuentos, totales, conversión Bs.) vive en /lib/quote-calculator.
 * El número correlativo se genera de forma atómica vía RPC.
 * El envío por correo usa nodemailer con configuración SMTP de variables de entorno.
 */

// ---------- Tipos ----------

export type QuoteSettings = {
  id: number
  cash_divisa_discount_percent: number
  validity_days: number
  default_notes: string
  quote_current_number: number
  quote_prefix: string
  quote_digits: number
}

export type QuoteItem = {
  id: string
  quote_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price_usd: number
  /** Unidad cotizada (u, g, kg...). */
  unit_label?: string | null
  /** Peso total en gramos (solo si el producto es por peso). */
  weight_grams?: number | null
}

export type QuoteClient = {
  id?: string
  full_name: string | null
  email: string | null
  phone: string | null
}

export type Quote = {
  id: string
  quote_number: string
  user_id: string | null
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  customer_address: string | null
  status: 'draft' | 'sent' | 'accepted' | 'converted' | 'cancelled'
  subtotal_usd: number
  discount_percent: number
  discount_amount_usd: number
  total_usd: number
  exchange_rate: number
  total_ves: number
  payment_method: 'cash_divisa' | 'transfer_divisa' | 'other'
  validity_days: number
  valid_until: string | null
  notes: string | null
  cash_divisa_discount_percent: number
  shows_cash_divisa_note: boolean
  sent_at: string | null
  converted_to_solicitud_id: string | null
  created_at: string
  quote_items?: QuoteItem[]
  profiles?: QuoteClient | QuoteClient[] | null
}

export type NewQuoteItem = {
  product_id: string
  quantity: number
  /** Unidad del ítem: 'g', 'kg' o 'u'. Default: 'u'. */
  unit?: string
}

export type NewQuoteInput = {
  customer_name: string
  customer_email?: string | null
  customer_phone?: string | null
  customer_address?: string | null
  items: NewQuoteItem[]
  discount_percent?: number
  payment_method?: 'cash_divisa' | 'transfer_divisa' | 'other'
  notes?: string | null
  validity_days?: number
}

// ---------- Configuración ----------

/** Valores por defecto de quote_settings (para el mapeo seguro). */
function mapSettings(row: any): QuoteSettings {
  return {
    id: row?.id ?? 1,
    cash_divisa_discount_percent: Number(row?.cash_divisa_discount_percent ?? 20),
    validity_days: Number(row?.validity_days ?? 15),
    default_notes: row?.default_notes ?? 'Cotización sujeta a disponibilidad de inventario. Los precios pueden variar sin previo aviso.',
    quote_current_number: Number(row?.quote_current_number ?? 0),
    quote_prefix: row?.quote_prefix ?? 'COT',
    quote_digits: Number(row?.quote_digits ?? 4),
  }
}

const DEFAULT_SETTINGS: QuoteSettings = {
  id: 1,
  cash_divisa_discount_percent: 20,
  validity_days: 15,
  default_notes: 'Cotización sujeta a disponibilidad de inventario. Los precios pueden variar sin previo aviso.',
  quote_current_number: 0,
  quote_prefix: 'COT',
  quote_digits: 4,
}

/**
 * Obtiene la configuración de cotizaciones para el admin.
 * Usa cliente servidor (requireAdmin se aplica en la página/API).
 */
export async function getQuoteSettings() {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('quote_settings').select('*').eq('id', 1).maybeSingle()
  if (error) return { data: null, settings: DEFAULT_SETTINGS, error }
  return { data, settings: mapSettings(data), error: null }
}

/**
 * Actualiza la configuración de cotizaciones.
 * Solo acepta columnas conocidas y valida tipos antes de escribir.
 */
export async function updateQuoteSettings(payload: Partial<QuoteSettings>) {
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  const numberFields = ['cash_divisa_discount_percent', 'validity_days', 'quote_current_number', 'quote_digits'] as const
  const textFields = ['quote_prefix', 'default_notes'] as const

  for (const key of numberFields) {
    if (payload[key] !== undefined) {
      const value = Number(payload[key])
      if (!Number.isFinite(value)) return { data: null, error: { message: `${key} debe ser un número` }, settings: null }
      update[key] = value
    }
  }
  for (const key of textFields) {
    if (payload[key] !== undefined) update[key] = String(payload[key] ?? '').trim()
  }

  if (Object.keys(update).length === 0) {
    const { settings } = await getQuoteSettings()
    return { data: { id: 1 }, error: null, settings }
  }

  const { data, error } = await supabase
    .from('quote_settings')
    .update(update)
    .eq('id', 1)
    .select('*')
    .single()

  if (error) return { data: null, error, settings: null }
  return { data, error: null, settings: mapSettings(data) }
}

// ---------- Cotizaciones ----------

/** Normaliza una fila de quotes para la UI. */
function mapQuote(row: any): Quote {
  return {
    id: row?.id,
    quote_number: row?.quote_number,
    user_id: row?.user_id ?? null,
    customer_name: row?.customer_name ?? '',
    customer_email: row?.customer_email ?? null,
    customer_phone: row?.customer_phone ?? null,
    customer_address: row?.customer_address ?? null,
    status: row?.status ?? 'draft',
    subtotal_usd: Number(row?.subtotal_usd ?? 0),
    discount_percent: Number(row?.discount_percent ?? 0),
    discount_amount_usd: Number(row?.discount_amount_usd ?? 0),
    total_usd: Number(row?.total_usd ?? 0),
    exchange_rate: Number(row?.exchange_rate ?? 0),
    total_ves: Number(row?.total_ves ?? 0),
    payment_method: row?.payment_method ?? 'other',
    validity_days: Number(row?.validity_days ?? 15),
    valid_until: row?.valid_until ?? null,
    notes: row?.notes ?? null,
    cash_divisa_discount_percent: Number(row?.cash_divisa_discount_percent ?? 20),
    shows_cash_divisa_note: Boolean(row?.shows_cash_divisa_note ?? true),
    sent_at: row?.sent_at ?? null,
    converted_to_solicitud_id: row?.converted_to_solicitud_id ?? null,
    created_at: row?.created_at,
    quote_items: Array.isArray(row?.quote_items) ? row.quote_items : [],
    profiles: row?.profiles ?? null,
  }
}

/**
 * Obtiene todas las cotizaciones con sus ítems y datos del cliente.
 * Hace dos consultas y combina los perfiles manualmente (mismo patrón que /services/requests).
 */
export async function getQuotesWithItems() {
  const supabase = await createServerClient()

  // 1) Cotizaciones con ítems.
  const { data, error } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .order('created_at', { ascending: false })
  if (error) return { data: [], error }

  // 2) Recolecta IDs de clientes.
  const userIds = (data ?? []).map((r: any) => r.user_id).filter(Boolean)

  // 3) Consulta perfiles en una sola pasada.
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .in('id', userIds)

  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]))

  // 4) Enriquece cada cotización con su cliente.
  const enriched = ((data ?? []) as any[]).map((row) => ({
    ...mapQuote(row),
    profiles: row.user_id ? (profileMap.get(row.user_id) ?? null) : null,
  }))

  return { data: enriched, error: null }
}

/**
 * Crea una nueva cotización.
 *
 * Proceso:
 *   1. Lee los productos reales (precio, nombre) para snapshoteo.
 *   2. Valida y normaliza los ítems con lógica pura (lib/quote-calculator).
 *   3. Obtiene la tasa BCV del día.
 *   4. Lee la configuración de cotizaciones (descuento efectivo divisas, validez).
 *   5. Consume el siguiente número de cotización vía RPC (atómico).
 *   6. Calcula subtotal, descuento manual, descuento efectivo divisas, total USD y VES.
 *   7. Inserta la cotización y sus ítems.
 *
 * @param input Datos del cliente y ítems a cotizar.
 */
export async function createQuote(input: NewQuoteInput) {
  const supabase = await createServerClient()

  // 1) Productos reales para validación y snapshot.
  const ids = input.items.map((i) => i.product_id).filter(Boolean)
  if (ids.length === 0) return { data: null, error: { message: 'Agrega al menos un producto' } }

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id,name,price_usd,stock,pricing_type,price_per_gram_usd,stock_grams,min_order_grams,unit_label')
    .in('id', ids)
  if (productsError) return { data: null, error: { message: 'No se pudieron leer los productos' } }

  // 2) Validar ítems (stock mínimo 1; la cotización no aparta inventario).
  const result = normalizeQuoteItems(input.items, products ?? [])
  if (result.items === null) return { data: null, error: { message: 'Producto no encontrado o cantidad inválida' } }

  // 3) Tasa BCV del día.
  const { rate } = await getOfficialExchangeRate()

  // 4) Configuración de cotizaciones.
  const { settings } = await getQuoteSettings()
  const validityDays = input.validity_days ?? settings.validity_days

  // 5) Número de cotización atómico.
  const { data: quoteNumber, error: numberError } = await supabase.rpc('consume_next_quote_number')
  if (numberError || !quoteNumber) {
    return { data: null, error: { message: numberError?.message ?? 'No se pudo generar el número de cotización' } }
  }

  // 6) Calcular totales con lógica pura.
  const totals: QuoteTotals = calculateQuoteTotals(result.items, {
    discountPercent: Number(input.discount_percent ?? 0),
    exchangeRate: rate,
    cashDivisaDiscountPercent: settings.cash_divisa_discount_percent,
    paymentMethod: input.payment_method ?? 'other',
  })

  const validUntil = calculateValidUntil(validityDays)

  // 7) Insertar cotización.
  const { data: quote, error: insertError } = await supabase
    .from('quotes')
    .insert({
      quote_number: quoteNumber,
      customer_name: input.customer_name.trim(),
      customer_email: input.customer_email?.trim() || null,
      customer_phone: input.customer_phone?.trim() || null,
      customer_address: input.customer_address?.trim() || null,
      status: 'draft',
      subtotal_usd: totals.subtotal_usd,
      discount_percent: totals.discount_percent,
      discount_amount_usd: totals.discount_amount_usd,
      total_usd: totals.total_usd,
      exchange_rate: rate,
      total_ves: totals.total_ves,
      payment_method: input.payment_method ?? 'other',
      validity_days: validityDays,
      valid_until: validUntil,
      notes: input.notes?.trim() || settings.default_notes,
      cash_divisa_discount_percent: settings.cash_divisa_discount_percent,
      shows_cash_divisa_note: true,
    })
    .select('*')
    .single()

  if (insertError || !quote) {
    return { data: null, error: { message: `No se pudo crear la cotización: ${insertError?.message ?? 'Error'}` } }
  }

  // 8) Insertar ítems.
  const { error: itemsError } = await supabase
    .from('quote_items')
    .insert(result.items.map((item: any) => ({ ...item, quote_id: quote.id })))
  if (itemsError) return { data: null, error: { message: 'La cotización se creó pero no se pudieron guardar los ítems' } }

  return { data: mapQuote({ ...quote, quote_items: result.items }), error: null }
}

/**
 * Obtiene una cotización por ID con sus ítems.
 * @param id ID de la cotización.
 */
export async function getQuoteById(id: string) {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) return { data: null, error }
  if (!data) return { data: null, error: { message: 'Cotización no encontrada' } }
  return { data: mapQuote(data), error: null }
}

/**
 * Actualiza el estado de una cotización.
 * @param id ID de la cotización.
 * @param status Nuevo estado.
 */
export async function updateQuoteStatus(id: string, status: string) {
  const supabase = await createServerClient()
  const update: Record<string, unknown> = { status }
  if (status === 'sent') update.sent_at = new Date().toISOString()
  return supabase.from('quotes').update(update).eq('id', id).select('*').single()
}

/**
 * Cancela una cotización (borrador o enviada).
 * @param id ID de la cotización.
 */
export async function cancelQuote(id: string) {
  const supabase = await createServerClient()
  return supabase.from('quotes').update({ status: 'cancelled' }).eq('id', id).select('*').single()
}

/**
 * Convierte una cotización a solicitud.
 *
 * Proceso:
 *   1. Verifica que la cotización existe, no esté convertida y sea válida.
 *   2. Crea la solicitud con TODOS los datos de la cotización:
 *      subtotal_usd, discount_percent, discount_amount_usd, total_usd,
 *      total_ves, exchange_rate, payment_method, datos del cliente
 *      (customer_name/email/phone/address), vigencia (validity_days,
 *      valid_until), notas (notes) y snapshot del descuento por efectivo
 *      en divisas (cash_divisa_discount_percent, shows_cash_divisa_note).
 *   3. Copia los ítems de la cotización a solicitud_items (snapshot).
 *   4. Marca la cotización como 'converted' y guarda el ID de la solicitud.
 *
 * @param quoteId ID de la cotización.
 */
export async function convertQuoteToRequest(quoteId: string) {
  const supabase = await createServerClient()

  // 1) Leer cotización con ítems.
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', quoteId)
    .maybeSingle()
  if (error || !quote) return { data: null, error: { message: 'Cotización no encontrada' } }

  if (quote.status === 'converted') {
    return { data: null, error: { message: 'Esta cotización ya fue convertida a solicitud' } }
  }
  if (quote.status === 'cancelled') {
    return { data: null, error: { message: 'No se puede convertir una cotización cancelada' } }
  }
  const items = quote.quote_items ?? []
  if (items.length === 0) {
    return { data: null, error: { message: 'La cotización no tiene productos' } }
  }

  // 2) Crear solicitud con todos los datos de la cotización.
  const solicitudPayload: Record<string, unknown> = {
    // user_id puede ser null (venta directa sin cliente registrado).
    user_id: quote.user_id ?? null,
    // Totales y descuentos.
    subtotal_usd: Number(quote.subtotal_usd) || 0,
    discount_percent: Number(quote.discount_percent) || 0,
    discount_amount_usd: Number(quote.discount_amount_usd) || 0,
    total_usd: Number(quote.total_usd) || 0,
    total_ves: Number(quote.total_ves) || 0,
    exchange_rate: Number(quote.exchange_rate) || 0,
    payment_method: quote.payment_method ?? 'other',
    // Datos del cliente (snapshot para venta directa o reportes).
    customer_name: String(quote.customer_name ?? '').trim(),
    customer_email: quote.customer_email ?? null,
    customer_phone: quote.customer_phone ?? null,
    customer_address: quote.customer_address ?? null,
    // Vigencia y notas.
    validity_days: Number(quote.validity_days) || 15,
    valid_until: quote.valid_until ?? null,
    notes: quote.notes ?? null,
    // Snapshot del descuento por efectivo en divisas.
    cash_divisa_discount_percent: Number(quote.cash_divisa_discount_percent) || 20,
    shows_cash_divisa_note: Boolean(quote.shows_cash_divisa_note ?? true),
    status: 'pending',
  }

  const { data: solicitud, error: solError } = await supabase
    .from('solicitudes')
    .insert(solicitudPayload)
    .select('id')
    .single()
  if (solError || !solicitud) {
    return { data: null, error: { message: `No se pudo crear la solicitud: ${solError?.message ?? 'Error'}` } }
  }

  // 3) Copiar ítems (con unidad y peso para productos por peso).
  const { error: itemsError } = await supabase
    .from('solicitud_items')
    .insert(items.map((item: any) => ({
      solicitud_id: solicitud.id,
      product_id: item.product_id ?? null,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price_usd: item.unit_price_usd,
      unit_label: item.unit_label ?? 'u',
      weight_grams: item.weight_grams ?? null,
    })))
  if (itemsError) {
    // Limpiar la solicitud huérfana.
    await supabase.from('solicitudes').delete().eq('id', solicitud.id)
    return { data: null, error: { message: 'No se pudieron copiar los ítems a la solicitud' } }
  }

  // 4) Marcar cotización como convertida.
  await supabase.from('quotes').update({
    status: 'converted',
    converted_to_solicitud_id: solicitud.id,
  }).eq('id', quoteId)

  return { data: { quote_id: quoteId, solicitud_id: solicitud.id }, error: null }
}

/**
 * Envía la cotización por correo usando nodemailer.
 * Requiere variables de entorno SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 * Si no están configuradas, devuelve un error claro.
 *
 * @param quote Cotización normalizada (con ítems).
 * @param companyName Nombre de la empresa para el asunto.
 */
export async function sendQuoteEmail(quote: Quote, companyName: string) {
  const email = quote.customer_email
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

  // Render del cuerpo HTML de la cotización.
  const html = renderQuoteHtml(quote, companyName)

  const asunto = `Cotización ${quote.quote_number} · ${companyName}`

  try {
    await transporter.sendMail({
      from: `"${companyName}" <${from}>`,
      to: email,
      subject: asunto,
      html,
    })
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err?.message ?? 'No se pudo enviar el correo' }
  }
}

/** Escapa HTML para prevenir inyección. */
function escapeHtml(text: string | null | undefined): string {
  if (!text) return ''
  return String(text)
    .replace(/&/g, `\x26amp;`)
    .replace(/</g, `\x26lt;`)
    .replace(/>/g, `\x26gt;`)
    .replace(/"/g, `\x26quot;`)
    .replace(/'/g, `\x26#039;`)
}

/**
 * Renderiza un HTML moderno de cotización para el correo.
 * @param quote Cotización normalizada.
 * @param companyName Nombre de la empresa.
 */
function renderQuoteHtml(quote: Quote, companyName: string): string {
  const items = (quote.quote_items ?? [])
    .map((item) => {
      // Para productos por peso, la cantidad ya está en gramos → mostrar kg/g.
      const isWeightItem = item.weight_grams != null && item.weight_grams > 0
      const qtyLabel = isWeightItem ? formatWeight(item.weight_grams!) : `${item.quantity} ${item.unit_label ?? 'u'}`
      const lineTotal = isWeightItem
        ? Number(item.unit_price_usd) * Number(item.weight_grams)
        : Number(item.unit_price_usd) * item.quantity
      return `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:10px 12px;font-size:14px;color:#1f2937">${escapeHtml(item.product_name)}</td>
        <td style="padding:10px 12px;font-size:14px;color:#6b7280;text-align:center">${qtyLabel}</td>
        <td style="padding:10px 12px;font-size:14px;color:#1f2937;text-align:right">$${Number(item.unit_price_usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
        <td style="padding:10px 12px;font-size:14px;color:#1f2937;text-align:right;font-weight:600">$${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `
    })
    .join('')

  // ---------- Desglose de totales para el correo ----------
  const subtotal = Number(quote.subtotal_usd) || 0
  const manualPct = Math.min(Math.max(Number(quote.discount_percent) || 0, 0), 100)
  const manualAmount = Math.round((subtotal * manualPct) / 100 * 100) / 100
  const afterManual = Math.round((subtotal - manualAmount) * 100) / 100
  const cashPct =
    quote.payment_method === 'cash_divisa'
      ? Math.min(Math.max(Number(quote.cash_divisa_discount_percent) || 0, 0), 100)
      : 0
  const cashAmount = Math.round((afterManual * cashPct) / 100 * 100) / 100
  const totalUsd = Number(quote.total_usd) || 0
  const rate = Number(quote.exchange_rate) || 0
  // Si paga en bolívares NO aplica el descuento por efectivo en divisas.
  const totalPayBsAmount = Math.round(afterManual * rate * 100) / 100

  const fmtUsd = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtBs = (n: number) => `Bs. ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const discountRows = Number(quote.discount_amount_usd) > 0
    ? `
      ${manualAmount > 0 ? `
      <tr>
        <td style="padding:6px 12px;font-size:14px;color:#6b7280">Descuento manual (${manualPct}%)</td>
        <td style="padding:6px 12px;font-size:14px;color:#dc2626;text-align:right;font-weight:600">-${fmtUsd(manualAmount)}</td>
      </tr>
      ` : ''}
      ${cashAmount > 0 ? `
      <tr>
        <td style="padding:6px 12px;font-size:14px;color:#6b7280">Descuento efectivo divisas (${cashPct}%)</td>
        <td style="padding:6px 12px;font-size:14px;color:#dc2626;text-align:right;font-weight:600">-${fmtUsd(cashAmount)}</td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding:6px 12px;font-size:14px;color:#6b7280">Descuento total</td>
        <td style="padding:6px 12px;font-size:14px;color:#dc2626;text-align:right;font-weight:600">-${fmtUsd(Number(quote.discount_amount_usd))}</td>
      </tr>
    `
    : ''

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0">
        <tr><td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)">
            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#0e7490,#06b6d4);padding:28px 32px;color:#ffffff">
                <table role="presentation" width="100%">
                  <tr>
                    <td style="font-size:22px;font-weight:700">${escapeHtml(companyName)}</td>
                    <td align="right" style="font-size:12px;opacity:.85">${escapeHtml(quote.quote_number)}<br/>${new Date(quote.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <!-- Body -->
            <tr><td style="padding:28px 32px">
              <h2 style="margin:0 0 16px;font-size:20px;color:#111827">Estimado/a ${escapeHtml(quote.customer_name)}</h2>
              <p style="margin:0 0 8px;font-size:14px;color:#4b5563">Gracias por su interés. A continuación presentamos nuestra cotización con los mejores precios para usted.</p>
              <p style="margin:0 0 20px;font-size:13px;color:#6b7280">Válida hasta el <strong>${escapeHtml(quote.valid_until ?? '')}</strong></p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px">
                <thead>
                  <tr style="background-color:#f9fafb">
                    <th style="padding:10px 12px;font-size:12px;color:#6b7280;text-align:left;text-transform:uppercase">Producto</th>
                    <th style="padding:10px 12px;font-size:12px;color:#6b7280;text-align:center;text-transform:uppercase">Cant.</th>
                    <th style="padding:10px 12px;font-size:12px;color:#6b7280;text-align:right;text-transform:uppercase">Precio</th>
                    <th style="padding:10px 12px;font-size:12px;color:#6b7280;text-align:right;text-transform:uppercase">Subtotal</th>
                  </tr>
                </thead>
                <tbody>${items}</tbody>
                <tfoot>
                  <tr style="border-top:2px solid #e5e7eb">
                    <td colspan="3" style="padding:10px 12px;font-size:14px;color:#6b7280">Subtotal</td>
                    <td style="padding:10px 12px;font-size:14px;color:#1f2937;text-align:right;font-weight:600">${fmtUsd(subtotal)}</td>
                  </tr>
                  ${discountRows}
                  <tr>
                    <td colspan="3" style="padding:10px 12px;font-size:16px;color:#0e7490;font-weight:700">💵 Total en divisas (USD)</td>
                    <td style="padding:10px 12px;font-size:16px;color:#0e7490;text-align:right;font-weight:700">${fmtUsd(totalUsd)}</td>
                  </tr>
                  <tr>
                    <td colspan="3" style="padding:4px 12px 10px;font-size:14px;color:#6b7280">
                      🇻🇪 Total en bolívares (sin descuento por efectivo en divisas) · Tasa ${Number(rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style="padding:4px 12px 10px;font-size:14px;color:#065f46;text-align:right;font-weight:700">${fmtBs(totalPayBsAmount)}</td>
                  </tr>
                </tfoot>
              </table>

              ${cashPct > 0 ? `
                <p style="margin:20px 0 0;padding:14px 16px;background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;font-size:13px;color:#065f46">
                  <strong>💰 Importante:</strong> El descuento del <strong>${cashPct}% por pago en efectivo en divisas</strong> se aplica
                  únicamente si el pago se realiza en divisas. Si el pago se realiza en bolívares, el monto a pagar es
                  <strong>${fmtBs(totalPayBsAmount)}</strong> (${fmtUsd(afterManual)}).
                </p>
              ` : ''}

              ${quote.notes ? `<p style="margin:16px 0 0;font-size:12px;color:#9ca3af">${escapeHtml(quote.notes)}</p>` : ''}
            </td></tr>
            <!-- Footer -->
            <tr><td style="background-color:#f9fafb;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af">
              ${escapeHtml(companyName)} · Este documento es una cotización y no constituye una factura.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `
}

/**
 * Obtiene las cotizaciones disponibles para convertir a solicitud
 * (estado 'sent' o 'accepted').
 */
export async function getConvertibleQuotes() {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('quotes')
    .select('id, quote_number, customer_name, customer_email, total_usd, status, created_at')
    .in('status', ['sent', 'accepted'])
    .order('created_at', { ascending: false })
  if (error) return { data: [], error }
  return { data: (data ?? []).map((row: any) => ({
    id: row.id,
    quote_number: row.quote_number,
    customer_name: row.customer_name,
    customer_email: row.customer_email,
    total_usd: Number(row.total_usd),
    status: row.status,
    created_at: row.created_at,
  })), error: null }
}