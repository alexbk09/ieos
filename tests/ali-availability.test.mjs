/**
 * Tests de la lógica pura de disponibilidad AliExpress (lib/ali-availability.mjs).
 * ------------------------------------------------------------------
 * CRÍTICO para el negocio y el SEO:
 *  - Un falso positivo degradaría una ficha que sí vende (perdiendo ventas).
 *  - Un falso negativo dejaría publicado un producto muerto con schema
 *    `InStock` (riesgo de penalización + clics perdidos).
 * Por eso se cubren umbral, idempotencia, recuperación y precios inválidos.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALI_ESTADO,
  ALI_ACCION,
  ALI_MOTIVO,
  esPrecioValido,
  evaluarDisponibilidadAli,
  resumirVerificacion,
} from '../lib/ali-availability.mjs'

// Umbral usado en los tests (en producción viene de lib/constants.ts).
const UMBRAL = 2

// ---------- esPrecioValido ----------

test('esPrecioValido acepta solo números mayores que cero', () => {
  assert.equal(esPrecioValido(19.99), true)
  assert.equal(esPrecioValido('19.99'), true)
  assert.equal(esPrecioValido(0), false)
  assert.equal(esPrecioValido('0'), false)
  assert.equal(esPrecioValido(''), false)
  assert.equal(esPrecioValido(null), false)
  assert.equal(esPrecioValido(undefined), false)
  assert.equal(esPrecioValido(-3), false)
  assert.equal(esPrecioValido('sin datos'), false)
})

// ---------- evaluarDisponibilidadAli ----------

test('primera ausencia solo genera sospecha (no degrada)', () => {
  const r = evaluarDisponibilidadAli({
    estadoActual: ALI_ESTADO.OK,
    ausenciasPrevias: 0,
    detalleRecibido: false,
    precioValido: false,
    umbralAusencias: UMBRAL,
  })
  assert.equal(r.accion, ALI_ACCION.SOSPECHA)
  assert.equal(r.ausencias, 1)
  assert.equal(r.estado, ALI_ESTADO.OK)
  assert.equal(r.motivo, ALI_MOTIVO.SIN_DETALLE)
})

test('segunda ausencia consecutiva degrada la ficha', () => {
  const r = evaluarDisponibilidadAli({
    estadoActual: ALI_ESTADO.OK,
    ausenciasPrevias: 1,
    detalleRecibido: false,
    precioValido: false,
    umbralAusencias: UMBRAL,
  })
  assert.equal(r.accion, ALI_ACCION.MARCAR_NO_DISPONIBLE)
  assert.equal(r.estado, ALI_ESTADO.UNAVAILABLE)
  assert.equal(r.ausencias, UMBRAL)
})

test('el contador de ausencias se topa en el umbral (no crece sin límite)', () => {
  const r = evaluarDisponibilidadAli({
    ausenciasPrevias: 99,
    detalleRecibido: false,
    precioValido: false,
    umbralAusencias: UMBRAL,
  })
  assert.equal(r.ausencias, UMBRAL)
})

test('degradar es idempotente: repetir no vuelve a "marcar"', () => {
  const r = evaluarDisponibilidadAli({
    estadoActual: ALI_ESTADO.UNAVAILABLE,
    ausenciasPrevias: UMBRAL,
    detalleRecibido: false,
    precioValido: false,
    umbralAusencias: UMBRAL,
  })
  assert.equal(r.accion, ALI_ACCION.NONE)
  assert.equal(r.estado, ALI_ESTADO.UNAVAILABLE)
})

test('detalle sin precio válido cuenta como ausencia (precio 0 o vacío)', () => {
  const r = evaluarDisponibilidadAli({
    estadoActual: ALI_ESTADO.OK,
    ausenciasPrevias: 1,
    detalleRecibido: true,
    precioValido: false,
    umbralAusencias: UMBRAL,
  })
  assert.equal(r.accion, ALI_ACCION.MARCAR_NO_DISPONIBLE)
  assert.equal(r.motivo, ALI_MOTIVO.PRECIO_INVALIDO)
})

test('producto comprable y sano no genera cambios', () => {
  const r = evaluarDisponibilidadAli({
    estadoActual: ALI_ESTADO.OK,
    ausenciasPrevias: 1,
    detalleRecibido: true,
    precioValido: true,
    umbralAusencias: UMBRAL,
  })
  assert.equal(r.accion, ALI_ACCION.NONE)
  assert.equal(r.estado, ALI_ESTADO.OK)
  assert.equal(r.ausencias, 0) // limpia la sospecha anterior
})

test('producto caído que vuelve con precio se recupera', () => {
  const r = evaluarDisponibilidadAli({
    estadoActual: ALI_ESTADO.UNAVAILABLE,
    ausenciasPrevias: UMBRAL,
    detalleRecibido: true,
    precioValido: true,
    umbralAusencias: UMBRAL,
  })
  assert.equal(r.accion, ALI_ACCION.RECUPERAR)
  assert.equal(r.estado, ALI_ESTADO.OK)
  assert.equal(r.ausencias, 0)
})

test('umbral inválido cae a 1 de forma defensiva', () => {
  const r = evaluarDisponibilidadAli({ detalleRecibido: false, precioValido: false, umbralAusencias: 0 })
  assert.equal(r.accion, ALI_ACCION.MARCAR_NO_DISPONIBLE)
  assert.equal(r.ausencias, 1)
})

test('llamada incompleta no degrada (fail-safe)', () => {
  const r = evaluarDisponibilidadAli()
  assert.equal(r.estado, ALI_ESTADO.OK)
  assert.equal(r.accion, ALI_ACCION.NONE)
  assert.equal(r.ausencias, 0)
  // Con un flag ausente tampoco degrada, aunque el otro venga en false.
  const parcial = evaluarDisponibilidadAli({ detalleRecibido: false, umbralAusencias: 1 })
  assert.equal(parcial.accion, ALI_ACCION.NONE)
})

// ---------- resumirVerificacion ----------

test('resumirVerificacion cuenta cada tipo de acción', () => {
  const resumen = resumirVerificacion([
    { accion: ALI_ACCION.MARCAR_NO_DISPONIBLE },
    { accion: ALI_ACCION.MARCAR_NO_DISPONIBLE },
    { accion: ALI_ACCION.RECUPERAR },
    { accion: ALI_ACCION.SOSPECHA },
    { accion: ALI_ACCION.NONE },
  ])
  assert.deepEqual(resumen, { total: 5, degradados: 2, recuperados: 1, sospechas: 1, sinCambios: 1 })
})

test('resumirVerificacion tolera entradas no válidas', () => {
  assert.deepEqual(resumirVerificacion(null), { total: 0, degradados: 0, recuperados: 0, sospechas: 0, sinCambios: 0 })
  assert.deepEqual(resumirVerificacion([{}, null]), { total: 2, degradados: 0, recuperados: 0, sospechas: 0, sinCambios: 2 })
})
