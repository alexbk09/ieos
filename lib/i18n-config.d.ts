/**
 * Declaración de tipos para lib/i18n-config.mjs.
 * Fuente única de la configuración de idiomas (locales, negociación y hreflang).
 */

/** Idiomas soportados por la tienda (el primero es DEFAULT_LOCALE). */
export const SUPPORTED_LOCALES: readonly string[]

/** Idioma por defecto del sitio (UI + x-default de hreflang). */
export const DEFAULT_LOCALE: string

/**
 * Idioma raíz/puente de los datos: idioma en el que el pipeline redacta el
 * contenido base (coincide con DEFAULT_LOCALE en esta instalación). Nunca se
 * traduce a sí mismo; el resto de locales se traducen DESDE él.
 */
export const SOURCE_LOCALE: string

/** Etiqueta hreflang de la versión por defecto. */
export const HREFLANG_X_DEFAULT: string

/**
 * Idiomas PUBLICADOS (live): solo estos generan rutas, hreflang y sitemap.
 * Subconjunto de SUPPORTED_LOCALES; debe incluir DEFAULT_LOCALE.
 */
export const PUBLISHED_LOCALES: readonly string[]

/** Reduce "es-ES" → "es". */
export function baseLanguage(code: string | null | undefined): string

/** Indica si el idioma (o su variante regional) está soportado. */
export function isSupportedLocale(
  value: string | null | undefined,
  locales?: readonly string[],
): boolean

/** Normaliza un idioma a uno soportado (o al por defecto). */
export function normalizeLocale(
  value: string | null | undefined,
  options?: { locales?: readonly string[]; defaultLocale?: string },
): string

/** Parsea Accept-Language ordenado por calidad descendente (descarta q=0 y "*"). */
export function parseAcceptLanguage(
  header: string | null | undefined,
): { locale: string; quality: number }[]

/** Negocia el idioma: preferencia explícita → Accept-Language → por defecto. */
export function negotiateLocale(options?: {
  header?: string | null
  preferred?: string | null
  locales?: readonly string[]
  defaultLocale?: string
}): string

/** Construye una ruta con prefijo de idioma. */
export function buildLocalizedPath(
  path: string,
  locale: string,
  options?: { defaultLocale?: string; prefixDefaultLocale?: boolean },
): string

/** Extrae el locale del pathname y devuelve la ruta sin prefijo. */
export function localeFromPathname(
  pathname: string,
  options?: { locales?: readonly string[]; defaultLocale?: string },
): { locale: string; path: string }

/** Construye el mapa de alternates.languages (hreflang + x-default). */
export function buildHreflangAlternates(options?: {
  pathsByLocale?: Record<string, string>
  defaultLocale?: string
  xDefault?: string
}): Record<string, string>

/** Indica si un idioma está publicado (routable e indexable). */
export function isPublishedLocale(
  value: string | null | undefined,
  published?: readonly string[],
): boolean

/** Idiomas que deben generar rutas/hreflang/sitemap (incluye siempre el default). */
export function publishedLocales(
  published?: readonly string[],
  defaultLocale?: string,
): string[]
