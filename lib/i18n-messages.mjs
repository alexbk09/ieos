/**
 * Núcleo de mensajes de interfaz (i18n) — lógica pura.
 * ------------------------------------------------------------------
 * Formato .mjs (mismo patrón que i18n-config/i18n-translate) para poder usarse
 * en componentes, en el servidor y en los tests de Node sin compilar TS.
 *
 * Agrega los diccionarios por idioma y expone un traductor con CADENA DE
 * FALLBACK: idioma pedido → idioma por defecto → idioma raíz → la propia clave.
 * Así una etiqueta sin traducir nunca deja la UI vacía.
 */

import { DEFAULT_LOCALE, SOURCE_LOCALE, SUPPORTED_LOCALES, baseLanguage } from './i18n-config.mjs'
import es from './i18n/messages/es.mjs'
import en from './i18n/messages/en.mjs'
import fr from './i18n/messages/fr.mjs'
import de from './i18n/messages/de.mjs'
import it from './i18n/messages/it.mjs'
import pt from './i18n/messages/pt.mjs'

/** Diccionarios de interfaz por idioma: { es: { clave: texto }, ... }. */
export const MESSAGES = { es, en, fr, de, it, pt }

/** Idiomas que tienen diccionario propio. */
export const MESSAGE_LOCALES = SUPPORTED_LOCALES.filter((locale) => Boolean(MESSAGES[locale]))

/**
 * Reemplaza los marcadores `{variable}` de una plantilla por sus valores.
 * @param {string} template Texto con marcadores.
 * @param {Record<string, unknown>} vars Valores a inyectar.
 * @returns {string} Texto interpolado (los marcadores sin valor se conservan).
 */
function interpolate(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, name) =>
    vars && vars[name] != null ? String(vars[name]) : match,
  )
}

/**
 * Traduce una clave con cadena de fallback y sustitución de variables.
 * @param {Record<string, Record<string, string>>} messages Diccionarios.
 * @param {string} locale Idioma pedido (acepta variantes regionales).
 * @param {string} key Clave del mensaje.
 * @param {Record<string, unknown>} [vars] Variables de interpolación.
 * @returns {string} Texto traducido (o la propia clave si no existe en ninguno).
 */
export function translate(messages, locale, key, vars = {}) {
  const chain = [baseLanguage(locale), DEFAULT_LOCALE, SOURCE_LOCALE]
  for (const candidate of chain) {
    const value = messages?.[candidate]?.[key]
    if (typeof value === 'string' && value) return interpolate(value, vars)
  }
  return key
}

/**
 * Crea una función traductora ligada a unos diccionarios y un idioma.
 * @param {Record<string, Record<string, string>>} messages Diccionarios.
 * @param {string} locale Idioma.
 * @returns {(key: string, vars?: Record<string, unknown>) => string}
 */
export function createTranslator(messages, locale) {
  return (key, vars) => translate(messages, locale, key, vars)
}
