import { test } from 'node:test'
import assert from 'node:assert/strict'

// Testing económico: SOLO la lógica pura del índice /guias (sin Supabase ni Next).
// Mismo patrón que entry-rules.test.mjs / seo-rules.test.mjs.
const {
  normalizarBusquedaTexto,
  textoBuscableEntrada,
  filtrarEntradas,
  ordenarEntradas,
  paginar,
  numerosDePagina,
} = await import('../lib/entry-index.mjs')

/** Lote de prueba: tipos, nichos, fechas y tiempos distintos a propósito. */
const ENTRADAS = [
  {
    titulo: 'Los 5 mejores teclados mecánicos',
    resumen: 'Para empezar en el gaming',
    angulo: 'Regalo gamer',
    tipo: 'top_lista',
    keywords: ['teclado rgb'],
    lecturaMinutos: 7,
    publicadoEn: '2024-03-01T00:00:00Z',
    categorias: [{ id: 'c1', name: 'Teclados' }],
  },
  {
    titulo: '¿Vale la pena un monitor 144 Hz?',
    resumen: 'Cámara lenta frente a 60 Hz',
    angulo: null,
    tipo: 'vale_la_pena',
    keywords: [],
    lecturaMinutos: 4,
    publicadoEn: '2024-05-01T00:00:00Z',
    categorias: [{ id: 'c2', name: 'Monitores' }],
  },
  {
    titulo: 'Anime acrylic stand',
    resumen: null,
    angulo: 'Decoración',
    tipo: 'guia_compra',
    keywords: ['figura'],
    lecturaMinutos: 9,
    publicadoEn: '2023-01-15T00:00:00Z',
    categorias: [
      { id: 'c1', name: 'Teclados' },
      { id: 'c3', name: 'Figuras' },
    ],
  },
]

// ---------- Búsqueda ----------

test('normalizarBusquedaTexto pliega acentos, mayúsculas y signos', () => {
  assert.equal(normalizarBusquedaTexto('  Cámara LED-RGB '), 'camara led rgb')
  assert.equal(normalizarBusquedaTexto('¡Ofertas!'), 'ofertas')
  assert.equal(normalizarBusquedaTexto(null), '')
  assert.equal(normalizarBusquedaTexto(undefined), '')
})

test('textoBuscableEntrada incluye título, resumen, ángulo, keywords y nichos', () => {
  const primero = textoBuscableEntrada(ENTRADAS[0])
  assert.ok(primero.includes('los 5 mejores teclados mecanicos'))
  assert.ok(primero.includes('regalo gamer'))
  assert.ok(primero.includes('teclado rgb'))
  // El nombre del NICHO también entra al texto (aquí no aparece en el título).
  assert.ok(textoBuscableEntrada(ENTRADAS[2]).includes('figuras'))
})

// ---------- Filtros ----------

test('filtrarEntradas sin filtros devuelve el lote completo', () => {
  assert.deepEqual(filtrarEntradas(ENTRADAS), ENTRADAS)
  assert.deepEqual(filtrarEntradas(ENTRADAS, { consulta: '   ' }), ENTRADAS)
  assert.deepEqual(filtrarEntradas(null, { consulta: 'led' }), [])
})

test('filtrarEntradas busca sin acentos y por términos (AND)', () => {
  assert.deepEqual(
    filtrarEntradas(ENTRADAS, { consulta: 'camara' }).map((entrada) => entrada.titulo),
    ['¿Vale la pena un monitor 144 Hz?'],
  )
  // Dos términos exigen AMBOS en la misma entrada.
  assert.equal(filtrarEntradas(ENTRADAS, { consulta: 'teclado monitor' }).length, 0)
  // La búsqueda alcanza keywords y nombres de nicho.
  assert.equal(filtrarEntradas(ENTRADAS, { consulta: 'figura' }).length, 1)
})

test('filtrarEntradas acota por tipo de contenido y por nicho', () => {
  assert.deepEqual(
    filtrarEntradas(ENTRADAS, { tipos: ['vale_la_pena'] }).map((entrada) => entrada.titulo),
    ['¿Vale la pena un monitor 144 Hz?'],
  )
  // Un nicho coincide si la entrada pertenece a CUALQUIERA de los elegidos.
  assert.equal(filtrarEntradas(ENTRADAS, { nichos: ['c3'] }).length, 1)
  assert.equal(filtrarEntradas(ENTRADAS, { nichos: ['c1'] }).length, 2)
  assert.equal(filtrarEntradas(ENTRADAS, { nichos: ['c9'] }).length, 0)
  // Filtros combinados: tipo + nicho.
  assert.equal(filtrarEntradas(ENTRADAS, { tipos: ['top_lista'], nichos: ['c1'] }).length, 1)
})

// ---------- Orden ----------

test('ordenarEntradas ordena por novedad por defecto y no muta el original', () => {
  const recientes = ordenarEntradas(ENTRADAS, 'recent')
  assert.deepEqual(
    recientes.map((entrada) => entrada.titulo),
    ['¿Vale la pena un monitor 144 Hz?', 'Los 5 mejores teclados mecánicos', 'Anime acrylic stand'],
  )
  // El array de entrada se conserva intacto (copia antes de ordenar).
  assert.equal(ENTRADAS[0].titulo, 'Los 5 mejores teclados mecánicos')
})

test('ordenarEntradas soporta título A-Z y lectura más corta', () => {
  assert.equal(ordenarEntradas(ENTRADAS, 'az', 'es')[0].titulo, 'Anime acrylic stand')
  assert.deepEqual(
    ordenarEntradas(ENTRADAS, 'reading').map((entrada) => entrada.lecturaMinutos),
    [4, 7, 9],
  )
  // Un orden desconocido cae en el de por defecto (nunca rompe el listado).
  assert.equal(ordenarEntradas(ENTRADAS, 'inventado')[0].titulo, '¿Vale la pena un monitor 144 Hz?')
})

// ---------- Paginación ----------

test('paginar corta la lista y devuelve la metadata del paginador', () => {
  const primera = paginar(ENTRADAS, 1, 2)
  assert.equal(primera.items.length, 2)
  assert.equal(primera.pagina, 1)
  assert.equal(primera.totalPaginas, 2)
  assert.equal(primera.total, 3)
  assert.equal(primera.desde, 1)
  assert.equal(primera.hasta, 2)

  const segunda = paginar(ENTRADAS, 2, 2)
  assert.equal(segunda.items.length, 1)
  assert.equal(segunda.desde, 3)
  assert.equal(segunda.hasta, 3)
})

test('paginar acota la página pedida al rango válido', () => {
  const fueraDeRango = paginar(ENTRADAS, 99, 2)
  assert.equal(fueraDeRango.pagina, 2)
  assert.equal(fueraDeRango.items.length, 1)
  assert.equal(paginar(ENTRADAS, 0, 2).pagina, 1)
})

test('paginar tolera listas vacías y tamaños inválidos', () => {
  const vacio = paginar([], 1, 12)
  assert.deepEqual(vacio.items, [])
  assert.equal(vacio.totalPaginas, 1)
  assert.equal(vacio.total, 0)
  assert.equal(vacio.desde, 0)
  // Sin tamaño de página válido se usa 1 (nunca una división por cero).
  assert.equal(paginar(ENTRADAS, 1, 0).items.length, 1)
})

test('numerosDePagina lista todos los números cuando caben', () => {
  assert.deepEqual(numerosDePagina(1, 5, 7), [1, 2, 3, 4, 5])
  assert.deepEqual(numerosDePagina(1, 1, 7), [1])
  assert.deepEqual(numerosDePagina(3, 3, 7), [1, 2, 3])
})

test('numerosDePagina abre huecos y conserva la primera y la última', () => {
  assert.deepEqual(numerosDePagina(1, 10, 7), [1, 2, 3, 4, null, 10])
  assert.deepEqual(numerosDePagina(5, 10, 7), [1, null, 4, 5, 6, null, 10])
  assert.deepEqual(numerosDePagina(10, 10, 7), [1, null, 7, 8, 9, 10])
  assert.deepEqual(numerosDePagina(3, 20, 7), [1, 2, 3, 4, null, 20])
})

test('numerosDePagina nunca supera el máximo visible y acota la página actual', () => {
  for (const pagina of [1, 2, 7, 13, 20, 99]) {
    const enlaces = numerosDePagina(pagina, 20, 7)
    assert.ok(enlaces.length <= 7, 'demasiados enlaces en la página ' + pagina)
    assert.equal(enlaces[0], 1)
    assert.equal(enlaces[enlaces.length - 1], 20)
  }
})
