/**
 * Núcleo de traducción de contenido (lógica pura, compartida).
 * ------------------------------------------------------------------
 * FUENTE ÚNICA del prompt, la llamada al modelo y la fusión de traducciones.
 * Lo consumen TANTO la app (services/i18n-translate.ts) COMO los scripts
 * (scripts/backfill-category-i18n.mjs), evitando duplicar el prompt.
 *
 * Formato .mjs (mismo patrón que seo-rules.mjs / i18n-config.mjs) para que Node
 * lo ejecute en tests y en scripts sin compilar TypeScript.
 *
 * Toda la configuración del modelo (apiKey, url, temperatura, tokens) se INYECTA
 * por parámetro: cero "magic numbers" (la fuente es lib/constants.ts).
 */

import { SUPPORTED_LOCALES, SOURCE_LOCALE } from './i18n-config.mjs'
import { slugify } from './slug.mjs'

/**
 * Idiomas destino de la traducción: todos menos el idioma raíz.
 * El raíz (español: idioma en el que el pipeline redacta el contenido base)
 * NO se traduce: se hereda del dato original, así se ahorra una traducción por
 * entidad y su URL ya indexada nunca cambia.
 */
export const TARGET_LOCALES = SUPPORTED_LOCALES.filter((locale) => locale !== SOURCE_LOCALE)

/** Normaliza un campo JSONB a objeto plano (evita null/array/undefined). */
export function toLocaleMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

/** Reglas comunes de acrónimos que NO deben traducirse. */
const REGLA_ACRONIMOS = 'Mantén en MAYÚSCULAS los acrónimos técnicos (RGB, LED, USB, HDMI, WIFI, DIY, 3D).'

/**
 * Construye los mensajes del modelo para traducir una CATEGORÍA (nicho).
 * @param {{ nombre: string, descripcion?: string, locales: string[] }} input
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
export function buildCategoryMessages({ nombre, descripcion, locales }) {
  const system =
    'Eres traductor profesional de e-commerce y SEO internacional. ' +
    'Traduce el nombre y la descripción de una CATEGORÍA de tienda a los idiomas pedidos. ' +
    'REGLAS: 1) Respeta el significado comercial exacto, sin añadir ni inventar datos. ' +
    '2) ' + REGLA_ACRONIMOS + ' ' +
    '3) El nombre debe ser natural para BUSCARLO en Google en ese idioma (2-5 palabras). ' +
    '4) La descripción es una frase corta (máx. 160 caracteres) para meta description. ' +
    '5) Devuelve EXCLUSIVAMENTE JSON válido con la forma ' +
    '{"<idioma>":{"name":"","description":""}}, usando las claves de idioma exactas solicitadas. '

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        nombre_origen: nombre,
        descripcion_origen: descripcion ?? '',
        idiomas_destino: locales,
      }),
    },
  ]
}

/**
 * Construye los mensajes del modelo para traducir un PRODUCTO (ficha).
 * Solo se traducen los textos visibles de cara al cliente: el nombre comercial
 * y el título SEO. Nunca se tocan precios, stock ni URLs.
 * @param {{ nombre: string, tituloSeo?: string|null, locales: string[] }} input
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
export function buildProductMessages({ nombre, tituloSeo, locales }) {
  const system =
    'Eres traductor profesional de e-commerce y SEO internacional. ' +
    'Traduce el nombre comercial y el título SEO de un PRODUCTO a los idiomas pedidos. ' +
    'REGLAS: 1) Respeta el producto exacto, sin inventar especificaciones. ' +
    '2) ' + REGLA_ACRONIMOS + ' ' +
    '3) El nombre debe sonar natural al comprarlo en ese idioma. ' +
    '4) El título SEO es la versión optimizada para buscadores (máx. 60 caracteres). ' +
    '5) Devuelve EXCLUSIVAMENTE JSON válido con la forma ' +
    '{"<idioma>":{"name":"","titulo_seo":""}}, usando las claves de idioma exactas solicitadas. '

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        nombre_origen: nombre,
        titulo_seo_origen: tituloSeo ?? '',
        idiomas_destino: locales,
      }),
    },
  ]
}

/**
 * Parsea y valida el JSON devuelto por el modelo (quita cercas ```json).
 * @param {string} text Contenido crudo del mensaje del modelo.
 * @returns {{ success: true, data: Record<string, any> } | { success: false, error: string }}
 */
export function parseTranslationResponse(text) {
  const clean = String(text ?? '').replace(/```json|```/g, '').trim()
  if (!clean) return { success: false, error: 'El modelo devolvió una respuesta vacía.' }

  let parsed
  try {
    parsed = JSON.parse(clean)
  } catch {
    return { success: false, error: 'El modelo no devolvió JSON válido.' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { success: false, error: 'El JSON del modelo no es un objeto de idiomas.' }
  }
  return { success: true, data: parsed }
}

/**
 * Ejecuta la llamada al modelo de traducción (API compatible con OpenAI).
 * La configuración se inyecta para no quemar valores en el módulo.
 * @param {{ apiKey: string, apiUrl: string, model: string, temperature: number, maxTokens: number, messages: { role: string, content: string }[] }} input
 * @returns {Promise<{ success: true, text: string } | { success: false, error: string }>}
 */
export async function requestTranslation({ apiKey, apiUrl, model, temperature, maxTokens, messages }) {
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    })
    if (!res.ok) return { success: false, error: 'El motor de traducción respondió HTTP ' + res.status }

    const body = await res.json()
    const text = String(body?.choices?.[0]?.message?.content ?? '').trim()
    if (!text) return { success: false, error: 'El motor de traducción devolvió una respuesta vacía.' }
    return { success: true, text }
  } catch (err) {
    return { success: false, error: err?.message ?? 'Error llamando al motor de traducción.' }
  }
}

/**
 * Fusiona la traducción nueva con el estado actual de una categoría.
 * El idioma raíz SIEMPRE se rellena con el dato base (`name`/`slug`), de modo
 * que la URL ya indexada nunca cambia. Los slugs se generan en local.
 * @param {any} row Fila actual de `categories`.
 * @param {Record<string, { name?: string, description?: string }>} traduccion Salida del modelo.
 * @returns {{ name_i18n: Record<string,string>, slug_i18n: Record<string,string>, description_i18n: Record<string,string> }}
 */
export function mergeCategoryTranslations(row, traduccion) {
  const nameI18n = { ...toLocaleMap(row?.name_i18n) }
  const slugI18n = { ...toLocaleMap(row?.slug_i18n) }
  const descriptionI18n = { ...toLocaleMap(row?.description_i18n) }

  // Idioma raíz: se hereda del dato base (nunca se traduce ni se re-slugifica).
  if (row?.name) nameI18n[SOURCE_LOCALE] = row.name
  if (row?.slug) slugI18n[SOURCE_LOCALE] = row.slug

  for (const locale of TARGET_LOCALES) {
    const entry = traduccion?.[locale]
    const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
    if (!name) continue
    nameI18n[locale] = name
    const slug = slugify(name)
    if (slug) slugI18n[locale] = slug
    const description = typeof entry?.description === 'string' ? entry.description.trim() : ''
    if (description) descriptionI18n[locale] = description
  }

  return { name_i18n: nameI18n, slug_i18n: slugI18n, description_i18n: descriptionI18n }
}

/**
 * Fusiona la traducción nueva con el estado actual de un producto.
 * Guarda solo textos de cara al cliente: nombre comercial y título SEO.
 * @param {Record<string, any>} translationsActuales Valor actual de `products.translations`.
 * @param {Record<string, { name?: string, titulo_seo?: string }>} traduccion Salida del modelo.
 * @returns {Record<string, { name?: string, titulo_seo?: string }>}
 */
export function mergeProductTranslations(translationsActuales, traduccion) {
  const translations = { ...toLocaleMap(translationsActuales) }

  for (const locale of TARGET_LOCALES) {
    const entry = traduccion?.[locale]
    if (!entry) continue
    const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
    const tituloSeo = typeof entry?.titulo_seo === 'string' ? entry.titulo_seo.trim() : ''
    if (!name && !tituloSeo) continue
    translations[locale] = {
      ...toLocaleMap(translations[locale]),
      ...(name ? { name } : {}),
      ...(tituloSeo ? { titulo_seo: tituloSeo } : {}),
    }
  }

  return translations
}
