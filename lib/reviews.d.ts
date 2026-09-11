/**
 * Declaración de tipos para lib/reviews.mjs.
 * Lógica pura de valoraciones y reseñas (ver lib/reviews.mjs).
 */

/** Valoración normalizada: porcentaje (0-100) y escala de estrellas (0-5). */
export type ValoracionNormalizada = {
  porcentaje: number
  escala05: number
}

/** Reseña limpia lista para persistir en products.reviews (JSONB). */
export type ResenaNormalizada = {
  autor: string | null
  valoracion: number | null
  texto: string
  fecha: string | null
}

/** Topes de saneamiento de reseñas (fuente: lib/constants.ts). */
export type OpcionesResenas = {
  maxStored: number
  minTextLength: number
  maxTextLength: number
}

/** Normaliza una valoración cruda ("97.6%", "4.8", "4,8"…) a porcentaje y escala 0-5. */
export function parsearValoracion(valor: unknown): ValoracionNormalizada | null

/** Limpia y recorta el texto de una reseña. */
export function limpiarTextoResena(valor: unknown, maxLength: number): string

/** Sanea y limita una lista cruda de reseñas. */
export function normalizarResenas(lista: unknown, opciones: OpcionesResenas): ResenaNormalizada[]
