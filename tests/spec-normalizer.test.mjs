import { test } from 'node:test'
import assert from 'node:assert/strict'

// Testing económico: se prueba SOLO la lógica pura (sin Supabase ni Next).
// Mismo patrón que seo-rules.test.mjs / reviews.test.mjs.
const { normalizarEspecificaciones } = await import('../lib/spec-normalizer.mjs')

// Topes inyectados por parámetro (fuente: lib/constants.ts).
const OPCIONES = { maxEntries: 60, maxKeyLength: 60, maxValueLength: 180 }

test('normalizarEspecificaciones limpia y deduplica un objeto clave→valor', () => {
  const r = normalizarEspecificaciones(
    { Potencia: '  15W  ', 'potencia': '20W', Voltaje: '  220V  ' },
    OPCIONES,
  )
  // Se conserva la PRIMERA aparición y se deduplica por clave canónica.
  assert.deepEqual(r, { Potencia: '15W', Voltaje: '220V' })
})

test('normalizarEspecificaciones acepta una lista de pares {clave, valor} / {name, value}', () => {
  const lista = [
    { clave: 'Material', valor: 'Acero 304' },
    { name: 'Conectividad', value: 'Type-C' },
  ]
  assert.deepEqual(normalizarEspecificaciones(lista, OPCIONES), {
    Material: 'Acero 304',
    Conectividad: 'Type-C',
  })
})

test('normalizarEspecificaciones une listas de valores y descarta entradas vacías', () => {
  const r = normalizarEspecificaciones(
    { Colores: ['Rojo', 'Azul'], Vacio: '   ', Nulo: null, Objeto: { a: 1 } },
    OPCIONES,
  )
  assert.deepEqual(r, { Colores: 'Rojo, Azul' })
})

test('normalizarEspecificaciones respeta los topes de longitud', () => {
  const r = normalizarEspecificaciones(
    { ['K'.repeat(70)]: 'OK', Clave: 'V'.repeat(200), Buena: 'Valor' },
    { maxEntries: 60, maxKeyLength: 60, maxValueLength: 180 },
  )
  assert.deepEqual(r, { Buena: 'Valor' })
})

test('normalizarEspecificaciones limita el número de entradas', () => {
  const crudo = {}
  for (let i = 0; i < 10; i += 1) crudo['Clave ' + i] = 'Valor ' + i
  const r = normalizarEspecificaciones(crudo, { ...OPCIONES, maxEntries: 3 })
  assert.equal(Object.keys(r).length, 3)
})

test('normalizarEspecificaciones devuelve {} para entradas inválidas', () => {
  assert.deepEqual(normalizarEspecificaciones(null, OPCIONES), {})
  assert.deepEqual(normalizarEspecificaciones(undefined, OPCIONES), {})
  assert.deepEqual(normalizarEspecificaciones('texto', OPCIONES), {})
})
