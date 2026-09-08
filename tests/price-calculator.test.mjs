import { test } from 'node:test'
import assert from 'node:assert/strict'

// Nota: Este test ejecuta la lógica pura de precios aislada de Supabase.
// Para mantener "testing económico", importamos el .mjs directamente.
const { normalizeCartItems, toGrams, formatWeight, priceForItem } = await import('../lib/price-calculator.mjs')

// Catálogo de ejemplo para pruebas.
const products = [
  { id: 'p1', name: 'Panel LED 24W', price_usd: 28, stock: 10, pricing_type: 'unit', unit_label: 'u' },
  { id: 'p2', name: 'Línea Aura 12W', price_usd: 36, stock: 5, pricing_type: 'unit', unit_label: 'u' },
]

// Catálogo con producto por PESO (café).
const weightProducts = [
  ...products,
  {
    id: 'w1',
    name: 'Café artesanal',
    price_usd: 0,
    stock: 0,
    pricing_type: 'weight',
    price_per_gram_usd: 0.012,
    stock_grams: 50000,
    min_order_grams: 500,
    unit_label: 'g',
  },
]

test('calcula el total correctamente con múltiples ítems', () => {
  const result = normalizeCartItems(
    [
      { product_id: 'p1', quantity: 2 },
      { product_id: 'p2', quantity: 1 },
    ],
    products,
  )

  assert.ok(result.items !== null)
  assert.equal(result.total, 2 * 28 + 36)
  assert.equal(result.items.length, 2)
})

test('rechaza cantidades mayores al stock disponible', () => {
  const result = normalizeCartItems([{ product_id: 'p1', quantity: 11 }], products)
  assert.equal(result.items, null)
})

test('rechaza cantidades no enteras o menores a 1', () => {
  const result = normalizeCartItems([{ product_id: 'p1', quantity: 0.5 }], products)
  assert.equal(result.items, null)
})

test('rechaza productos inexistentes', () => {
  const result = normalizeCartItems([{ product_id: 'no-existe', quantity: 1 }], products)
  assert.equal(result.items, null)
})

test('un carrito vacío normaliza sin errores (validado antes por la API)', () => {
  const result = normalizeCartItems([], products)
  assert.ok(result.items !== null)
  assert.equal(result.items.length, 0)
  assert.equal(result.total, 0)
})

// ---------- Nuevos tests: producto por PESO ----------

test('normaliza un producto por peso y calcula el total en gramos', () => {
  // 1 kg de café a $0.012/g = 1000g × 0.012 = $12
  const result = normalizeCartItems(
    [{ product_id: 'w1', quantity: 1, unit: 'kg' }],
    weightProducts,
  )

  assert.ok(result.items !== null)
  assert.equal(result.items.length, 1)
  const item = result.items[0]
  assert.equal(item.quantity, 1000) // siempre gramos
  assert.equal(item.unit_label, 'g')
  assert.equal(item.weight_grams, 1000)
  assert.equal(item.unit_price_usd, 0.012)
  assert.equal(result.total, 12)
})

test('rechaza un peso menor al mínimo de compra', () => {
  // min_order_grams = 500; pedir 300g debe fallar
  const result = normalizeCartItems([{ product_id: 'w1', quantity: 300, unit: 'g' }], weightProducts)
  assert.equal(result.items, null)
})

test('rechaza un peso mayor al stock en gramos', () => {
  // stock_grams = 50000; pedir 60 kg = 60000g debe fallar
  const result = normalizeCartItems([{ product_id: 'w1', quantity: 60, unit: 'kg' }], weightProducts)
  assert.equal(result.items, null)
})

test('permite el mínimo exacto de compra', () => {
  const result = normalizeCartItems([{ product_id: 'w1', quantity: 500, unit: 'g' }], weightProducts)
  assert.ok(result.items !== null)
  assert.equal(result.items[0].quantity, 500)
  assert.equal(result.total, 500 * 0.012)
})

test('toGrams convierte kg y g correctamente', () => {
  assert.equal(toGrams(1, 'kg'), 1000)
  assert.equal(toGrams(500, 'g'), 500)
  assert.equal(toGrams(2.5, 'kg'), 2500)
  assert.equal(toGrams(100), 100)
})

test('formatWeight produce etiquetas legibles', () => {
  assert.equal(formatWeight(500), '500 g')
  assert.equal(formatWeight(1000), '1 kg')
  assert.equal(formatWeight(1250), '1.25 kg')
})

test('priceForItem calcula precio por peso y por unidad', () => {
  const weight = priceForItem({ pricing_type: 'weight', price_per_gram_usd: 0.012 }, 1000, 'g')
  assert.equal(weight.subtotal, 12)
  assert.equal(weight.weight_grams, 1000)

  const unit = priceForItem({ pricing_type: 'unit', price_usd: 28 }, 3, 'u')
  assert.equal(unit.subtotal, 84)
  assert.equal(unit.weight_grams, null)
})