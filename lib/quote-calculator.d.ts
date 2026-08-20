/**
 * Declaración de tipos para lib/quote-calculator.mjs.
 */

export type QuoteItemInput = {
  product_id: string
  quantity: number
}

export type QuoteProduct = {
  id: string
  name: string
  price_usd: number
  stock: number
}

export type NormalizedQuoteItem = {
  product_id: string
  product_name: string
  quantity: number
  unit_price_usd: number
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
  items: Array<{ quantity: number; unit_price_usd: number }>,
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