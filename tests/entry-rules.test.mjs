import { test } from 'node:test'
import assert from 'node:assert/strict'

// Testing económico: se prueba SOLO la lógica pura (sin Supabase ni Next).
// Mismo patrón que seo-rules.test.mjs / price-calculator.test.mjs.
const {
  contarPalabras,
  calcularMinutosLectura,
  validarCalidadEntrada,
  seleccionarParesComparables,
  construirComparativa,
  buildArticleSchema,
  buildItemListSchema,
  buildEntryJsonLd,
} = await import('../lib/entry-rules.mjs')

// Configuración inyectada por parámetro (fuente real: lib/constants.ts).
const OPCIONES = {
  bannedPhrases: ['en el mundo actual', 'sumergete'],
  requiredSections: [
    'Por qué sí comprarlo',
    'Comparativa',
    'Para quién es',
    'Cómo elegir',
    'Preguntas Frecuentes',
  ],
  minTitleLength: 30,
  maxTitleLength: 65,
  minResumenLength: 110,
  maxResumenLength: 160,
  minWords: 450,
  minFaq: 3,
  maxFaq: 6,
  minKeywords: 3,
  maxKeywords: 12,
  minProductos: 2,
  allowedTipos: ['comparativa', 'top_lista'],
}

/** Genera N palabras separadas por espacio (para simular un cuerpo largo). */
const palabras = (n) => Array.from({ length: n }, (_, i) => `palabra${i}`).join(' ')

/** Cuerpo HTML válido: las 5 secciones obligatorias y 500 palabras reales. */
function cuerpoValido() {
  return [
    '<h2>Por qué sí comprarlo</h2>',
    `<p>${palabras(100)}</p>`,
    '<h2>Comparativa</h2>',
    `<p>${palabras(100)}</p>`,
    '<h2>Para quién es</h2>',
    `<p>${palabras(100)}</p>`,
    '<h2>Cómo elegir</h2>',
    `<p>${palabras(100)}</p>`,
    '<h2>Preguntas Frecuentes</h2>',
    '<h3>¿Merece la pena?</h3>',
    `<p>${palabras(100)}</p>`,
  ].join('')
}

/** Entrada completa y correcta que debe superar el gate. */
function entradaValida(overrides = {}) {
  return {
    titulo: 'LED RGB vs LED direccionable: cual conviene para tu setup',
    slug: 'led-rgb-vs-led-direccionable',
    resumen:
      'Comparamos LED RGB y LED direccionable con datos reales de potencia, control y precio para que elijas el sistema que mejor encaja en tu espacio.',
    cuerpo_html: cuerpoValido(),
    faq: [
      { pregunta: '¿Cual es mas facil de instalar?', respuesta: 'El RGB, porque usa un control unico.' },
      { pregunta: '¿Cual ofrece mas efectos?', respuesta: 'El direccionable, al controlar cada LED.' },
      { pregunta: '¿Cual cuesta menos?', respuesta: 'El RGB, tanto en tira como en controlador.' },
    ],
    keywords: ['led rgb vs led direccionable', 'tira led rgb', 'led direccionable'],
    productos: [{ id: 'p1' }, { id: 'p2' }],
    tipo: 'comparativa',
    ...overrides,
  }
}

// ---------- Conteo y tiempo de lectura ----------

test('contarPalabras ignora las etiquetas HTML', () => {
  assert.equal(contarPalabras('<h2>Titulo</h2><p>Dos palabras</p>'), 3)
  assert.equal(contarPalabras(''), 0)
})

test('calcularMinutosLectura devuelve al menos 1 minuto', () => {
  assert.equal(calcularMinutosLectura(''), 1)
  assert.equal(calcularMinutosLectura(palabras(100), 200), 1)
  assert.equal(calcularMinutosLectura(palabras(450), 200), 3)
  // Velocidad inválida -> se usa el valor por defecto (no revienta).
  assert.equal(calcularMinutosLectura(palabras(200), 0), 1)
})

// ---------- Gate de calidad de la entrada ----------

test('validarCalidadEntrada aprueba una entrada completa', () => {
  const r = validarCalidadEntrada(entradaValida(), OPCIONES)
  assert.equal(r.errores.length, 0, r.errores.join(' | '))
  assert.equal(r.ok, true)
})

test('validarCalidadEntrada rechaza clichés de IA', () => {
  const r = validarCalidadEntrada(
    entradaValida({ cuerpo_html: '<h2>Por qué sí comprarlo</h2><p>En el mundo actual todo cambia.</p>' }),
    OPCIONES,
  )
  assert.equal(r.ok, false)
  assert.ok(r.errores.some((e) => e.includes('en el mundo actual')))
})

test('validarCalidadEntrada exige las secciones H2 obligatorias', () => {
  const r = validarCalidadEntrada(entradaValida({ cuerpo_html: `<p>${palabras(500)}</p>` }), OPCIONES)
  assert.equal(r.ok, false)
  assert.equal(r.errores.filter((e) => e.includes('seccion obligatoria')).length, 5)
})

test('validarCalidadEntrada rechaza thin content (pocas palabras)', () => {
  const r = validarCalidadEntrada(
    entradaValida({
      cuerpo_html:
        '<h2>Por qué sí comprarlo</h2><h2>Comparativa</h2><h2>Para quién es</h2>' +
        '<h2>Cómo elegir</h2><h2>Preguntas Frecuentes</h2><p>Muy corto.</p>',
    }),
    OPCIONES,
  )
  assert.equal(r.ok, false)
  assert.ok(r.errores.some((e) => e.includes('minimo exigido')))
})

test('validarCalidadEntrada rechaza <h1> en el cuerpo (H1 único)', () => {
  const r = validarCalidadEntrada(entradaValida({ cuerpo_html: '<h1>Titulo</h1>' + cuerpoValido() }), OPCIONES)
  assert.equal(r.ok, false)
  assert.ok(r.errores.some((e) => e.includes('<h1>')))
})

test('validarCalidadEntrada valida slug, título, resumen, FAQ, keywords, productos y tipo', () => {
  const r = validarCalidadEntrada(
    entradaValida({
      slug: 'Slug Con Mayusculas',
      titulo: 'Corto',
      resumen: 'Muy corto',
      faq: [{ pregunta: 'Unica', respuesta: 'Solo una' }],
      keywords: ['una'],
      productos: [{ id: 'p1' }],
      tipo: 'inventado',
    }),
    OPCIONES,
  )
  assert.equal(r.ok, false)
  assert.ok(r.errores.some((e) => e.includes('slug no es valido')))
  assert.ok(r.errores.some((e) => e.includes('menos de 30')))
  assert.ok(r.errores.some((e) => e.includes('resumen tiene menos de 110')))
  assert.ok(r.errores.some((e) => e.includes('preguntas frecuentes')))
  assert.ok(r.errores.some((e) => e.includes('palabras clave')))
  assert.ok(r.errores.some((e) => e.includes('productos reales')))
  assert.ok(r.errores.some((e) => e.includes('no es valido')))
})

test('validarCalidadEntrada rechaza títulos y resúmenes demasiado largos', () => {
  const r = validarCalidadEntrada(
    entradaValida({ titulo: 'T'.repeat(70), resumen: 'R'.repeat(200) }),
    OPCIONES,
  )
  assert.ok(r.errores.some((e) => e.includes('supera los 65')))
  assert.ok(r.errores.some((e) => e.includes('supera los 160')))
})

// ---------- Selección de pares comparables ----------

test('seleccionarParesComparables solo empareja productos de la misma categoría', () => {
  const pares = seleccionarParesComparables(
    [
      { id: 'a', categoryIds: ['cat-1'] },
      { id: 'b', categoryIds: ['cat-1'] },
      { id: 'c', categoryIds: ['cat-2'] },
      { id: 'd', categoryIds: ['cat-2'] },
    ],
    { maxPares: 10 },
  )
  assert.equal(pares.length, 2)
  assert.equal(pares[0].categoriaId, 'cat-1')
  assert.deepEqual([pares[0].a.id, pares[0].b.id], ['a', 'b'])
  assert.equal(pares[1].categoriaId, 'cat-2')
  // Nunca cruza nichos (comparar productos de nichos distintos = doorway).
  assert.ok(
    pares.every(
      (p) => p.a.categoryIds.includes(p.categoriaId) && p.b.categoryIds.includes(p.categoriaId),
    ),
  )
})

test('seleccionarParesComparables es determinista y respeta maxPares', () => {
  const productos = [
    { id: 'z', categoryIds: ['cat-1'] },
    { id: 'a', categoryIds: ['cat-1'] },
    { id: 'm', categoryIds: ['cat-1'] },
    { id: 'b', categoryIds: ['cat-1'] },
  ]
  const paresUno = seleccionarParesComparables(productos, { maxPares: 10 })
  const paresDos = seleccionarParesComparables([...productos].reverse(), { maxPares: 10 })
  assert.deepEqual(paresUno, paresDos)
  // Orden por id: a-b y m-z (emparejamiento consecutivo).
  assert.deepEqual(
    paresUno.map((p) => [p.a.id, p.b.id]),
    [
      ['a', 'b'],
      ['m', 'z'],
    ],
  )
  assert.equal(seleccionarParesComparables(productos, { maxPares: 1 }).length, 1)
})

test('seleccionarParesComparables ignora grupos con menos de 2 productos', () => {
  assert.deepEqual(seleccionarParesComparables([{ id: 'a', categoryIds: ['cat-1'] }], { maxPares: 5 }), [])
  assert.deepEqual(seleccionarParesComparables([{ id: 'a' }, { id: 'b' }], { maxPares: 5 }), [])
  assert.deepEqual(seleccionarParesComparables([], { maxPares: 5 }), [])
})

// ---------- Tabla comparativa ----------

test('construirComparativa usa SOLO especificaciones reales y normaliza claves', () => {
  const tabla = construirComparativa(
    [
      { slug: 'led-rgb', specifications: { Potencia: '12W', Conectividad: 'WiFi' } },
      { slug: 'led-dir', specifications: { potencia: '18W', Conectividad: 'Bluetooth' } },
    ],
    ['Potencia', 'Precio'],
  )
  assert.equal(tabla.criterios.length, 1)
  assert.equal(tabla.criterios[0].criterio, 'Potencia')
  assert.deepEqual(tabla.criterios[0].valores, [
    { slug: 'led-rgb', valor: '12W' },
    { slug: 'led-dir', valor: '18W' },
  ])
})

test('construirComparativa deriva los criterios de las specs si no se le pasan', () => {
  const tabla = construirComparativa([
    { slug: 'a', specifications: { Potencia: '12W', Color: 'RGB' } },
    { slug: 'b', specifications: { Color: 'RGBW', Vida: '20000h' } },
  ])
  assert.deepEqual(
    tabla.criterios.map((c) => c.criterio),
    ['Potencia', 'Color', 'Vida'],
  )
  // El valor ausente en un producto llega como cadena vacía (nunca undefined).
  assert.equal(tabla.criterios[0].valores[1].valor, '')
})

test('construirComparativa descarta filas sin ningún valor y respeta maxCriterios', () => {
  const tabla = construirComparativa(
    [
      { slug: 'a', specifications: { Potencia: '12W', Peso: '300g' } },
      { slug: 'b', specifications: { Potencia: '18W', Peso: '450g' } },
    ],
    ['Potencia', 'Peso', 'Inexistente'],
    { maxCriterios: 1 },
  )
  assert.equal(tabla.criterios.length, 1)
  assert.equal(tabla.criterios[0].criterio, 'Potencia')
  assert.deepEqual(construirComparativa([], ['Potencia']), { criterios: [] })
})

test('construirComparativa cae a las specs REALES si los criterios pedidos no existen', () => {
  // La IA puede proponer criterios que ninguna ficha declara (o inventarlos):
  // en ese caso la tabla no puede quedar vacía, se comparan los criterios reales.
  const tabla = construirComparativa(
    [
      { slug: 'a', specifications: { Potencia: '12W', Conectividad: 'WiFi' } },
      { slug: 'b', specifications: { Potencia: '18W', Conectividad: 'Bluetooth' } },
    ],
    ['Colores disponibles', 'Garantía extendida'],
  )
  assert.deepEqual(
    tabla.criterios.map((c) => c.criterio),
    ['Potencia', 'Conectividad'],
  )
  assert.equal(tabla.criterios[0].valores.length, 2)
})

// ---------- Schema JSON-LD ----------

test('buildArticleSchema exige url y titular', () => {
  assert.equal(buildArticleSchema({}), null)
  assert.equal(buildArticleSchema({ url: 'https://x.ve/guias/a' }), null)
  assert.equal(buildArticleSchema({ headline: 'Titulo' }), null)
})

test('buildArticleSchema emite SOLO los campos con dato real', () => {
  const schema = buildArticleSchema({
    url: 'https://x.ve/guias/led-rgb-vs-direccionable',
    headline: 'LED RGB vs direccionable',
    description: 'Comparativa con datos reales.',
    author: 'Equipo editorial',
    datePublished: '2026-01-10T00:00:00.000Z',
    dateModified: '2026-02-01T00:00:00.000Z',
    keywords: ['led rgb', ''],
    inLanguage: 'es',
    publisher: { name: 'zonadehobbies' },
  })
  assert.equal(schema['@type'], 'Article')
  assert.equal(schema.headline, 'LED RGB vs direccionable')
  assert.deepEqual(schema.author, { '@type': 'Person', name: 'Equipo editorial' })
  assert.equal(schema.keywords, 'led rgb')
  assert.equal(schema.inLanguage, 'es')
  assert.deepEqual(schema.publisher, { '@type': 'Organization', name: 'zonadehobbies' })
  assert.deepEqual(schema.mainEntityOfPage, {
    '@type': 'WebPage',
    '@id': 'https://x.ve/guias/led-rgb-vs-direccionable',
  })
  // Campos sin dato NO se emiten (schema inválido = error en Search Console).
  assert.equal('image' in schema, false)
  assert.equal('articleSection' in schema, false)
})

test('buildItemListSchema devuelve null sin items y numera desde 1', () => {
  assert.equal(buildItemListSchema([], 'Comparativa'), null)
  assert.equal(buildItemListSchema([{ name: 'Sin url' }], 'X'), null)

  const schema = buildItemListSchema(
    [
      { name: 'LED RGB', url: 'https://x.ve/productos/led-rgb' },
      { name: 'LED direccionable', url: 'https://x.ve/productos/led-dir' },
    ],
    'Comparativa real',
  )
  assert.equal(schema['@type'], 'ItemList')
  assert.equal(schema.name, 'Comparativa real')
  assert.deepEqual(schema.itemListElement[0], {
    '@type': 'ListItem',
    position: 1,
    name: 'LED RGB',
    url: 'https://x.ve/productos/led-rgb',
  })
  assert.equal(schema.itemListElement[1].position, 2)
})

test('buildEntryJsonLd agrupa en @graph y descarta los bloques vacíos', () => {
  const schema = buildEntryJsonLd({
    article: {
      url: 'https://x.ve/guias/led-rgb-vs-direccionable',
      headline: 'LED RGB vs direccionable',
      author: 'Equipo',
      datePublished: '2026-01-10T00:00:00.000Z',
    },
    items: [{ name: 'LED RGB', url: 'https://x.ve/productos/led-rgb' }],
    itemsName: 'Comparativa real',
    faq: [
      { pregunta: '¿Cual elegir?', respuesta: '<p>Depende del <strong>uso</strong>.</p>' },
      { pregunta: '', respuesta: '' },
    ],
    breadcrumb: [
      { name: 'Inicio', url: 'https://x.ve' },
      { name: 'Guías', url: 'https://x.ve/guias' },
    ],
  })
  assert.equal(schema['@context'], 'https://schema.org')
  assert.equal(schema['@graph'].length, 4)
  const tipos = schema['@graph'].map((nodo) => nodo['@type'])
  assert.deepEqual(tipos, ['Article', 'ItemList', 'FAQPage', 'BreadcrumbList'])
  // La FAQ vacía se filtra: solo queda la pregunta real.
  const faq = schema['@graph'][2]
  assert.equal(faq.mainEntity.length, 1)
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, 'Depende del uso.')
})

test('buildEntryJsonLd devuelve null si no hay ninguna pieza válida', () => {
  assert.equal(buildEntryJsonLd({}), null)
  assert.equal(buildEntryJsonLd({ faq: [], items: [], breadcrumb: [] }), null)
})
