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
 *
 * ⚠️ EXCEPCIÓN documentada: `nav_links` NO se reemplaza, se FUSIONA por `href`.
 * POR QUÉ: el menú es ESTRUCTURA (una sola fuente de verdad: la base). Si el
 * array traducido reemplazara al base, cualquier enlace añadido después al menú
 * desaparecería en los demás idiomas hasta re-traducir (bug real: la entrada
 * "Guías" solo se veía en español). Con la fusión, la estructura siempre sale
 * de la base y el idioma solo aporta su ETIQUETA traducida.
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

/** Clave de objeto que representa un índice de array serializado ("0", "1"...). */
const ARRAY_INDEX_KEY = /^\d+$/

/**
 * Normaliza un valor `nav_links` a un array SIEMPRE válido de enlaces.
 * ------------------------------------------------------------------
 * POR QUÉ: el editor del panel llegó a guardar el menú como OBJETO
 * (`{ "0": {...}, "1": {...}, "nav_links": [...] }`) por un bug histórico. Este
 * normalizador sanea esa forma corrupta (índices numéricos + clave anidada) para
 * que la tienda nunca se quede sin menú ni muestre enlaces rotos.
 * @param {unknown} value Valor crudo (array, objeto corrupto o null).
 * @returns {{ href: string, label: string, highlight?: boolean }[]} Enlaces válidos.
 */
export function normalizeNavLinks(value) {
  /** Añade un candidato solo si trae etiqueta y destino usables. */
  const push = (links, candidate) => {
    if (!isPlainObject(candidate)) return
    const href = typeof candidate.href === 'string' ? candidate.href.trim() : ''
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : ''
    if (!href || !label) return
    links.push(candidate.highlight ? { href, label, highlight: true } : { href, label })
  }

  const links = []
  if (Array.isArray(value)) {
    for (const candidate of value) push(links, candidate)
    return links
  }
  if (isPlainObject(value)) {
    // Forma corrupta conocida: primero los índices numéricos (orden original) y
    // después la clave anidada `nav_links` (los enlaces añadidos al final).
    for (const key of Object.keys(value).filter((k) => ARRAY_INDEX_KEY.test(k)).sort((a, b) => Number(a) - Number(b))) {
      push(links, value[key])
    }
    if (Array.isArray(value.nav_links)) for (const candidate of value.nav_links) push(links, candidate)
  }
  return links
}

/**
 * Fusiona el menú base con las etiquetas traducidas del idioma, por `href`.
 * ------------------------------------------------------------------
 * La ESTRUCTURA y el ORDEN salen siempre de la base; el override solo aporta la
 * etiqueta (y el destacado) de los enlaces que existen en ambos. Los enlaces del
 * override que ya no estén en la base se IGNORAN a propósito: así una traducción
 * vieja no reintroduce rutas muertas (ej: anclas heredadas de una web anterior).
 * @param {unknown} base Menú del idioma raíz (estructura de referencia).
 * @param {unknown} override Menú traducido del idioma pedido.
 * @returns {{ href: string, label: string, highlight?: boolean }[]} Menú resuelto.
 */
export function mergeNavLinks(base, override) {
  const baseLinks = normalizeNavLinks(base)
  const overrideLinks = normalizeNavLinks(override)
  // Sin base utilizable, el override es la única fuente disponible.
  if (baseLinks.length === 0) return overrideLinks
  if (overrideLinks.length === 0) return baseLinks

  const byHref = new Map(overrideLinks.map((link) => [link.href, link]))
  return baseLinks.map((link) => {
    const translated = byHref.get(link.href)
    const label = translated?.label || link.label
    const highlight = link.highlight ?? translated?.highlight
    return highlight ? { href: link.href, label, highlight: true } : { href: link.href, label }
  })
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
    if (!(key in override)) continue
    // `nav_links` es la única clave ESTRUCTURAL: se fusiona por href (ver cabecera).
    resolved[key] =
      key === 'nav_links'
        ? mergeNavLinks(settings.nav_links, override.nav_links)
        : deepMergeSettings(settings[key], override[key])
  }
  return resolved
}
