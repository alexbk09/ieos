import { test } from 'node:test'
import assert from 'node:assert/strict'

// Testing económico: solo la LÓGICA PURA de localización legal (sin Next ni red).
// Mismo patrón que tests/i18n.test.mjs.
const {
  isLegalBlocksCompatible,
  resolveLegalSection,
  missingLegalParts,
  resolveLegalDocument,
  mergeLegalTranslations,
} = await import('../lib/legal-i18n.mjs')
const { TERMS_DOCUMENT } = await import('../lib/legal-content-data.mjs')

/** Documento mínimo de prueba: 2 secciones (un párrafo y una lista de 2 ítems). */
const DOC = {
  key: 'terms',
  path: '/terminos',
  titleKey: 'footer.terms',
  updatedAt: '2026-01-01',
  summary: 'Resumen en español',
  sections: [
    { id: 'uno', title: '1. Uno', blocks: [{ kind: 'p', text: 'Texto base con {name}' }] },
    { id: 'dos', title: '2. Dos', blocks: [{ kind: 'ul', items: ['A', 'B'] }] },
  ],
}

/** Diccionario con la sección 1 traducida y la 2 inválida (lista incompleta). */
const DICT = {
  fr: {
    terms: {
      summary: 'Résumé en français',
      sections: {
        uno: { title: '1. Un', blocks: [{ kind: 'p', text: 'Texte avec {name}' }] },
        dos: { title: '2. Deux', blocks: [{ kind: 'ul', items: ['A'] }] },
      },
    },
  },
}

test('el idioma raíz se sirve tal cual (no se traduce a sí mismo)', () => {
  assert.equal(resolveLegalDocument(DOC, 'es', DICT), DOC)
  assert.equal(resolveLegalDocument(DOC, 'es-ES', DICT), DOC)
})

test('resolveLegalDocument aplica lo traducido y cae al raíz por sección', () => {
  const doc = resolveLegalDocument(DOC, 'fr', DICT)
  assert.equal(doc.summary, 'Résumé en français')
  assert.equal(doc.sections[0].title, '1. Un')
  assert.equal(doc.sections[0].blocks[0].text, 'Texte avec {name}')
  // Estructura inválida (lista con 1 ítem en vez de 2) → se conserva el raíz.
  assert.equal(doc.sections[1].title, '2. Dos')
  assert.deepEqual(doc.sections[1].blocks[0].items, ['A', 'B'])
  // Los anclajes de URL y la ruta NUNCA cambian con el idioma.
  assert.deepEqual(doc.sections.map((s) => s.id), ['uno', 'dos'])
  assert.equal(doc.path, '/terminos')
})

test('isLegalBlocksCompatible exige mismo nº de bloques, tipo y nº de ítems', () => {
  const base = [{ kind: 'ul', items: ['A', 'B'] }]
  assert.equal(isLegalBlocksCompatible(base, [{ kind: 'ul', items: ['X', 'Y'] }]), true)
  assert.equal(isLegalBlocksCompatible(base, [{ kind: 'ul', items: ['X'] }]), false)
  assert.equal(isLegalBlocksCompatible(base, [{ kind: 'p', text: 'X' }]), false)
  assert.equal(isLegalBlocksCompatible(base, []), false)
})

test('resolveLegalSection ignora candidatos vacíos o con bloques mal formados', () => {
  const base = DOC.sections[0]
  // Sección incompleta o con estructura inválida → se sirve la raíz tal cual.
  assert.equal(resolveLegalSection(base, null), base)
  assert.deepEqual(resolveLegalSection(base, { title: '', blocks: [] }), base)
  assert.deepEqual(resolveLegalSection(base, { title: '1. Un', blocks: [] }), base)
  assert.deepEqual(
    resolveLegalSection(base, { title: '1. Un', blocks: [{ kind: 'p', text: 'Texte {name}' }] }).title,
    '1. Un',
  )
})

test('missingLegalParts detecta resumen y secciones pendientes o inválidas', () => {
  // Sin traducción: todo pendiente (resumen + las 2 secciones).
  assert.deepEqual(missingLegalParts(DOC, undefined), ['summary', 'uno', 'dos'])
  // La sección 'dos' del diccionario tiene una lista incompleta → pendiente.
  assert.deepEqual(missingLegalParts(DOC, DICT.fr.terms), ['dos'])
  // Traducción completa y con estructura válida → nada pendiente.
  const completas = {
    uno: { title: '1. Un', blocks: [{ kind: 'p', text: 'Texte {name}' }] },
    dos: { title: '2. Deux', blocks: [{ kind: 'ul', items: ['X', 'Y'] }] },
  }
  assert.deepEqual(missingLegalParts(DOC, { summary: 'ok', sections: completas }), [])
})

test('mergeLegalTranslations valida, no pierde lo ya traducido y acepta array u objeto', () => {
  // Respuesta con las 2 secciones correctas (arrays de bloques compatibles).
  const respuesta = {
    summary: 'Résumé',
    sections: [
      { id: 'uno', title: '1. Un', blocks: [{ kind: 'p', text: 'Texte {name}' }] },
      { id: 'dos', title: '2. Deux', blocks: [{ kind: 'ul', items: ['A', 'B'] }] },
    ],
  }
  const entry = mergeLegalTranslations(DOC, undefined, respuesta)
  assert.equal(entry.summary, 'Résumé')
  assert.deepEqual(Object.keys(entry.sections), ['uno', 'dos'])
  assert.deepEqual(entry.sections.dos.blocks[0].items, ['A', 'B'])

  // Segunda pasada: la sección 'uno' se conserva aunque el modelo la omita.
  const segunda = mergeLegalTranslations(DOC, entry, { sections: [{ id: 'dos', title: '2. Deux!', blocks: [{ kind: 'ul', items: ['A', 'B'] }] }] })
  assert.equal(segunda.sections.uno.title, '1. Un')
  assert.equal(segunda.sections.dos.title, '2. Deux!')

  // Sección con estructura inválida: no se guarda (cae al idioma raíz).
  const invalida = mergeLegalTranslations(DOC, undefined, { sections: [{ id: 'dos', title: '2. Deux', blocks: [{ kind: 'ul', items: ['solo'] }] }] })
  assert.equal(invalida.sections.dos, undefined)
})

test('los documentos reales tienen secciones con id único y bloques válidos', () => {
  const ids = TERMS_DOCUMENT.sections.map((section) => section.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const section of TERMS_DOCUMENT.sections) {
    assert.ok(isLegalBlocksCompatible(section.blocks, section.blocks), `bloques inválidos en ${section.id}`)
  }
})

test('acepta claves traducidas por el modelo (bloques/elementos/texto)', () => {
  // El modelo devolvió los nombres de las claves en el idioma destino.
  const respuesta = {
    resumo: 'Resumo traduzido',
    secoes: [
      { identificador: 'uno', encabezado: '1. Um', blocos: [{ tipo: 'p', texto: 'Texto {name}' }] },
      { identificador: 'dos', encabezado: '2. Dois', blocos: [{ tipo: 'ul', elementos: ['X', 'Y'] }] },
    ],
  }
  const entry = mergeLegalTranslations(DOC, undefined, respuesta)
  assert.equal(entry.summary, 'Resumo traduzido')
  // Se guarda en forma CANÓNICA (claves del idioma raíz).
  assert.deepEqual(Object.keys(entry.sections).sort(), ['dos', 'uno'])
  assert.deepEqual(entry.sections.uno.blocks, [{ kind: 'p', text: 'Texto {name}' }])
  assert.deepEqual(entry.sections.dos.blocks, [{ kind: 'ul', items: ['X', 'Y'] }])

  // El documento resuelto para ese idioma sirve el contenido traducido.
  const doc = resolveLegalDocument(DOC, 'pt', { pt: { terms: entry } })
  assert.equal(doc.summary, 'Resumo traduzido')
  assert.equal(doc.sections[1].title, '2. Dois')
  assert.deepEqual(doc.sections[1].blocks[0].items, ['X', 'Y'])
})
