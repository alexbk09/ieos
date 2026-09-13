/**
 * Contenido legal estructurado (FUENTE ÚNICA de tipos y utilidades).
 * ------------------------------------------------------------------
 * POR QUÉ existe este módulo:
 *  - El footer enlaza a 3 documentos legales (términos, privacidad y aviso de
 *    afiliado). Redactarlos sueltos en cada página duplicaría textos y haría
 *    imposible mantenerlos sincronizados. Aquí viven UNA sola vez.
 *  - Es lógica pura de dato: NO toca Supabase ni componentes (regla de oro de
 *    desacoplamiento). Las páginas solo leen y renderizan.
 *  - Las RUTAS y las CLAVES i18n quedan centralizadas: cambiar una URL o un
 *    título no obliga a buscar cadenas "quemadas" por el código.
 *
 * MULTILINGÜE (6 idiomas):
 *  - Los TEXTOS base (idioma raíz = español) viven en
 *    `lib/legal-content-data.mjs`: formato .mjs puro para que los scripts de
 *    backfill y los tests de Node lo importen sin compilar TypeScript.
 *  - Las traducciones viven en `lib/i18n/legal/<locale>.mjs` (generadas por
 *    `scripts/backfill-legal-i18n.mjs`) y se aplican sección a sección con
 *    `getLegalDocument(key, locale)`, que SIEMPRE cae al español si falta algo
 *    (una página legal jamás queda a medias ni mezcla idiomas en un bloque).
 *  - Los títulos de cada documento reutilizan las claves `footer.*` de
 *    lib/i18n/messages (ya traducidas a los 6 idiomas).
 */

import { buildLocalizedPath } from '@/lib/i18n-config'
import type { Translator } from '@/lib/i18n-messages'
// DATA pura de los documentos (compartida con scripts y tests) + localización.
import {
  AFFILIATE_DOCUMENT,
  LEGAL_LAST_UPDATED,
  PRIVACY_DOCUMENT,
  TERMS_DOCUMENT,
} from '@/lib/legal-content-data'
import { resolveLegalDocument } from '@/lib/legal-i18n'

// ---------- Tipos ----------

/** Bloque de contenido dentro de una sección legal. */
export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }

/** Sección de un documento legal (con ancla estable para el índice). */
export type LegalSection = {
  /** Identificador del ancla (`#id`) para el índice y los enlaces profundos. */
  id: string
  title: string
  blocks: LegalBlock[]
}

/** Claves de los 3 documentos legales del footer. */
export type LegalDocKey = 'terms' | 'privacy' | 'affiliate'

/** Documento legal completo. */
export type LegalDocument = {
  key: LegalDocKey
  /** Ruta pública SIN prefijo de idioma (el idioma lo añade el router). */
  path: string
  /** Clave i18n del título (reutiliza las claves `footer.*` ya traducidas). */
  titleKey: string
  /** Fecha de última revisión en ISO; se muestra y alimenta `dateModified`. */
  updatedAt: string
  /** Resumen corto para el hub legal (/politicas). */
  summary: string
  sections: LegalSection[]
}

// ---------- Interpolación ----------

/**
 * Tokens que el contenido puede incluir y que se resuelven en render:
 * `{name}` (marca), `{email}` (contacto) y `{address}` (dirección).
 * Centralizados para no repetir literales dispersos por los textos.
 */
export const LEGAL_TOKENS = {
  name: '{name}',
  email: '{email}',
  address: '{address}',
} as const

/** Valores disponibles para sustituir los tokens del contenido legal. */
export type LegalTokenValues = { name: string; email: string; address: string }

/**
 * Sustituye los tokens `{name}` / `{email}` / `{address}` de un texto legal.
 * @param template Texto con tokens opcionales.
 * @param values Valores resueltos en tiempo de render.
 * @returns Texto con los tokens reemplazados (los ausentes se dejan tal cual).
 */
export function renderLegalText(template: string, values: Partial<LegalTokenValues>): string {
  return template
    .replaceAll(LEGAL_TOKENS.name, values.name ?? LEGAL_TOKENS.name)
    .replaceAll(LEGAL_TOKENS.email, values.email ?? LEGAL_TOKENS.email)
    .replaceAll(LEGAL_TOKENS.address, values.address ?? LEGAL_TOKENS.address)
}

/**
 * Fecha de última revisión de la versión vigente de los documentos legales.
 * Centralizada en la DATA pura (lib/legal-content-data.mjs): al actualizar los
 * textos se cambia UNA vez y se refleja en todas las páginas (metadato +
 * `dateModified` del JSON-LD).
 */
export { LEGAL_LAST_UPDATED }

// ---------- Localización ----------

/**
 * Documento legal en el idioma pedido, con fallback sección a sección al idioma
 * raíz. El español se sirve tal cual (no se traduce a sí mismo) y las URLs
 * conservan SIEMPRE las mismas anclas (`#aceptacion`, `#datos`…), porque la
 * traducción se indexa por `id` de sección, nunca por posición.
 * @param key Documento legal ('terms' | 'privacy' | 'affiliate').
 * @param locale Idioma activo (acepta variantes regionales "fr-CA").
 * @returns Documento listo para render (título/índice/cuerpo en su idioma).
 */
export function getLegalDocument(key: LegalDocKey, locale: string): LegalDocument {
  return resolveLegalDocument(LEGAL_DOCUMENTS[key], locale)
}

/**
 * Los 3 documentos legales en el idioma pedido.
 * Lo consume el hub `/politicas` (índice con resúmenes traducidos) para no
 * resolver documento a documento en la vista.
 * @param locale Idioma activo.
 */
export function getLegalDocuments(locale: string): Record<LegalDocKey, LegalDocument> {
  return {
    terms: getLegalDocument('terms', locale),
    privacy: getLegalDocument('privacy', locale),
    affiliate: getLegalDocument('affiliate', locale),
  }
}

// ---------- Registro ----------

/** Registro indexado por clave de los 3 documentos legales. */
export const LEGAL_DOCUMENTS: Record<LegalDocKey, LegalDocument> = {
  terms: TERMS_DOCUMENT,
  privacy: PRIVACY_DOCUMENT,
  affiliate: AFFILIATE_DOCUMENT,
}

/**
 * Orden de presentación de los documentos (hub y cross-links).
 * El aviso de afiliado va primero: es el más relevante para el visitante de una
 * tienda de afiliación y lo exige la transparencia con el usuario.
 */
export const LEGAL_DOCUMENT_ORDER: LegalDocKey[] = ['affiliate', 'terms', 'privacy']

/**
 * Ruta pública (SIN prefijo de idioma) de un documento legal.
 * Fuente única de la URL: footer, sitemap y páginas la consumen desde aquí.
 */
export function legalDocumentPath(key: LegalDocKey): string {
  return LEGAL_DOCUMENTS[key].path
}

/** ¿La ruta (sin prefijo de idioma) corresponde a uno de los documentos legales? */
export function isLegalDocumentPath(path: string): boolean {
  return LEGAL_DOCUMENT_ORDER.some((key) => LEGAL_DOCUMENTS[key].path === path)
}

/**
 * Enlaces cruzados entre los documentos legales, ya LOCALIZADOS y traducidos.
 * Excluye el documento activo para no enlazarse a sí mismo.
 * @param locale Idioma activo.
 * @param t Traductor ligado al idioma.
 * @param excludeKey Documento que no debe aparecer en la lista.
 */
export function buildLegalDocLinks(
  locale: string,
  t: Translator,
  excludeKey?: LegalDocKey,
): { key: LegalDocKey; title: string; href: string }[] {
  return LEGAL_DOCUMENT_ORDER.filter((key) => key !== excludeKey).map((key) => {
    const doc = LEGAL_DOCUMENTS[key]
    return {
      key,
      title: t(doc.titleKey),
      href: buildLocalizedPath(doc.path, locale, { prefixDefaultLocale: false }),
    }
  })
}
