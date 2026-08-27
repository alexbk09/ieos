import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateQuoteTotals,
  calculateValidUntil,
  formatQuoteNumber,
  isValidEmail,
  normalizeQuoteItems,
  DEFAULT_CASH_DIVISA_DISCOUNT,
} from '../lib/quote-calculator.mjs'

/** Ítems de ejemplo para los tests. */
const ITEMS = [
  { quantity: 2, unit_price_usd: 100 },
  { quantity: 1, unit_price_usd: 50 },
]

test('calculateQuoteTotals: sin descuento ni efectivo divisas', () => {
  const totals = calculateQuoteTotals(ITEMS, { exchangeRate: 36.5 })
  assert.equal(totals.subtotal_usd, 250)
  assert.equal(totals.discount_percent, 0)
  assert.equal(totals.discount_amount_usd, 0)
  assert.equal(totals.total_usd, 250)
  assert.equal(totals.total_ves, 9125)
})

test('calculateQuoteTotals: con descuento manual del 10%', () => {
  const totals = calculateQuoteTotals(ITEMS, { discountPercent: 10, exchangeRate: 36.5 })
  assert.equal(totals.subtotal_usd, 250)
  assert.equal(totals.discount_percent, 10)
  assert.equal(totals.discount_amount_usd, 25)
  assert.equal(totals.total_usd, 225)
  assert.equal(totals.total_ves, 8212.5)
})

test('calculateQuoteTotals: con pago en efectivo divisas (20% adicional)', () => {
  const totals = calculateQuoteTotals(ITEMS, {
    exchangeRate: 36.5,
    paymentMethod: 'cash_divisa',
    cashDivisaDiscountPercent: DEFAULT_CASH_DIVISA_DISCOUNT,
  })
  // Subtotal 250 → 20% efectivo = 50 → total 200
  assert.equal(totals.subtotal_usd, 250)
  assert.equal(totals.discount_percent, 0)
  assert.equal(totals.cash_divisa_discount_percent, 20)
  assert.equal(totals.discount_amount_usd, 50)
  assert.equal(totals.total_usd, 200)
  // El pago en Bs. NO recibe el descuento por efectivo en divisas:
  // 250 × 36.5 = 9125
  assert.equal(totals.total_ves, 9125)
})

test('calculateQuoteTotals: descuento manual + efectivo divisas combinados', () => {
  const totals = calculateQuoteTotals(ITEMS, {
    discountPercent: 10,
    exchangeRate: 36.5,
    paymentMethod: 'cash_divisa',
    cashDivisaDiscountPercent: DEFAULT_CASH_DIVISA_DISCOUNT,
  })
  // Subtotal 250 → -10% manual = 225 → -20% efectivo = 180
  assert.equal(totals.subtotal_usd, 250)
  assert.equal(totals.discount_percent, 10)
  assert.equal(totals.cash_divisa_discount_percent, 20)
  assert.equal(totals.discount_amount_usd, 25 + 45)
  assert.equal(totals.total_usd, 180)
  // El pago en Bs. solo recibe el descuento manual:
  // 225 × 36.5 = 8212.5
  assert.equal(totals.total_ves, 8212.5)
})

test('calculateQuoteTotals: descuento manual + transferencia divisas (sin efectivo)', () => {
  const totals = calculateQuoteTotals(ITEMS, {
    discountPercent: 10,
    exchangeRate: 36.5,
    paymentMethod: 'transfer_divisa',
    cashDivisaDiscountPercent: DEFAULT_CASH_DIVISA_DISCOUNT,
  })
  // Transferencia NO recibe descuento de efectivo.
  assert.equal(totals.cash_divisa_discount_percent, 0)
  assert.equal(totals.discount_amount_usd, 25)
  assert.equal(totals.total_usd, 225)
})

test('calculateQuoteTotals: porcentaje limitado a 0-100', () => {
  const totals = calculateQuoteTotals(ITEMS, { discountPercent: 150, exchangeRate: 36.5 })
  assert.equal(totals.discount_percent, 100)
  assert.equal(totals.total_usd, 0)
})

test('calculateQuoteTotals: con tasa cero', () => {
  const totals = calculateQuoteTotals(ITEMS, { exchangeRate: 0 })
  assert.equal(totals.total_usd, 250)
  assert.equal(totals.total_ves, 0)
})

test('calculateValidUntil: 15 días por defecto', () => {
  const today = new Date()
  const expected = new Date()
  expected.setDate(expected.getDate() + 15)
  const result = calculateValidUntil()
  assert.equal(result, expected.toISOString().slice(0, 10))
  assert.ok(result > today.toISOString().slice(0, 10))
})

test('calculateValidUntil: con días personalizados', () => {
  const expected = new Date()
  expected.setDate(expected.getDate() + 30)
  assert.equal(calculateValidUntil(30), expected.toISOString().slice(0, 10))
})

test('formatQuoteNumber: formato COT-0001', () => {
  assert.equal(formatQuoteNumber('COT', 1, 4), 'COT-0001')
  assert.equal(formatQuoteNumber('cot', 15, 4), 'COT-0015')
  assert.equal(formatQuoteNumber(undefined, 0, 4), 'COT-0000')
})

test('isValidEmail: validación simple', () => {
  assert.equal(isValidEmail('cliente@correo.com'), true)
  assert.equal(isValidEmail('cliente@correo'), false)
  assert.equal(isValidEmail('sin-correo'), false)
  assert.equal(isValidEmail(''), false)
  assert.equal(isValidEmail(null), false)
})

test('normalizeQuoteItems: valida ítems contra productos', () => {
  const products = [
    { id: 'p1', name: 'Lámpara Aura', price_usd: 100, stock: 10 },
    { id: 'p2', name: 'LED Strip', price_usd: 50, stock: 5 },
  ]
  const result = normalizeQuoteItems(
    [
      { product_id: 'p1', quantity: 2 },
      { product_id: 'p2', quantity: 1 },
    ],
    products,
  )
  assert.ok(result.items !== null)
  assert.equal(result.items.length, 2)
  assert.equal(result.total, 250)
  assert.equal(result.items[0].product_name, 'Lámpara Aura')
  assert.equal(result.items[0].unit_price_usd, 100)
})

test('normalizeQuoteItems: rechaza producto inexistente', () => {
  const products = [{ id: 'p1', name: 'Lámpara', price_usd: 100, stock: 10 }]
  const result = normalizeQuoteItems([{ product_id: 'no-existe', quantity: 1 }], products)
  assert.equal(result.items, null)
})

test('normalizeQuoteItems: rechaza cantidad inválida', () => {
  const products = [{ id: 'p1', name: 'Lámpara', price_usd: 100, stock: 10 }]
  const result = normalizeQuoteItems([{ product_id: 'p1', quantity: 0 }], products)
  assert.equal(result.items, null)
})