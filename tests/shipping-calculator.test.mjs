import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pesoVolumetrico,
  gramsToKg,
  calcularPesoPedido,
  calcularTarifaEnvio,
  calcularEnvioPedido,
  VOLUMETRIC_FACTOR,
} from '../lib/shipping-calculator.mjs'

test('pesoVolumetrico: fórmula aérea estándar (ancho × alto × largo / 5000)', () => {
  // 50×40×30 cm → 60 000 / 5000 = 12 kg
  assert.equal(pesoVolumetrico(50, 40, 30), 12)
  assert.equal(pesoVolumetrico(50, 40, 30, 6000), 10)
  assert.equal(VOLUMETRIC_FACTOR, 5000)
})

test('pesoVolumetrico: devuelve 0 con datos inválidos', () => {
  assert.equal(pesoVolumetrico(0, 40, 30), 0)
  assert.equal(pesoVolumetrico(-5, 40, 30), 0)
  assert.equal(pesoVolumetrico('a', 40, 30), 0)
})

test('gramsToKg: convierte gramos a kilogramos', () => {
  assert.equal(gramsToKg(500), 0.5)
  assert.equal(gramsToKg(2500), 2.5)
  assert.equal(gramsToKg(0), 0)
  assert.equal(gramsToKg(-10), 0)
})

test('calcularPesoPedido: suma weight_grams de los ítems', () => {
  const items = [
    { weight_grams: 500 },
    { weight_grams: 2500 },
    { weight_grams: 0 },
    { weight_grams: null },
  ]
  assert.equal(calcularPesoPedido(items), 3) // 3 kg
  assert.equal(calcularPesoPedido([]), 0)
  assert.equal(calcularPesoPedido(null), 0)
})

test('calcularTarifaEnvio: tarifa plana + por kg sin rangos', () => {
  const zona = { tarifa_flat_usd: 3, tarifa_por_kg_usd: 1.5 }
  const resultado = calcularTarifaEnvio(4, 0, zona)
  assert.equal(resultado.pesoFacturableKg, 4)
  assert.equal(resultado.totalUsd, 9) // 3 + 4×1.5
  assert.equal(resultado.esPesoVolumetrico, false)
  assert.equal(resultado.rangoAplicado, null)
})

test('calcularTarifaEnvio: usa el mayor entre real y volumétrico', () => {
  const zona = { tarifa_flat_usd: 0, tarifa_por_kg_usd: 2 }
  // Real 3 kg, volumétrico 5 kg → factura 5 kg
  const resultado = calcularTarifaEnvio(3, 5, zona)
  assert.equal(resultado.esPesoVolumetrico, true)
  assert.equal(resultado.pesoFacturableKg, 5)
  assert.equal(resultado.totalUsd, 10)
})

test('calcularTarifaEnvio: aplica rango escalonado si el peso cae dentro', () => {
  const zona = {
    tarifa_flat_usd: 3,
    tarifa_por_kg_usd: 1.5,
    rangos: [
      { peso_min_kg: 0, peso_max_kg: 5, tarifa_usd: 5 },
      { peso_min_kg: 5, peso_max_kg: 10, tarifa_usd: 8 },
    ],
  }
  const enRango = calcularTarifaEnvio(3, 0, zona)
  assert.equal(enRango.totalUsd, 5)
  assert.deepEqual(enRango.rangoAplicado, { peso_min_kg: 0, peso_max_kg: 5, tarifa_usd: 5 })

  const enSegundo = calcularTarifaEnvio(7, 0, zona)
  assert.equal(enSegundo.totalUsd, 8)
})

test('calcularTarifaEnvio: sin rangos cae al cálculo base + variable', () => {
  const zona = { tarifa_flat_usd: 2, tarifa_por_kg_usd: 1 }
  const resultado = calcularTarifaEnvio(2.5, 0, zona)
  assert.equal(resultado.totalUsd, 4.5) // 2 + 2.5×1
})

test('calcularEnvioPedido: flujo completo con dimensiones', () => {
  const items = [{ weight_grams: 3000 }] // 3 kg reales
  const zona = { tarifa_flat_usd: 2, tarifa_por_kg_usd: 1 }
  const dimensiones = { widthCm: 50, heightCm: 40, lengthCm: 30 } // 12 kg volumétricos

  const resultado = calcularEnvioPedido(items, zona, dimensiones)
  assert.equal(resultado.pesoRealKg, 3)
  assert.equal(resultado.pesoVolumetricoKg, 12)
  assert.equal(resultado.esPesoVolumetrico, true)
  assert.equal(resultado.pesoFacturableKg, 12)
  assert.equal(resultado.totalUsd, 14) // 2 + 12×1
})