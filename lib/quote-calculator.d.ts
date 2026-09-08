/**
 * Declaración de tipos para lib/quote-calculator.mjs.
 * Soporta productos por unidad y por peso (gramos/kilos).
 */

export type QuoteItemInput = {
  product_id: string
  quantity: number
  /** Unidad del ítem: 'g', 'kg' o 'u'. Default: 'g' para peso, 'u' para unidad. */
  unit?: string
}

export type QuoteProduct = {
  id: string
  name: string
  price_usd: number
  stock: number
  /** 'unit' (por unidad) o 'weight' (por peso). */
  pricing_type?: 'unit' | 'weight'
  /** Precio por gramo (solo si pricing_type = 'weight'). */
  price_per_gram_usd?: number
  /** Peso mínimo de compra en gramos (solo si pricing_type = 'weight'). */
  min_order_grams?: number
  /** Etiqueta de la unidad (u, g, kg, m, pkg…). */
  unit_label?: string
}

export type NormalizedQuoteItem = {
  product_id: string
  product_name: string
  /** Gramos si es por peso, unidades si es por unidad. */
  quantity: number
  unit_price_usd: number
  unit_label: string
  /** Peso total en gramos (solo si es por peso). */
  weight_grams: number | null
}

export type QuoteTotals = {
  subtotal_usd: number
  discount_percent: number
  discount_amount_usd: number
  cash_divisa_discount_percent: number
  total_usd: number
  total_ves: number
  effective_discount_percent: number
}

export type QuoteTotalsOptions = {
  discountPercent?: number
  exchangeRate?: number
  cashDivisaDiscountPercent?: number
  paymentMethod?: 'cash_divisa' | 'transfer_divisa' | 'other'
}

export const DEFAULT_CASH_DIVISA_DISCOUNT: number
export const DEFAULT_VALIDITY_DAYS: number

export function calculateQuoteTotals(
  items: Array<{ quantity: number; unit_price_usd: number; weight_grams?: number | null }>,
  options?: QuoteTotalsOptions,
): QuoteTotals

export function calculateValidUntil(validityDays?: number): string

export function formatQuoteNumber(prefix?: string, number?: number, digits?: number): string

export function isValidEmail(email: string): boolean

export function normalizeQuoteItems(
  items: QuoteItemInput[],
  products: QuoteProduct[],
): { items: NormalizedQuoteItem[]; total: number } | { items: null }

export const QUOTE_STATUS_LABELS: Record<string, string>
export const QUOTE_STATUSES: string[]
export const PAYMENT_METHOD_LABELS: Record<string, string>