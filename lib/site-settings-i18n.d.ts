/**
 * Declaración de tipos para lib/site-settings-i18n.mjs.
 * Resolución de los textos configurables multilenguaje (site_settings.i18n).
 */

/** Campos de site_settings traducibles. */
export const TRANSLATABLE_SETTINGS_KEYS: readonly string[]

/** Enlace del menú de navegación ya normalizado. */
export type NavLink = { href: string; label: string; highlight?: boolean }

/** Normaliza `nav_links` (array, objeto corrupto o null) a un array válido. */
export function normalizeNavLinks(value: unknown): NavLink[]

/** Fusiona el menú base con las etiquetas traducidas del idioma (por href). */
export function mergeNavLinks(base: unknown, override: unknown): NavLink[]

/** Fusión profunda base ← override (objetos se combinan; arrays reemplazan). */
export function deepMergeSettings(base: unknown, override: unknown): unknown

/** Aplica los overrides del idioma sobre la configuración base. */
export function resolveSiteSettings<T extends Record<string, any>>(
  settings: T,
  locale: string | null | undefined,
): T
