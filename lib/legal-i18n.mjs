/**
 * Localización de los DOCUMENTOS LEGALES (lógica pura, compartida).
 * ------------------------------------------------------------------
 * Formato .mjs (mismo patrón que i18n-config / i18n-content / i18n-messages)
 * por dos razones:
 *  1) La app (lib/legal-content.ts) la consume directamente en el render.
 *  2) El backfill (scripts/backfill-legal-i18n.mjs) la usa para saber qué falta
 *     y para validar lo que devuelve el modelo: fuente ÚNICA, cero duplicación.
 *
 * El idioma RAÍZ (español) NUNCA se traduce: se hereda del dato base. Para el
 * resto de idiomas se aplica el diccionario generado en lib/i18n/legal/<locale>.mjs
 * con fallback al español: si falta una sección, la página sigue siendo válida
 * (y no se mezclan idiomas dentro del mismo bloque).
 */

import { SOURCE_LOCALE, baseLanguage, localeNativeName } from './i18n-config.mjs'
// Alias de claves del traductor: el modelo a veces traduce el NOMBRE del campo
// (`blocks` → `bloques`, `items` → `elementos`); sin normalizar se perdería la
// sección en silencio.
import {
  LEGAL_BLOCKS_ALIASES,
  LEGAL_ID_ALIASES,
  LEGAL_ITEMS_ALIASES,
  LEGAL_KIND_ALIASES,
  LEGAL_SECTION_TITLE_ALIASES,
  LEGAL_SECTIONS_ALIASES,
  LEGAL_SUMMARY_ALIASES,
  LEGAL_TEXT_ALIASES,
  pickAliased,
} from './i18n-aliases.mjs'
import en from './i18n/legal/en.mjs'
import fr from './i18n/legal/fr.mjs'
import de from './i18n/legal/de.mjs'
import it from './i18n/legal/it.mjs'
import pt from './i18n/legal/pt.mjs'

/**
 * Diccionarios legales por idioma: { locale: { [docKey]: { summary, sections } } }.
 * Cada archivo lo genera/actualiza scripts/backfill-legal-i18n.mjs.
 */
export const LEGAL_MESSAGES = { en, fr, de, it, pt }

/** ¿Es un objeto plano (no array ni null)? */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Texto no vacío (trim) o '' (tolera null/undefined/números). */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Normaliza un bloque traducido a la forma canónica (acepta claves con alias). */
function normalizeLegalBlock(candidate) {
  if (!isPlainObject(candidate)) return null
  const kind = pickAliased(candidate, LEGAL_KIND_ALIASES)
  return {
    kind: typeof kind === 'string' ? kind.trim().toLowerCase() : '',
    text: pickAliased(candidate, LEGAL_TEXT_ALIASES),
    items: pickAliased(candidate, LEGAL_ITEMS_ALIASES),
  }
}

/**
 * Valida que los bloques traducidos conserven la MISMA estructura que el idioma
 * raíz (nº de bloques, tipo de cada uno y nº de ítems de cada lista).
 * POR QUÉ: el render asume esa estructura; si el modelo devuelve una lista más
 * corta o convierte un párrafo en lista, la página se vería incompleta. Ante la
 * duda se descarta la traducción del bloque y se conserva el texto base.
 * @param {any[]} reference Bloques del idioma raíz.
 * @param {unknown} candidate Bloques propuestos por el traductor.
 * @returns {boolean}
 */
export function isLegalBlocksCompatible(reference, candidate) {
  if (!Array.isArray(reference) || !Array.isArray(candidate)) return false
  if (reference.length !== candidate.length) return false

  for (let index = 0; index < reference.length; index += 1) {
    const base = reference[index]
    const traducido = normalizeLegalBlock(candidate[index])
    if (!traducido || traducido.kind !== String(base?.kind ?? '').toLowerCase()) return false

    if (base.kind === 'p') {
      if (!text(traducido.text)) return false
      continue
    }
    if (base.kind === 'ul') {
      const itemsBase = Array.isArray(base.items) ? base.items : []
      if (!Array.isArray(traducido.items) || traducido.items.length !== itemsBase.length) return false
      if (!traducido.items.every((item) => text(item))) return false
      continue
    }
    // Tipo de bloque desconocido: no se acepta contenido nuevo sin validar.
    return false
  }

  return true
}

/**
 * Bloques en forma CANÓNICA ({ kind, text } | { kind, items }) listos para
 * guardar y renderizar: los alias de claves ya quedaron resueltos.
 * @param {any[]} reference Bloques del idioma raíz.
 * @param {unknown} candidate Bloques traducidos.
 * @returns {any[]|null} Bloques canónicos o null si la estructura no es válida.
 */
export function canonicalLegalBlocks(reference, candidate) {
  if (!isLegalBlocksCompatible(reference, candidate)) return null
  return candidate.map((bloque) => {
    const normalizado = normalizeLegalBlock(bloque)
    return normalizado.kind === 'p'
      ? { kind: 'p', text: String(normalizado.text).trim() }
      : { kind: 'ul', items: normalizado.items.map((item) => String(item).trim()) }
  })
}

/**
 * Aplica la traducción de UNA sección sobre su versión raíz.
 * La sección se identifica por `id` (ancla estable): los títulos cambian de
 * idioma, pero el orden y las anclas de la URL nunca se alteran.
 * ------------------------------------------------------------------
 * Se acepta la sección COMPLETA o nada: si falta el título o los bloques no
 * conservan la estructura del idioma raíz, se devuelve la sección raíz entera.
 * Así nunca se ve un título traducido con el cuerpo en otro idioma.
 * @param {any} base Sección del idioma raíz.
 * @param {unknown} candidate Sección traducida (puede faltar o ser inválida).
 * @returns {any} Sección resuelta (traducida si es válida; si no, la base).
 */
export function resolveLegalSection(base, candidate) {
  if (!isPlainObject(candidate)) return base
  const titulo = text(pickAliased(candidate, LEGAL_SECTION_TITLE_ALIASES))
  // Los bloques se guardan en forma canónica (alias resueltos) o no se usan.
  const bloques = canonicalLegalBlocks(base.blocks, pickAliased(candidate, LEGAL_BLOCKS_ALIASES))
  if (!titulo || !bloques) return base
  return { ...base, title: titulo, blocks: bloques }
}

/**
 * Índice { id → sección traducida } de un documento.
 * Acepta tanto un objeto indexado por id como un array de secciones con su `id`,
 * y resuelve los alias de claves (`sections`/`secciones`, `id`/`clave`, …).
 * @param {unknown} entry Documento traducido.
 * @returns {Map<string, any>} Mapa id → sección traducida.
 */
function legalSectionsIndex(entry) {
  /** @type {Map<string, any>} */
  const indice = new Map()
  const crudo = pickAliased(entry, LEGAL_SECTIONS_ALIASES)

  if (Array.isArray(crudo)) {
    for (const seccion of crudo) {
      const id = pickAliased(seccion, LEGAL_ID_ALIASES)
      if (typeof id === 'string' && id.trim()) indice.set(id.trim(), seccion)
    }
  } else if (isPlainObject(crudo)) {
    for (const [id, seccion] of Object.entries(crudo)) indice.set(id, seccion)
  }

  return indice
}

/**
 * Partes de un documento que aún no están traducidas en un idioma.
 * @param {any} baseDoc Documento en el idioma raíz.
 * @param {unknown} entry Traducción del documento en el idioma pedido.
 * @returns {string[]} Pendientes: 'summary' y/o ids de sección.
 */
export function missingLegalParts(baseDoc, entry) {
  if (!isPlainObject(entry)) {
    return ['summary', ...(baseDoc?.sections ?? []).map((section) => section.id)]
  }

  const pendientes = []
  if (!text(pickAliased(entry, LEGAL_SUMMARY_ALIASES))) pendientes.push('summary')

  const secciones = legalSectionsIndex(entry)
  for (const section of baseDoc?.sections ?? []) {
    const candidate = secciones.get(section.id)
    if (!isPlainObject(candidate) || !text(pickAliased(candidate, LEGAL_SECTION_TITLE_ALIASES))) {
      pendientes.push(section.id)
      continue
    }
    const bloques = canonicalLegalBlocks(section.blocks, pickAliased(candidate, LEGAL_BLOCKS_ALIASES))
    if (!bloques) pendientes.push(section.id)
  }

  return pendientes
}

/**
 * Idiomas destino con traducciones legales pendientes (fuente única de detección).
 * @param {any[]} baseDocs Documentos en el idioma raíz.
 * @param {Record<string, any>} [dictionaries] Diccionarios legales.
 * @returns {Record<string, string[]>} { locale: ['docKey/seccion', ...] }.
 */
export function missingLegalLocales(baseDocs, dictionaries = LEGAL_MESSAGES) {
  const resultado = {}
  for (const [locale, docs] of Object.entries(dictionaries ?? {})) {
    if (!locale || locale === SOURCE_LOCALE) continue
    const pendientes = []
    for (const baseDoc of baseDocs ?? []) {
      for (const parte of missingLegalParts(baseDoc, docs?.[baseDoc.key])) {
        pendientes.push(baseDoc.key + '/' + parte)
      }
    }
    if (pendientes.length > 0) resultado[locale] = pendientes
  }
  return resultado
}

/**
 * Devuelve un documento legal en el idioma pedido, con fallback al idioma raíz.
 * El idioma raíz se sirve tal cual (no se traduce a sí mismo).
 * @param {any} baseDoc Documento base (idioma raíz) con su `key`.
 * @param {string|null|undefined} locale Idioma pedido (acepta variantes "fr-CA").
 * @param {Record<string, any>} [dictionaries] Diccionarios legales.
 * @returns {any} Documento localizado.
 */
export function resolveLegalDocument(baseDoc, locale, dictionaries = LEGAL_MESSAGES) {
  if (!baseDoc) return baseDoc
  const idioma = baseLanguage(locale)
  if (!idioma || idioma === SOURCE_LOCALE) return baseDoc

  const entry = dictionaries?.[idioma]?.[baseDoc.key]
  if (!isPlainObject(entry)) return baseDoc

  /** Índice { id: sección traducida } del documento en ese idioma. */
  const secciones = legalSectionsIndex(entry)

  return {
    ...baseDoc,
    summary: text(pickAliased(entry, LEGAL_SUMMARY_ALIASES)) || baseDoc.summary,
    sections: (baseDoc.sections ?? []).map((section) => resolveLegalSection(section, secciones.get(section.id))),
  }
}

// ---------- Traducción (prompt + fusión) ----------

/**
 * Construye los mensajes del modelo para traducir un DOCUMENTO LEGAL COMPLETO.
 * ------------------------------------------------------------------
 * POR QUÉ un documento por llamada (y no los 3 juntos): cada documento ronda
 * los 6 KB de texto; pedir los 3 en una sola respuesta arriesga el corte por
 * límite de tokens (JSON incompleto). El script paraleliza por idioma.
 * @param {{ doc: any, locales: string[] }} input Documento raíz + idiomas destino.
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
export function buildLegalMessages({ doc, locales }) {
  const system =
    'Eres traductor profesional de contenido LEGAL para sitios de comercio electrónico y de afiliación. ' +
    'Traduce un documento legal completo (términos, privacidad o aviso de afiliado) a los idiomas pedidos. ' +
    'REGLAS: 1) Traducción fiel y COMPLETA: no resumas, no añadas, no omitas y no alteres el sentido jurídico. ' +
    '2) Conserva EXACTAMENTE la estructura: las claves "id" y "kind", el ORDEN y el NÚMERO de bloques y de elementos de cada lista. ' +
    '3) En los bloques de tipo "ul" traduce el array "items" sin cambiar su número de elementos. ' +
    '4) Mantén LITERALMENTE los marcadores {name}, {email} y {address} (se sustituyen al renderizar). ' +
    '5) Mantén los números de los títulos de sección ("1.", "2."…) y los nombres propios y marcas sin traducir (por ejemplo AliExpress). ' +
    '6) Conserva tal cual las referencias a países u organismos (por ejemplo la República Bolivariana de Venezuela). ' +
    '7) Usa un registro formal, claro y directo en el idioma destino. ' +
    '8) Devuelve EXCLUSIVAMENTE JSON válido con la forma ' +
    '{"<idioma>":{"summary":"","sections":[{"id":"","title":"","blocks":[{"kind":"p","text":""}]}]}}, ' +
    'usando las claves de idioma exactas solicitadas.'

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        documento_origen: { key: doc?.key, summary: doc?.summary, sections: doc?.sections ?? [] },
        idiomas_destino: locales,
        // Nombre nativo de cada idioma: el prompt está en español, así que el
        // idioma destino se nombra en su propia lengua (cero literales quemados).
        nombres_de_idioma: Object.fromEntries(locales.map((locale) => [locale, localeNativeName(locale)])),
      }),
    },
  ]
}

/**
 * Fusiona la respuesta del modelo con lo ya traducido, VALIDANDO estructura.
 * ------------------------------------------------------------------
 * Solo se acepta una sección si trae título traducido Y sus bloques conservan
 * la estructura del idioma raíz. Si no, se descarta por completo (la web sirve
 * esa sección en el idioma raíz): nunca se guarda una sección a medias que
 * mezcle idiomas dentro del mismo bloque.
 * @param {any} baseDoc Documento en el idioma raíz.
 * @param {unknown} entryActual Traducción ya guardada (puede venir vacía).
 * @param {unknown} traduccion Respuesta del modelo para ese documento.
 * @returns {{ summary?: string, sections: Record<string, { title: string, blocks: any[] }> }}
 */
export function mergeLegalTranslations(baseDoc, entryActual, traduccion) {
  const actual = isPlainObject(entryActual) ? entryActual : {}
  const seccionesActuales = isPlainObject(actual.sections) ? { ...actual.sections } : {}

  /** Índice por `id` de las secciones devueltas (tolera arrays y clave traducida). */
  const devueltas = legalSectionsIndex(traduccion)

  for (const base of baseDoc?.sections ?? []) {
    const candidata = devueltas.get(base.id)
    if (!isPlainObject(candidata)) continue
    const titulo = text(pickAliased(candidata, LEGAL_SECTION_TITLE_ALIASES))
    if (!titulo) continue
    // Se guardan los bloques CANÓNICOS (alias resueltos) o no se guarda nada.
    const bloques = canonicalLegalBlocks(base.blocks, pickAliased(candidata, LEGAL_BLOCKS_ALIASES))
    if (!bloques) continue
    seccionesActuales[base.id] = { title: titulo, blocks: bloques }
  }

  const summary = text(pickAliased(traduccion, LEGAL_SUMMARY_ALIASES)) || text(actual.summary)
  return summary ? { summary, sections: seccionesActuales } : { sections: seccionesActuales }
}

