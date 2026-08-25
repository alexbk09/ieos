import { test } from 'node:test'
import assert from 'node:assert/strict'

// Lógica pura del módulo de ajuste de precios, aislada de Supabase.
const {
  roundToTwo,
  calcularNuevoPrecioInicial,
  calcularPrecioVentaConIva,
  simularAjusteProducto,
  calcularPerdidaPorUnidad,
  calcularPorcentajeAumentoSugerido,
} = await import('../lib/margin-adjustment-calculator.mjs')

test('redondea a 2 decimales correctamente', () => {
  assert.equal(roundToTwo(10.005), 10.01)
  assert.equal(roundToTwo(10.004), 10)
  assert.equal(roundToTwo(0), 0)
})

test('calcula el nuevo precio inicial con incremento porcentual', () => {
  const result = calcularNuevoPrecioInicial(100, 10)
  assert.ok(result.precio !== null)
  assert.equal(result.precio, 110)
})

test('redondea el nuevo precio inicial a 2 decimales', () => {
  const result = calcularNuevoPrecioInicial(10.5, 5.5)
  assert.ok(result.precio !== null)
  assert.equal(result.precio, 11.08) // 10.5 * 1.055 = 11.0775 → 11.08
})

test('rechaza porcentajes menores o iguales a 0', () => {
  const result = calcularNuevoPrecioInicial(100, 0)
  assert.equal(result.precio, null)
  assert.ok(result.error)
})

test('rechaza costos negativos', () => {
  const result = calcularNuevoPrecioInicial(-5, 10)
  assert.equal(result.precio, null)
  assert.ok(result.error)
})

test('calcula el precio de venta con 16% de IVA', () => {
  const result = calcularPrecioVentaConIva(110)
  assert.ok(result.precio !== null)
  assert.equal(result.precio, 127.6) // 110 * 1.16 = 127.6
})

test('redondea el precio de venta con IVA a 2 decimales', () => {
  const result = calcularPrecioVentaConIva(11.08)
  assert.ok(result.precio !== null)
  assert.equal(result.precio, 12.85) // 11.08 * 1.16 = 12.8528 → 12.85
})

test('simula el ajuste completo de un producto', () => {
  const result = simularAjusteProducto({ costo_inicial: 100, price_usd: 116 }, 10)
  assert.ok(result.simulado !== null)
  assert.deepEqual(result.simulado, {
    precio_inicial_actual: 100,
    precio_venta_actual: 116,
    nuevo_precio_inicial: 110,
    nuevo_precio_venta: 127.6,
  })
})

test('simula con costos cero (producto sin costo cargado)', () => {
  const result = simularAjusteProducto({ costo_inicial: 0, price_usd: 0 }, 5)
  assert.ok(result.simulado !== null)
  assert.deepEqual(result.simulado, {
    precio_inicial_actual: 0,
    precio_venta_actual: 0,
    nuevo_precio_inicial: 0,
    nuevo_precio_venta: 0,
  })
})

test('rechaza producto inválido en la simulación', () => {
  const result = simularAjusteProducto({} , 10)
  assert.equal(result.simulado, null)
  assert.ok(result.error)
})

test('calcula la pérdida cuando la moneda sube (nueva tasa > última tasa usada)', () => {
  const result = calcularPerdidaPorUnidad(100, 36.5, 40)
  assert.ok(result.perdidaBs !== null)
  assert.equal(result.perdidaBs, 350) // 100 * (40 - 36.5) = 350
  // Pérdida en USD: cobrar a 36.5 y reconvertir a 40
  assert.equal(result.perdidaUsd, 8.75) // 100 * (1 - 36.5/40) = 8.75
  // % del valor perdido
  assert.equal(result.porcentaje, 8.75) // (1 - 36.5/40) * 100 = 8.75
})

test('pérdida 0 (Bs, USD y %) si la nueva tasa no sube respecto a la última usada', () => {
  const result = calcularPerdidaPorUnidad(100, 40, 36.5)
  assert.ok(result.perdidaBs !== null)
  assert.equal(result.perdidaBs, 0)
  assert.equal(result.perdidaUsd, 0)
  assert.equal(result.porcentaje, 0)
})

test('pérdida 0 (Bs, USD y %) si la nueva tasa es igual a la última usada', () => {
  const result = calcularPerdidaPorUnidad(100, 40, 40)
  assert.ok(result.perdidaBs !== null)
  assert.equal(result.perdidaBs, 0)
  assert.equal(result.perdidaUsd, 0)
  assert.equal(result.porcentaje, 0)
})

test('calcula la pérdida contra la última tasa del historial (no contra la actual)', () => {
  // Última tasa usada en un ajuste previo: 36.5
  // Nueva tasa ingresada: 38
  // La pérdida es por la diferencia entre ambas y no contra la tasa actual
  const result = calcularPerdidaPorUnidad(50, 36.5, 38)
  assert.ok(result.perdidaBs !== null)
  assert.equal(result.perdidaBs, 75) // 50 * (38 - 36.5) = 75
  assert.equal(result.perdidaUsd, 1.97) // 50 * (1 - 36.5/38) = 1.9737 → 1.97
})

test('calcula el porcentaje de aumento sugerido para recuperar la pérdida', () => {
  const result = calcularPorcentajeAumentoSugerido(36.5, 40)
  assert.ok(result.porcentaje !== null)
  assert.equal(result.porcentaje, 9.59) // (40/36.5 - 1) * 100 = 9.589 → 9.59
})

test('aumento sugerido 0 si la moneda no sube', () => {
  const result = calcularPorcentajeAumentoSugerido(40, 36.5)
  assert.ok(result.porcentaje !== null)
  assert.equal(result.porcentaje, 0)
})
