import { test } from 'node:test'
import assert from 'node:assert/strict'

// Testing económico: se prueba SOLO la lógica pura (sin Supabase ni Next).
// Mismo patrón que price-calculator.test.mjs / form-validation.test.mjs.
const {
  normalizarTitulo,
  firmaTitulo,
  stripHtml,
  validarCalidadSeo,
  buildBreadcrumbSchema,
  buildFaqSchema,
} = await import('../lib/seo-rules.mjs')

// Configuración de reglas inyectada por parámetro (fuente: lib/constants.ts).
const OPCIONES = {
  bannedPhrases: ['compra segura', 'mejor precio'],
  requiredSections: ['Características principales', 'Preguntas Frecuentes'],
  minTitleLength: 40,
}

// ---------- Normalización / firma anti-duplicado ----------

test('normalizarTitulo quita acentos, signos y espacios extra', () => {
  assert.equal(normalizarTitulo('  Tira  LED · RGB 5M  '), 'tira led rgb 5m')
  assert.equal(normalizarTitulo('Café Ecuador'), 'cafe ecuador')
})

test('firmaTitulo toma las primeras N palabras significativas', () => {
  assert.equal(firmaTitulo('Envase Dosificador de Vidrio 500ml', 3), 'envase dosificador de')
  // Dos títulos que solo difieren al final colisionan en la firma (duplicado).
  assert.equal(
    firmaTitulo('Envase Dosificador de Vidrio 500ml'),
    firmaTitulo('Envase Dosificador de Vidrio 1000ml'),
  )
})

test('stripHtml limpia etiquetas para las respuestas de FAQ', () => {
  assert.equal(stripHtml('<p>Hola <strong>mundo</strong></p>'), 'Hola mundo')
})

// ---------- Validación de calidad ----------

test('validarCalidadSeo aprueba un contenido correcto', () => {
  const data = {
    titulo_seo: 'Tira LED RGB 5 metros con control: iluminacion de ambiente',
    descripcion_html:
      '<h2>Características principales</h2><ul><li>RGB</li></ul>' +
      '<h2>Preguntas Frecuentes</h2><h3>¿Es resistente?</h3><p>Si.</p>',
  }
  const r = validarCalidadSeo(data, OPCIONES)
  assert.equal(r.ok, true)
  assert.equal(r.errores.length, 0)
})

test('validarCalidadSeo rechaza frases genéricas prohibidas', () => {
  const data = {
    titulo_seo: 'Compra segura: tira LED RGB de alta luminosidad para tu hogar',
    descripcion_html: '<h2>Características principales</h2><h2>Preguntas Frecuentes</h2>',
  }
  const r = validarCalidadSeo(data, OPCIONES)
  assert.equal(r.ok, false)
  assert.ok(r.errores.some((e) => e.includes('compra segura')))
})

test('validarCalidadSeo exige las secciones H2 obligatorias', () => {
  const data = {
    titulo_seo: 'Tira LED RGB 5 metros con control remoto para iluminacion',
    descripcion_html: '<p>Descripcion sin secciones.</p>',
  }
  const r = validarCalidadSeo(data, OPCIONES)
  assert.equal(r.ok, false)
  assert.equal(r.errores.filter((e) => e.includes('seccion obligatoria')).length, 2)
})

test('validarCalidadSeo rechaza <h1> dentro de la descripción (H1 único)', () => {
  const data = {
    titulo_seo: 'Tira LED RGB 5 metros con control remoto para iluminacion',
    descripcion_html: '<h1>Titulo</h1><h2>Características principales</h2><h2>Preguntas Frecuentes</h2>',
  }
  const r = validarCalidadSeo(data, OPCIONES)
  assert.equal(r.ok, false)
  assert.ok(r.errores.some((e) => e.includes('<h1>')))
})

test('validarCalidadSeo rechaza títulos demasiado cortos', () => {
  const data = {
    titulo_seo: 'Tira LED',
    descripcion_html: '<h2>Características principales</h2><h2>Preguntas Frecuentes</h2>',
  }
  const r = validarCalidadSeo(data, OPCIONES)
  assert.equal(r.ok, false)
  assert.ok(r.errores.some((e) => e.includes('menos de 40')))
})

// ---------- Constructores de schema JSON-LD ----------

test('buildBreadcrumbSchema genera posiciones correctas', () => {
  const schema = buildBreadcrumbSchema([
    { name: 'Inicio', url: 'https://x.ve' },
    { name: 'Catálogo', url: 'https://x.ve/catalogo' },
    { name: 'Tira LED', url: 'https://x.ve/productos/tira-led' },
  ])
  assert.equal(schema['@type'], 'BreadcrumbList')
  assert.equal(schema.itemListElement.length, 3)
  assert.deepEqual(schema.itemListElement[0], {
    '@type': 'ListItem',
    position: 1,
    name: 'Inicio',
    item: 'https://x.ve',
  })
  assert.equal(schema.itemListElement[2].position, 3)
})

test('buildFaqSchema devuelve null si no hay preguntas válidas', () => {
  assert.equal(buildFaqSchema(null), null)
  assert.equal(buildFaqSchema([]), null)
  assert.equal(buildFaqSchema([{ pregunta: '   ', respuesta: '' }]), null)
})

test('buildFaqSchema construye mainEntity y limpia el HTML de las respuestas', () => {
  const schema = buildFaqSchema([
    { pregunta: '¿Incluye control?', respuesta: '<p>Si, <strong>incluye</strong> control.</p>' },
  ])
  assert.equal(schema['@type'], 'FAQPage')
  assert.equal(schema.mainEntity.length, 1)
  assert.equal(schema.mainEntity[0]['@type'], 'Question')
  assert.equal(schema.mainEntity[0].name, '¿Incluye control?')
  assert.equal(schema.mainEntity[0].acceptedAnswer.text, 'Si, incluye control.')
})
