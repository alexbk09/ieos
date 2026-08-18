import { test } from 'node:test'
import assert from 'node:assert/strict'

// Nota: Este test ejecuta la lógica pura de precios aislada de Supabase.
// Para mantener "testing económico", importamos el .mjs directamente.
const { normalizeCartItems } = await import('../lib/price-calculator.mjs')

// Catálogo de ejemplo para pruebas.
const products = [
  { id: 'p1', name: 'Panel LED 24W', price_usd: 28, stock: 10 },
  { id: 'p2', name: 'Línea Aura 12W', price_usd: 36, stock: 5 },
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
