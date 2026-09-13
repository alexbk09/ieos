/**
 * Declaración de tipos para lib/legal-i18n.mjs (localización del contenido legal).
 */

import type { LegalBlock, LegalDocument, LegalSection } from './legal-content'

/** Diccionarios legales por idioma: { locale: { [docKey]: { summary, sections } } }. */
export const LEGAL_MESSAGES: Record<
  string,
  Record<
    string,
    {
      summary?: string
      sections?: Record<string, { title?: string; blocks?: LegalBlock[] }>
    }
  >
>

/** ¿Los bloques traducidos conservan la estructura del idioma raíz? */
export function isLegalBlocksCompatible(reference: LegalBlock[], candidate: unknown): boolean

/** Bloques en forma canónica (alias de claves resueltos) o null si son inválidos. */
export function canonicalLegalBlocks(reference: LegalBlock[], candidate: unknown): LegalBlock[] | null

/** Aplica la traducción de una sección sobre su versión raíz (fallback por sección). */
export function resolveLegalSection(base: LegalSection, candidate: unknown): LegalSection

/** Partes sin traducir de un documento en un idioma ('summary' y/o ids de sección). */
export function missingLegalParts(baseDoc: LegalDocument, entry: unknown): string[]

/** Idiomas con traducciones legales pendientes. */
export function missingLegalLocales(
  baseDocs: LegalDocument[],
  dictionaries?: Record<string, any>,
): Record<string, string[]>

/** Documento legal en el idioma pedido, con fallback al idioma raíz. */
export function resolveLegalDocument(
  baseDoc: LegalDocument,
  locale: string | null | undefined,
  dictionaries?: Record<string, any>,
): LegalDocument

/** Mensaje del modelo (mismo contrato que lib/i18n-translate.mjs). */
export type LegalChatMessage = { role: 'system' | 'user'; content: string }

/** Mensajes del modelo para traducir un documento legal completo. */
export function buildLegalMessages(input: { doc: LegalDocument; locales: string[] }): LegalChatMessage[]

/** Fusiona la respuesta del modelo con lo ya traducido, validando la estructura. */
export function mergeLegalTranslations(
  baseDoc: LegalDocument,
  entryActual: unknown,
  traduccion: unknown,
): { summary?: string; sections: Record<string, { title: string; blocks: LegalBlock[] }> }
