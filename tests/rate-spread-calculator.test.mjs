import { test } from 'node:test'
import assert from 'node:assert/strict'

// Lógica pura del diferencial de tasas, aislada de Supabase.
const { rateSpread, spreadPercent, lossPerProductUnit } = await import('../lib/rate-spread-calculator.mjs')

test('rateSpread calcula la diferencia entre paralelo y oficial', () => {
  const result = rateSpread(36.5, 41.0)
  assert.equal(result.spread, 4.5)
  assert.equal(result.error, null)
})

test('rateSpread rechaza tasas no positivas', () => {
  const result = rateSpread(0, 41.0)
  assert.equal(result.spread, null)
  assert.ok(result.error)
})

test('rateSpread rechaza paralelo menor al oficial', () => {
  const result = rateSpread(40, 36.5)
  assert.equal(result.spread, null)
  assert.ok(result.error)
})

test('spreadPercent calcula el porcentaje sobre la tasa paralela', () => {
  const result = spreadPercent(36.5, 41.0)
  // (41 - 36.5) / 41 = 0.1097... → 10.98 %
  assert.ok(result.percent !== null)
  assert.ok(Math.abs(result.percent - 10.9756) < 0.01)
})

test('lossPerProductUnit calcula la pérdida por unidad vendida', () => {
  const result = lossPerProductUnit(28, 36.5, 41.0)
  // Pérdida en USD = 28 * (1 - 36.5/41) = 28 * 0.109756 = 3.07
  assert.ok(result.lossUsd !== null)
  assert.ok(Math.abs(result.lossUsd - 3.073) < 0.001)
  // Pérdida en Bs = 28 * (41 - 36.5) = 126
  assert.ok(result.lossBs !== null)
  assert.equal(result.lossBs, 126)
})

test('lossPerProductUnit con tasas iguales no genera pérdida', () => {
  const result = lossPerProductUnit(28, 36.5, 36.5)
  assert.ok(result.lossUsd !== null)
  assert.equal(result.lossUsd, 0)
  assert.equal(result.lossBs, 0)
})

test('lossPerProductUnit rechaza precio o tasas inválidas', () => {
  const result = lossPerProductUnit(-5, 36.5, 41.0)
  assert.equal(result.lossUsd, null)
  assert.ok(result.error)
})