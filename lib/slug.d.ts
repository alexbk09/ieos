/**
 * Declaración de tipos para lib/slug.mjs.
 * Fuente única de la generación de slugs (ver lib/slug.mjs).
 */

/**
 * Convierte un texto en un slug (minúsculas, sin acentos ni signos, con guiones).
 * @param text Texto de entrada.
 * @param options Prefijo de respaldo y marca de tiempo inyectables (testeable).
 */
export function slugify(
  text: string,
  options?: { fallbackPrefix?: string; stamp?: number },
): string
