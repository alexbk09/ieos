/**
 * Lógica pura de configuración de idiomas (i18n) — FUENTE ÚNICA de locales.
 * ------------------------------------------------------------------
 * Formato .mjs (mismo patrón que seo-rules.mjs / slug.mjs) por dos razones:
 *  1. Los tests de Node la ejecutan directo (`node --test tests/*.test.mjs`).
 *  2. Los scripts .mjs (backfills) la importan sin compilar TypeScript.
 *
 * lib/constants.ts re-expone estos valores para que el resto de la app tenga
 * un único punto de configuración (regla de oro: cero valores quemados).
 *
 * Contiene SOLO funciones deterministas:
 *  - Identidad de locale (es-ES → es).
 *  - Negociación por Accept-Language / cookie.
 *  - Construcción de rutas localizadas.
 *  - Mapa de alternates.languages (hreflang + x-default) para Google.
 */

/**
 * Idiomas soportados por la tienda.
 * ⚠️ El PRIMERO debe coincidir con DEFAULT_LOCALE: es el idioma por defecto y
 * el destino de x-default en hreflang.
 */
export const SUPPORTED_LOCALES = ['es', 'en', 'fr', 'de', 'it', 'pt']

/** Idioma por defecto del sitio (UI + x-default de hreflang). */
export const DEFAULT_LOCALE = 'es'

/**
 * Idioma RAIZ o "puente" de los DATOS.
 * ------------------------------------------------------------------
 * Es el idioma en el que el pipeline REDACTA el contenido base antes de
 * traducirlo: `services/seo-content.ts` (título/descripción de producto),
 * `services/seo-hub.ts` (hubs de categoría) y `ALI_LOCALE=es_ES` escriben en
 * ESPAÑOL. Por eso el idioma raíz COINCIDE con el idioma por defecto.
 *
 * El raíz NUNCA se traduce a sí mismo: se hereda del dato base (`name`/`slug`/
 * `description`) y el resto de locales se traducen DESDE él (TARGET_LOCALES).
 * Cambiar este valor exige realinear el contenido y re-ejecutar el backfill
 * (`npm run i18n:backfill -- --force`), porque las columnas *_i18n ya escritas
 * quedarían etiquetadas con el idioma equivocado.
 */
export const SOURCE_LOCALE = 'es'

/** Etiqueta hreflang de la versión por defecto (para locales sin traducción). */
export const HREFLANG_X_DEFAULT = 'x-default'

/**
 * Nombre en INGLÉS de cada idioma, para instruir al LLM ("responde en X").
 * Se usa en el prompt del asistente IA para que conteste en el idioma activo.
 */
export const LOCALE_LLM_NAMES = {
  es: 'Spanish',
  en: 'English',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
}

/**
 * Devuelve el nombre en inglés del idioma (para prompts del LLM).
 * @param {string|null|undefined} code Código de idioma (acepta variantes "fr-CA").
 * @returns {string} Nombre del idioma (por defecto, el del idioma por defecto).
 */
export function localeLlmName(code) {
  const base = baseLanguage(code)
  return LOCALE_LLM_NAMES[base] ?? LOCALE_LLM_NAMES[DEFAULT_LOCALE]
}

/**
 * Nombre NATIVO de cada idioma (escrito en ese mismo idioma).
 * ------------------------------------------------------------------
 * POR QUÉ existe: cuando el prompt del LLM está redactado en el idioma raíz
 * (ej: "traduce el nombre de la categoría al ...") hay que nombrar el idioma
 * destino en su propia lengua; `LOCALE_LLM_NAMES` está en inglés porque
 * aquel prompt se escribe en inglés. Sin esto habría que quemar el literal
 * "español" dentro del prompt (regla de oro: cero strings mágicos).
 */
export const LOCALE_NATIVE_NAMES = {
  es: 'español',
  en: 'inglés',
  fr: 'francés',
  de: 'alemán',
  it: 'italiano',
  pt: 'portugués',
}

/**
 * Devuelve el nombre nativo del idioma (para prompts redactados en ese idioma).
 * @param {string|null|undefined} code Código de idioma (acepta variantes "es-VE").
 * @returns {string} Nombre nativo (por defecto, el del idioma por defecto).
 */
export function localeNativeName(code) {
  const base = baseLanguage(code)
  return LOCALE_NATIVE_NAMES[base] ?? LOCALE_NATIVE_NAMES[DEFAULT_LOCALE]
}

/**
 * Idiomas PUBLICADOS ("live"): solo estos generan rutas, hreflang y entradas de
 * sitemap. Es un subconjunto de SUPPORTED_LOCALES y DEBE incluir DEFAULT_LOCALE.
 * ------------------------------------------------------------------
 * POR QUÉ existe (y no usamos SUPPORTED_LOCALES directo):
 *   Traducir el CONTENIDO y traducir la INTERFAZ son dos hitos distintos.
 *   Publicar un idioma a medias (con la UI aún en el idioma por defecto)
 *   produciría páginas casi duplicadas y Google podría clasificarlas como
 *   "doorway pages" (penalizable). Con esta lista se publica un idioma SOLO
 *   cuando su contenido y su interfaz están listos: basta agregarlo aquí y
 *   rutas, hreflang y sitemap se adaptan automáticamente.
 */
export const PUBLISHED_LOCALES = ['es','en']

/**
 * Reduce un código de idioma a su parte base ("es-ES" → "es").
 * @param {string|null|undefined} code Código de idioma crudo.
 * @returns {string} Idioma base en minúsculas ('' si viene vacío).
 */
export function baseLanguage(code) {
  return String(code ?? '').trim().toLowerCase().split('-')[0]
}

/**
 * Indica si un idioma (o variante regional) está soportado.
 * @param {string|null|undefined} value Valor a comprobar.
 * @param {readonly string[]} [locales] Locales soportados.
 * @returns {boolean}
 */
export function isSupportedLocale(value, locales = SUPPORTED_LOCALES) {
  const base = baseLanguage(value)
  return Boolean(base) && locales.includes(base)
}

/**
 * Normaliza un idioma a uno soportado; si no lo está, devuelve el por defecto.
 * @param {string|null|undefined} value Valor crudo.
 * @param {{ locales?: readonly string[], defaultLocale?: string }} [options]
 * @returns {string} Locale soportado.
 */
export function normalizeLocale(value, options = {}) {
  const locales = options.locales ?? SUPPORTED_LOCALES
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE
  const base = baseLanguage(value)
  return locales.includes(base) ? base : defaultLocale
}

/**
 * Parsea una cabecera Accept-Language ordenada por calidad (q) descendente.
 * Se descartan las entradas q=0 (idioma explícitamente no aceptado) y "*".
 * Deduplica por idioma base conservando la mayor calidad: "fr-CA,fr;q=0.9"
 * debe pesar una sola vez como "fr" (evita elegir dos veces el mismo idioma).
 * @param {string|null|undefined} header Cabecera HTTP Accept-Language.
 * @returns {{ locale: string, quality: number }[]}
 */
export function parseAcceptLanguage(header) {
  const raw = String(header ?? '')
  if (!raw.trim()) return []

  /** Mapa idioma base → mejor calidad observada. */
  const best = new Map()
  for (const part of raw.split(',')) {
    const [tag, ...params] = part.split(';')
    const locale = baseLanguage(tag)
    if (!locale || locale === '*') continue
    const qRaw = params.map((p) => p.trim()).find((p) => p.toLowerCase().startsWith('q='))
    const quality = qRaw ? Number(qRaw.slice(2)) : 1
    const safeQuality = Number.isFinite(quality) ? quality : 0
    if (safeQuality <= 0) continue
    const current = best.get(locale)
    if (!current || safeQuality > current.quality) best.set(locale, { locale, quality: safeQuality })
  }

  return [...best.values()].sort((a, b) => b.quality - a.quality)
}

/**
 * Negocia el idioma a servir.
 * Prioridad: preferencia explícita (cookie/URL) → Accept-Language → por defecto.
 * @param {{ header?: string|null, preferred?: string|null, locales?: readonly string[], defaultLocale?: string }} [options]
 * @returns {string} Locale soportado.
 */
export function negotiateLocale(options = {}) {
  const locales = options.locales ?? SUPPORTED_LOCALES
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE

  if (isSupportedLocale(options.preferred, locales)) return baseLanguage(options.preferred)

  for (const entry of parseAcceptLanguage(options.header)) {
    if (locales.includes(entry.locale)) return entry.locale
  }

  return defaultLocale
}

/**
 * Construye una ruta con prefijo de idioma.
 * @param {string} path Ruta interna (ej: "/categoria/ratones-gamer").
 * @param {string} locale Locale destino.
 * @param {{ defaultLocale?: string, prefixDefaultLocale?: boolean }} [options]
 * @returns {string} Ruta localizada (ej: "/fr/categoria/ratones-gamer").
 */
export function buildLocalizedPath(path, locale, options = {}) {
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE
  const prefixDefaultLocale = options.prefixDefaultLocale ?? true

  const clean = '/' + String(path ?? '').replace(/^\/+/, '')
  const normalizedPath = clean === '/' ? '' : clean
  const localeBase = baseLanguage(locale) || defaultLocale
  const shouldPrefix = prefixDefaultLocale || localeBase !== defaultLocale

  if (!shouldPrefix) return normalizedPath || '/'
  return `/${localeBase}${normalizedPath}`
}

/**
 * Extrae el locale del pathname si su primer segmento es un idioma soportado.
 * @param {string} pathname Ruta completa (ej: "/fr/categorie/x").
 * @param {{ locales?: readonly string[], defaultLocale?: string }} [options]
 * @returns {{ locale: string, path: string }} Locale y ruta SIN prefijo.
 */
export function localeFromPathname(pathname, options = {}) {
  const locales = options.locales ?? SUPPORTED_LOCALES
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE
  const segments = String(pathname ?? '').split('/').filter(Boolean)
  const first = segments[0]

  if (first && locales.includes(first)) {
    return { locale: first, path: '/' + segments.slice(1).join('/') }
  }
  return { locale: defaultLocale, path: '/' + segments.join('/') }
}

/**
 * Construye el mapa de alternates.languages (hreflang) para Next Metadata.
 * Incluye x-default apuntando a la versión del idioma por defecto: es la señal
 * que le dice a Google qué servir a un país cuyo idioma no cubrimos.
 * @param {{ pathsByLocale?: Record<string, string>, defaultLocale?: string, xDefault?: string }} [options]
 * @returns {Record<string, string>} Mapa { hreflang: path }.
 */
export function buildHreflangAlternates(options = {}) {
  const pathsByLocale = options.pathsByLocale ?? {}
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE
  const xDefault = options.xDefault ?? HREFLANG_X_DEFAULT

  const alternates = {}
  for (const [locale, path] of Object.entries(pathsByLocale)) {
    if (!locale || !path) continue
    alternates[baseLanguage(locale)] = path
  }

  const defaultPath = alternates[defaultLocale]
  if (defaultPath) alternates[xDefault] = defaultPath
  return alternates
}

/**
 * Indica si un idioma está publicado (por tanto, routable e indexable).
 * @param {string|null|undefined} value Valor a comprobar.
 * @param {readonly string[]} [published] Idiomas publicados.
 * @returns {boolean}
 */
export function isPublishedLocale(value, published = PUBLISHED_LOCALES) {
  const base = baseLanguage(value)
  return Boolean(base) && published.includes(base)
}

/**
 * Idiomas que deben generar rutas/hreflang/sitemap.
 * Garantiza que el idioma por defecto SIEMPRE esté presente y que no se cuele
 * ningún idioma no soportado.
 * @param {readonly string[]} [published] Idiomas publicados.
 * @param {string} [defaultLocale] Idioma por defecto.
 * @returns {string[]}
 */
export function publishedLocales(published = PUBLISHED_LOCALES, defaultLocale = DEFAULT_LOCALE) {
  const valid = []
  for (const locale of published) {
    const base = baseLanguage(locale)
    if (base && SUPPORTED_LOCALES.includes(base) && !valid.includes(base)) valid.push(base)
  }
  return valid.includes(defaultLocale) ? valid : [defaultLocale, ...valid]
}
