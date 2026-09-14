import { test } from 'node:test'
import assert from 'node:assert/strict'

// Testing económico: se prueba SOLO la lógica pura de presentación de precios
// (conversión de vitrina y referencia en bolívares), sin Supabase ni Next.
// Mismo patrón que price-calculator.test.mjs / rate-spread-calculator.test.mjs.
const {
  EUR_USD_REFERENCE_RATE,
  PRICE_DISPLAY_MARKUP_PERCENT,
  SHOW_BOLIVAR_PRICES,
  roundUsd,
  storedPriceToUsd,
  bolivarReferenceLabel,
} = await import('../lib/display-price.mjs')

test('roundUsd redondea a céntimos', () => {
  assert.equal(roundUsd(11.5549), 11.55)
  assert.equal(roundUsd(11.5551), 11.56)
  assert.equal(roundUsd(0), 0)
})

test('storedPriceToUsd deja intacto el precio de un producto propio (ya en USD)', () => {
  assert.equal(storedPriceToUsd(28, false), 28)
  assert.equal(storedPriceToUsd(9.99, false), 9.99)
})

test('storedPriceToUsd convierte EUR→USD con tipo de referencia + colchón', () => {
  // 10 € → 10 × 1.10 × 1.05 = 11.55 $
  const esperado = roundUsd(10 * EUR_USD_REFERENCE_RATE * (1 + PRICE_DISPLAY_MARKUP_PERCENT))
  assert.equal(esperado, 11.55)
  assert.equal(storedPriceToUsd(10, true), 11.55)
})

test('la conversión nunca deja el precio en $ por debajo del valor en EUR', () => {
  // Regla de confianza: el visitante que compara contra el marketplace no debe
  // ver un precio MENOR al que luego encuentra al pagar (sorpresa desagradable).
  for (const eur of [1, 4.5, 9.29, 27.8, 149.99]) {
    assert.ok(storedPriceToUsd(eur, true) >= eur, 'precio en $ por debajo del EUR: ' + eur)
  }
  assert.ok(PRICE_DISPLAY_MARKUP_PERCENT >= 0)
  assert.ok(EUR_USD_REFERENCE_RATE > 1)
})

test('storedPriceToUsd tolera datos inválidos sin romper la UI', () => {
  assert.equal(storedPriceToUsd(0, true), 0)
  assert.equal(storedPriceToUsd(-5, true), 0)
  assert.equal(storedPriceToUsd(Number.NaN, true), 0)
  assert.equal(storedPriceToUsd(undefined, true), 0)
})

test('bolivarReferenceLabel no muestra nada mientras la vitrina trabaje en $', () => {
  // El interruptor central decide: con la vitrina en dólares no se pinta la
  // cifra en Bs (y por tanto el hook no consulta la API de moneda).
  assert.equal(SHOW_BOLIVAR_PRICES, false)
  assert.equal(bolivarReferenceLabel(28, 36.5), null)
})

test('bolivarReferenceLabel formatea la equivalencia cuando se habilita', () => {
  assert.equal(bolivarReferenceLabel(10, 36.5, true), 'Bs. 365,00')
  assert.equal(bolivarReferenceLabel(1000, 36.5, true), 'Bs. 36.500,00')
})

test('bolivarReferenceLabel ignora montos o tasas inválidas', () => {
  assert.equal(bolivarReferenceLabel(0, 36.5, true), null)
  assert.equal(bolivarReferenceLabel(-10, 36.5, true), null)
  assert.equal(bolivarReferenceLabel(10, 0, true), null)
  assert.equal(bolivarReferenceLabel(10, Number.NaN, true), null)
})
