/**
 * Resolución de los textos CONFIGURABLES multilenguaje (site_settings.i18n).
 * ------------------------------------------------------------------
 * Formato .mjs (mismo patrón que i18n-content/i18n-config) para que los tests de
 * Node y los scripts de backfill lo reutilicen sin compilar TypeScript.
 *
 * Los textos configurables viven en la base (idioma raíz) y sus overrides por
 * idioma en `site_settings.i18n[locale]`. Esta lógica aplica el override sobre la
 * base con una fusión PROFUNDA: los objetos se combinan clave a clave y los
 * arrays/escalares del override reemplazan al base (evita mezclar idiomas).
 */

import { baseLanguage } from './i18n-config.mjs'

/**
 * Campos de site_settings susceptibles de traducción (strings o estructuras con
 * texto). Los no listados (urls, tema, mapas, redes) nunca se traducen.
 */
export const TRANSLATABLE_SETTINGS_KEYS = [
  'company_name',
  'tagline',
  'nav_links',
  'hero_texts',
  'studio_texts',
  'contact_texts',
  'footer_texts',
  'homepage_config',
]

/** ¿Es un objeto plano (no array ni null)? */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Fusión profunda de la configuración base con el override del idioma.
 * - Objetos: se combinan recursivamente (solo se sobrescriben las claves traducidas).
 * - Arrays y escalares: el override REEMPLAZA al base.
 * @param {unknown} base Valor base (idioma raíz).
 * @param {unknown} override Valor del idioma (undefined/null = sin cambio).
 * @returns {unknown} Valor resuelto.
 */
export function deepMergeSettings(base, override) {
  if (override === undefined || override === null) return base
  if (Array.isArray(override)) return override
  if (isPlainObject(override) && isPlainObject(base)) {
    const merged = { ...base }
    for (const [key, value] of Object.entries(override)) {
      merged[key] = deepMergeSettings(base[key], value)
    }
    return merged
  }
  return override
}

/**
 * Aplica los overrides del idioma sobre la configuración base.
 * @param {{ i18n?: Record<string, any> | null } & Record<string, any>} settings Config base (idioma raíz).
 * @param {string|null|undefined} locale Idioma pedido (acepta variantes "fr-CA").
 * @returns {Record<string, any>} Configuración con los textos del idioma (o la base si no hay overrides).
 */
export function resolveSiteSettings(settings, locale) {
  if (!settings) return settings
  const map = isPlainObject(settings.i18n) ? settings.i18n : {}
  const base = baseLanguage(locale)
  const override = base ? map[base] : null
  if (!isPlainObject(override)) return settings

  const resolved = { ...settings }
  for (const key of TRANSLATABLE_SETTINGS_KEYS) {
    if (key in override) resolved[key] = deepMergeSettings(settings[key], override[key])
  }
  return resolved
}
