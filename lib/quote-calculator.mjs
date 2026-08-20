/**
 * Lógica pura de cálculo de cotizaciones.
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 *
 * Cubre:
 *  - Cálculo de subtotal, descuento manual (%) y total en USD.
 *  - Conversión del total a bolívares usando la tasa BCV.
 *  - Descuento por pago en efectivo en divisas (configurable).
 *  - Correo de validación y número de cotización.
 */

/** Descuento por defecto por pago en efectivo en divisas (%). */
export const DEFAULT_CASH_DIVISA_DISCOUNT = 20

/** Días de validez por defecto de una cotización. */
export const DEFAULT_VALIDITY_DAYS = 15

/** Redondea a 2 decimales (céntimos). */
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Limita un porcentaje entre 0 y 100. */
function clampPercent(value) {
  const n = Number(value) || 0
  return Math.min(Math.max(n, 0), 100)
}

/**
 * Calcula subtotal, descuento, total USD y total VES de una cotización.
 * @param {Array<{ quantity: number; unit_price_usd: number }>} items Ítems.
 * @param {number} discountPercent % de descuento manual (0-100).
 * @param {number} exchangeRate Tasa BCV (Bs. por USD).
 * @param {number} cashDivisaDiscountPercent % de descuento por pago en efectivo divisas.
 * @param {'cash_divisa'|'transfer_divisa'|'other'} paymentMethod Método de pago.
 * @returns {{
 *   subtotal_usd: number;
 *   discount_percent: number;
 *   discount_amount_usd: number;
 *   total_usd: number;
 *   total_ves: number;
 *   cash_divisa_discount_percent: number;
 * }}
 */
export function calculateQuoteTotals(items, {
  discountPercent = 0,
  exchangeRate = 0,
  cashDivisaDiscountPercent = DEFAULT_CASH_DIVISA_DISCOUNT,
  paymentMethod = 'other',
} = {}) {
  // 1) Subtotal de los ítems.
  const subtotal = (items ?? []).reduce((sum, item) => {
    const quantity = Number(item?.quantity) || 0
    const unitPrice = Number(item?.unit_price_usd) || 0
    return sum + quantity * unitPrice
  }, 0)

  // 2) Descuento manual aplicado por el vendedor.
  const manualPercent = clampPercent(discountPercent)
  const manualAmount = round2(subtotal * (manualPercent / 100))

  // 3) Total después del descuento manual.
  const afterManual = round2(subtotal - manualAmount)

  // 4) Descuento adicional por pago en efectivo en divisas (si aplica).
  const appliesCashDivisa = paymentMethod === 'cash_divisa'
  const cashPercent = appliesCashDivisa ? clampPercent(cashDivisaDiscountPercent) : 0
  const cashAmount = round2(afterManual * (cashPercent / 100))

  // 5) Total final en USD.
  const totalUsd = round2(afterManual - cashAmount)

  // 6) Conversión a bolívares con la tasa BCV.
  const rate = Math.max(Number(exchangeRate) || 0, 0)
  const totalVes = round2(totalUsd * rate)

  // Descuento efectivo total (manual + efectivo divisas) para mostrar en la UI.
  const effectivePercent = appliesCashDivisa
    ? round2(100 - (100 - manualPercent) * (100 - cashPercent) / 100)
    : round2(manualPercent)

  return {
    subtotal_usd: round2(subtotal),
    discount_percent: round2(manualPercent),
    discount_amount_usd: round2(manualAmount + cashAmount),
    cash_divisa_discount_percent: cashPercent,
    total_usd: totalUsd,
    total_ves: totalVes,
    effective_discount_percent: effectivePercent,
  }
}

/**
 * Calcula la fecha de vencimiento de una cotización.
 * @param {number} validityDays Días de validez (1-90).
 * @returns {string} Fecha ISO (YYYY-MM-DD).
 */
export function calculateValidUntil(validityDays = DEFAULT_VALIDITY_DAYS) {
  const days = Math.min(Math.max(Number(validityDays) || DEFAULT_VALIDITY_DAYS, 1), 90)
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * Formatea el número de cotización: {prefijo}-{correlativo}.
 * @param {string} prefix Prefijo (ej. "COT").
 * @param {number} number Correlativo actual.
 * @param {number} digits Dígitos del correlativo.
 * @returns {string} Ej. "COT-0001".
 */
export function formatQuoteNumber(prefix = 'COT', number = 0, digits = 4) {
  const p = String(prefix).toUpperCase().trim().replace(/\s+/g, '') || 'COT'
  const n = Math.max(0, Math.floor(Number(number) || 0))
  return `${p}-${String(n).padStart(digits, '0')}`
}

/**
 * Valida un correo electrónico simple para el envío de cotizaciones.
 * @param {string} email Correo a validar.
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/**
 * Valida los ítems de una cotización contra el catálogo real.
 * El stock mínimo requerido es 1 (una cotización no aparta inventario).
 * @param {Array<{ product_id: string; quantity: number }>} items Ítems a cotizar.
 * @param {Array<{ id: string; name: string; price_usd: number; stock: number }>} products Productos reales.
 * @returns {{ items: Array<{ product_id: string; product_name: string; quantity: number; unit_price_usd: number }>; total: number } | { items: null }}
 */
export function normalizeQuoteItems(items, products) {
  const byId = new Map(products.map((product) => [product.id, product]))

  const normalized = items.map((item) => {
    const product = byId.get(item.product_id)
    const quantity = Number(item.quantity)
    if (!product || !Number.isInteger(quantity) || quantity < 1) return null
    return {
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price_usd: Number(product.price_usd),
    }
  })

  if (normalized.some((item) => !item)) return { items: null }

  const subtotal = normalized.reduce((sum, item) => sum + Number(item.unit_price_usd) * item.quantity, 0)
  return { items: normalized, total: round2(subtotal) }
}

/** Etiquetas legibles de los estados de cotización. */
export const QUOTE_STATUS_LABELS = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  converted: 'Convertida',
  cancelled: 'Cancelada',
}

/** Estados válidos del ciclo de vida de una cotización. */
export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'converted', 'cancelled']

/** Etiquetas legibles de los métodos de pago. */
export const PAYMENT_METHOD_LABELS = {
  cash_divisa: 'Efectivo en divisas',
  transfer_divisa: 'Transferencia en divisas',
  'other': 'Otro',
}
