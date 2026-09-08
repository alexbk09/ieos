import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ingresoRealNeto,
  calcularMargenNetoPorProducto,
  resumirMargenTotal,
  margenPorcentaje,
} from '../lib/margin-net-calculator.mjs'

test('ingresoRealNeto: descuenta IVA cuando el precio lo incluye', () => {
  assert.equal(ingresoRealNeto(116, 16, true), 100) // 116 / 1.16
  assert.equal(ingresoRealNeto(100, 16, false), 100) // sin IVA incluido
  assert.equal(ingresoRealNeto(0, 16, true), 0)
})

test('calcularMargenNetoPorProducto: ganancia real restando costo inicial', () => {
  // Venta: 10 uds × $11.60 (incluye IVA) → ingreso neto $100
  // Costo por unidad: $5 → costo total $50 → ganancia $50
  const resultado = calcularMargenNetoPorProducto(
    { total_vendido_usd: 116, cantidad_vendida: 10 },
    5,
  )
  assert.equal(resultado.ingreso_neto_usd, 100)
  assert.equal(resultado.costo_total_usd, 50)
  assert.equal(resultado.ganancia_usd, 50)
  assert.equal(resultado.porcentaje, 50)
})

test('calcularMargenNetoPorProducto: descuenta otros costos (envío/comisión)', () => {
  // Ingreso neto $100, costo $40, otros $10 → ganancia $50
  const resultado = calcularMargenNetoPorProducto(
    { total_vendido_usd: 100, cantidad_vendida: 8 },
    5,
    { preciosIncluyenIva: false, otrosCostosUsd: 10 },
  )
  assert.equal(resultado.ingreso_neto_usd, 100)
  assert.equal(resultado.costo_total_usd, 40)
  assert.equal(resultado.otros_costos_usd, 10)
  assert.equal(resultado.ganancia_usd, 50)
})

test('resumirMargenTotal: agrega todos los renglones del reporte', () => {
  const renglones = [
    { ingreso_neto_usd: 100, costo_total_usd: 50, otros_costos_usd: 0, ganancia_usd: 50 },
    { ingreso_neto_usd: 200, costo_total_usd: 120, otros_costos_usd: 20, ganancia_usd: 60 },
  ]
  const total = resumirMargenTotal(renglones)
  assert.equal(total.ingreso_neto_usd, 300)
  assert.equal(total.costo_total_usd, 170)
  assert.equal(total.otros_costos_usd, 20)
  assert.equal(total.ganancia_usd, 110)
  assert.ok(total.porcentaje > 0)
})

test('margenPorcentaje: evita división por cero', () => {
  assert.equal(margenPorcentaje(50, 100), 50)
  assert.equal(margenPorcentaje(0, 0), 0)
  assert.equal(margenPorcentaje(10, -5), 0)
})