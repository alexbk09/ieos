/**
 * Lógica pura de generación de slugs (URL amigables para SEO).
 * ------------------------------------------------------------------
 * Formato .mjs para que Node lo ejecute directamente en tests
 * (mismo patrón que price-calculator.mjs / seo-rules.mjs) Y para que los
 * scripts .mjs (ej: scripts/backfill-category-i18n.mjs) lo importen sin
 * necesidad de compilar TypeScript.
 *
 * Es la fuente ÚNICA del slugify: services/catalog.ts lo re-exporta para
 * no duplicar la regla (nombre auto-documentado, sin "magic numbers").
 */

/** Prefijo del slug de respaldo cuando el texto no produce ningún carácter válido. */
const FALLBACK_PREFIX = 'item'

/**
 * Convierte un texto en un slug: minúsculas, sin acentos ni signos, con guiones.
 * Si el texto no produce caracteres válidos, devuelve `${fallbackPrefix}-${stamp}`
 * para no generar NUNCA un slug vacío (evita colisiones de ruta).
 * @param {string} text Texto de entrada (nombre de categoría o producto).
 * @param {{ fallbackPrefix?: string, stamp?: number }} [options]
 * @returns {string} Slug listo para la URL.
 */
export function slugify(text, options = {}) {
  const fallbackPrefix = options.fallbackPrefix ?? FALLBACK_PREFIX
  const stamp = options.stamp ?? Date.now()
  const base = String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `${fallbackPrefix}-${stamp}`
}
