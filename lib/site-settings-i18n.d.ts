/**
 * Declaración de tipos para lib/site-settings-i18n.mjs.
 * Resolución de los textos configurables multilenguaje (site_settings.i18n).
 */

/** Campos de site_settings traducibles. */
export const TRANSLATABLE_SETTINGS_KEYS: readonly string[]

/** Fusión profunda base ← override (objetos se combinan; arrays reemplazan). */
export function deepMergeSettings(base: unknown, override: unknown): unknown

/** Aplica los overrides del idioma sobre la configuración base. */
export function resolveSiteSettings<T extends Record<string, any>>(
  settings: T,
  locale: string | null | undefined,
): T
