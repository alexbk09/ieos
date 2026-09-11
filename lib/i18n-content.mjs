/**
 * Lógica pura de resolución de contenido traducido (columnas *_i18n JSONB).
 * ------------------------------------------------------------------
 * Formato .mjs para que Node lo ejecute directamente en tests y para que los
 * scripts .mjs lo reutilicen (mismo patrón que seo-rules.mjs).
 *
 * Modelo de datos (migración 0049):
 *   categories.name_i18n = { "en": "Gaming Mice", "es": "Ratones Gamer" }
 *
 * El español es el idioma RAIZ (idioma en el que el pipeline redacta el
 * contenido base) y la cadena de fallback lo respeta:
 * locale pedido → idioma por defecto → raiz.
 *
 * Los valores de configuración (locales, idioma raíz/por defecto) se inyectan
 * por parámetro para no quemar "magic numbers": la fuente es lib/constants.ts.
 */

import { baseLanguage } from './i18n-config.mjs'
import { slugify } from './slug.mjs'

/**
 * Construye el mapa de traducciones a partir de un campo JSONB y valida la forma.
 * @param {unknown} i18n Valor crudo (JSONB) del campo *_i18n.
 * @returns {Record<string, any>} Objeto plano (o {} si la forma no es válida).
 */
function toLocaleMap(i18n) {
  return i18n && typeof i18n === 'object' && !Array.isArray(i18n) ? i18n : {}
}

/**
 * Resuelve un texto traducido con cadena de fallback.
 * Orden: locale pedido → defaultLocale → sourceLocale → primer valor no vacío.
 * @param {Record<string, string>|null|undefined} i18n Mapa { locale: texto }.
 * @param {string} locale Locale solicitado (ej: "fr-FR").
 * @param {{ sourceLocale?: string, defaultLocale?: string }} [options]
 * @returns {string} Texto traducido ('' si no hay ninguno).
 */
export function resolveLocalizedValue(i18n, locale, options = {}) {
  const sourceLocale = options.sourceLocale ?? 'es'
  const defaultLocale = options.defaultLocale ?? ''
  const map = toLocaleMap(i18n)

  for (const candidate of [locale, defaultLocale, sourceLocale]) {
    const value = map[baseLanguage(candidate)]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  const first = Object.values(map).find((value) => typeof value === 'string' && value.trim())
  return first ? String(first).trim() : ''
}

/**
 * Resuelve una lista traducida (ej: seo_faq_i18n) con la misma cadena de fallback.
 * @template T
 * @param {Record<string, T[]>|null|undefined} i18n Mapa { locale: lista }.
 * @param {string} locale Locale solicitado.
 * @param {{ sourceLocale?: string, defaultLocale?: string }} [options]
 * @returns {T[]} Lista traducida ([] si no hay ninguna).
 */
export function resolveLocalizedList(i18n, locale, options = {}) {
  const sourceLocale = options.sourceLocale ?? 'es'
  const defaultLocale = options.defaultLocale ?? ''
  const map = toLocaleMap(i18n)

  for (const candidate of [locale, defaultLocale, sourceLocale]) {
    const value = map[baseLanguage(candidate)]
    if (Array.isArray(value) && value.length > 0) return value
  }

  const first = Object.values(map).find((value) => Array.isArray(value) && value.length > 0)
  return Array.isArray(first) ? first : []
}

/**
 * Resuelve los campos traducibles de un producto (migración 0050).
 * ------------------------------------------------------------------
 * A diferencia de las categorías, el mapa `products.translations` NO guarda el
 * idioma raíz: solo los idiomas traducidos. Por eso aquí se INYECTA el dato
 * base (`name`/`titulo_seo`/`description`/`seo_faq`) como idioma raíz ANTES de
 * resolver, garantizando que el fallback nunca caiga en otro idioma (p. ej. que
 * /en no muestre español).
 * @param {Record<string, { name?: string, titulo_seo?: string, description?: string, seo_faq?: {pregunta:string,respuesta:string}[] }>|null|undefined} translations Mapa por locale.
 * @param {{ name?: string|null, titulo_seo?: string|null, description?: string|null, seo_faq?: {pregunta:string,respuesta:string}[]|null }} base Datos base (idioma raíz).
 * @param {string} locale Locale solicitado.
 * @param {{ sourceLocale?: string, defaultLocale?: string }} [options]
 * @returns {{ name: string, titulo_seo: string, description: string, seo_faq: {pregunta:string,respuesta:string}[] }} Textos resueltos ('' / [] si no hay).
 */
export function resolveProductTranslations(translations, base, locale, options = {}) {
  const sourceLocale = options.sourceLocale ?? 'es'
  const defaultLocale = options.defaultLocale ?? ''
  const map = toLocaleMap(translations)

  /** Mapas planos { locale: valor } extraídos del JSONB de traducciones. */
  const nameMap = {}
  const seoMap = {}
  const descMap = {}
  const faqMap = {}
  for (const [loc, entry] of Object.entries(map)) {
    if (!entry || typeof entry !== 'object') continue
    if (typeof entry.name === 'string') nameMap[loc] = entry.name
    if (typeof entry.titulo_seo === 'string') seoMap[loc] = entry.titulo_seo
    if (typeof entry.description === 'string') descMap[loc] = entry.description
    if (Array.isArray(entry.seo_faq) && entry.seo_faq.length > 0) faqMap[loc] = entry.seo_faq
  }

  // El dato base SIEMPRE está disponible en el idioma raíz.
  if (base?.name) nameMap[sourceLocale] = base.name
  if (base?.titulo_seo) seoMap[sourceLocale] = base.titulo_seo
  if (base?.description) descMap[sourceLocale] = base.description
  if (Array.isArray(base?.seo_faq) && base.seo_faq.length > 0) faqMap[sourceLocale] = base.seo_faq

  const resolveOptions = { sourceLocale, defaultLocale }
  return {
    name: resolveLocalizedValue(nameMap, locale, resolveOptions),
    titulo_seo: resolveLocalizedValue(seoMap, locale, resolveOptions),
    description: resolveLocalizedValue(descMap, locale, resolveOptions),
    seo_faq: resolveLocalizedList(faqMap, locale, resolveOptions),
  }
}

/**
 * Genera el slug localizado a partir del nombre traducido del idioma pedido.
 * Así la URL de un nicho en francés es /fr/categorie/claviers-mecaniques.
 * @param {Record<string, string>|null|undefined} namesI18n Mapa { locale: nombre }.
 * @param {string} locale Locale solicitado.
 * @param {{ sourceLocale?: string, defaultLocale?: string, fallbackPrefix?: string, stamp?: number }} [options]
 * @returns {string} Slug localizado ('' si no hay nombre resoluble).
 */
export function buildLocalizedSlug(namesI18n, locale, options = {}) {
  const name = resolveLocalizedValue(namesI18n, locale, options)
  if (!name) return ''
  return slugify(name, { fallbackPrefix: options.fallbackPrefix, stamp: options.stamp })
}
