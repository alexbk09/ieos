/**
 * Declaración de tipos para lib/legal-content-data.mjs (datos legales puros).
 * Los tipos estructurales viven en lib/legal-content.ts (import de SOLO tipo:
 * no genera ciclo en tiempo de ejecución).
 */

import type { LegalDocument } from './legal-content'

/** Fecha ISO de última revisión de la versión vigente de los documentos. */
export const LEGAL_LAST_UPDATED: string

/** Términos y Condiciones (idioma raíz). */
export const TERMS_DOCUMENT: LegalDocument

/** Política de Privacidad (idioma raíz). */
export const PRIVACY_DOCUMENT: LegalDocument

/** Aviso de afiliación (idioma raíz). */
export const AFFILIATE_DOCUMENT: LegalDocument
