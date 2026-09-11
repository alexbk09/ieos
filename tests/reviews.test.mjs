/**
 * Tests de la lógica pura de valoraciones y reseñas (lib/reviews.mjs).
 * ------------------------------------------------------------------
 * CRÍTICO para el negocio: la valoración alimenta el schema AggregateRating
 * de Google y la sección "Opiniones"; un parseo incorrecto publicaría datos
 * falsos. Por eso se cubren los formatos reales de AliExpress y los topes.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parsearValoracion,
  limpiarTextoResena,
  normalizarResenas,
} from '../lib/reviews.mjs'

// ---------- parsearValoracion ----------

test('parsearValoracion convierte un porcentaje "97.6%" a escala 0-5', () => {
  const r = parsearValoracion('97.6%')
  assert.ok(r)
  assert.equal(r.porcentaje, 97.6)
  assert.equal(r.escala05, 4.88)
})

test('parsearValoracion acepta la escala directa "4.8"', () => {
  const r = parsearValoracion('4.8')
  assert.ok(r)
  assert.equal(r.escala05, 4.8)
  assert.equal(r.porcentaje, 96)
})

test('parsearValoracion acepta coma decimal europea "4,8"', () => {
  const r = parsearValoracion('4,8')
  assert.ok(r)
  assert.equal(r.escala05, 4.8)
})

test('parsearValoracion limita valores fuera de rango', () => {
  assert.equal(parsearValoracion('120%').porcentaje, 100)
  assert.equal(parsearValoracion('0%').escala05, 0)
})

test('parsearValoracion devuelve null con entradas inválidas', () => {
  assert.equal(parsearValoracion(null), null)
  assert.equal(parsearValoracion(''), null)
  assert.equal(parsearValoracion('sin datos'), null)
  assert.equal(parsearValoracion(undefined), null)
})

// ---------- limpiarTextoResena ----------

test('limpiarTextoResena colapsa espacios y recorta al máximo', () => {
  assert.equal(limpiarTextoResena('  hola   mundo  ', 100), 'hola mundo')
  const recortado = limpiarTextoResena('x'.repeat(50), 10)
  assert.equal(recortado.length, 11) // 10 + elipsis
  assert.ok(recortado.endsWith('…'))
})

test('limpiarTextoResena devuelve cadena vacía si no hay texto', () => {
  assert.equal(limpiarTextoResena(null, 10), '')
  assert.equal(limpiarTextoResena('   ', 10), '')
})

// ---------- normalizarResenas ----------

test('normalizarResenas descarta reseñas demasiado cortas y aplica el tope', () => {
  const opciones = { maxStored: 2, minTextLength: 10, maxTextLength: 100 }
  const resultado = normalizarResenas(
    [
      { texto: 'ok', rating: 5 }, // demasiado corta → descartada
      { texto: 'El imán es muy fuerte y aguanta el peso sin problema', rating: '4.5' },
      { texto: 'Funciona bien con mi Galaxy S24 sin problemas de conexión', rating: '95%' },
      { texto: 'Tercera reseña válida que no debe entrar por el tope', rating: 5 },
    ],
    opciones,
  )
  assert.equal(resultado.length, 2)
  assert.ok(resultado[0].texto.startsWith('El imán'))
  assert.equal(resultado[0].valoracion, 4.5)
})

test('normalizarResenas normaliza autor/fecha y tolera campos ausentes', () => {
  const resultado = normalizarResenas(
    [{ content: 'Calidad excelente, muy recomendado para uso diario', userName: '  Ana  ' }],
    { maxStored: 5, minTextLength: 10, maxTextLength: 200 },
  )
  assert.equal(resultado.length, 1)
  assert.equal(resultado[0].autor, 'Ana')
  assert.equal(resultado[0].fecha, null)
  assert.equal(resultado[0].valoracion, null)
})

test('normalizarResenas devuelve [] si maxStored es 0 o la entrada no es array', () => {
  assert.deepEqual(normalizarResenas([{ texto: 'algo suficientemente largo' }], { maxStored: 0, minTextLength: 1, maxTextLength: 100 }), [])
  assert.deepEqual(normalizarResenas(null, { maxStored: 5, minTextLength: 1, maxTextLength: 100 }), [])
})
