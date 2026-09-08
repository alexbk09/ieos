import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS_CXC,
  calcularSaldo,
  calcularDiasVencido,
  estadoConVencimiento,
  calcularFechaVencimiento,
  validarLimiteCredito,
} from '../lib/credit-calculator.mjs'

test('calcularSaldo: saldo y estado automático', () => {
  assert.deepEqual(calcularSaldo(100, 0), { saldo: 100, estado: 'pendiente' })
  assert.deepEqual(calcularSaldo(100, 40), { saldo: 60, estado: 'parcial' })
  assert.deepEqual(calcularSaldo(100, 100), { saldo: 0, estado: 'pagada' })
  assert.deepEqual(calcularSaldo(100, 150), { saldo: 0, estado: 'pagada' })
  assert.deepEqual(calcularSaldo(0, 0), { saldo: 0, estado: 'pagada' })
})

test('calcularSaldo: tolera valores inválidos', () => {
  assert.deepEqual(calcularSaldo(-10, 0), { saldo: 0, estado: 'pagada' })
  assert.deepEqual(calcularSaldo('abc', 0), { saldo: 0, estado: 'pagada' })
})

test('calcularFechaVencimiento: emisión + plazo', () => {
  assert.equal(calcularFechaVencimiento('2026-08-31', 0), null)
  assert.equal(calcularFechaVencimiento('2026-08-31', 15), '2026-09-15')
  assert.equal(calcularFechaVencimiento('2026-06-15', 30), '2026-07-15')
})

test('estadoConVencimiento: vencida si hay saldo y la fecha pasó', () => {
  assert.equal(estadoConVencimiento('pendiente', 3), 'vencida')
  assert.equal(estadoConVencimiento('parcial', 3), 'vencida')
  assert.equal(estadoConVencimiento('pendiente', -3), 'pendiente')
  assert.equal(estadoConVencimiento('parcial', -3), 'parcial')
  assert.equal(estadoConVencimiento('pagada', 3), 'pagada')
  assert.equal(estadoConVencimiento('cancelada', 3), 'cancelada')
})

test('calcularDiasVencido: devuelve días de atraso o negativo', () => {
  assert.equal(calcularDiasVencido(null), 0)
  assert.equal(calcularDiasVencido(''), 0)
  // Fecha futura → negativo (aún no vence)
  const futuro = new Date()
  futuro.setDate(futuro.getDate() + 5)
  assert.ok(calcularDiasVencido(futuro.toISOString()) < 0)
  // Fecha pasada → positivo
  const pasado = new Date()
  pasado.setDate(pasado.getDate() - 10)
  assert.ok(calcularDiasVencido(pasado.toISOString()) > 0)
})

test('validarLimiteCredito: cliente sin límite = rechazado', () => {
  const resultado = validarLimiteCredito(0, 0, 100)
  assert.equal(resultado.aprobado, false)
  assert.ok(resultado.error)
})

test('validarLimiteCredito: aprueba dentro del límite disponible', () => {
  const resultado = validarLimiteCredito(500, 200, 100)
  assert.equal(resultado.aprobado, true)
  assert.equal(resultado.error, null)
  assert.equal(resultado.disponibleUsd, 300)
})

test('validarLimiteCredito: rechaza si supera el disponible', () => {
  const resultado = validarLimiteCredito(500, 200, 400)
  assert.equal(resultado.aprobado, false)
  assert.ok(resultado.error)
  assert.equal(resultado.disponibleUsd, 300)
})

test('ESTADOS_CXC: incluye los 5 estados', () => {
  assert.deepEqual(ESTADOS_CXC, ['pendiente', 'parcial', 'pagada', 'vencida', 'cancelada'])
})