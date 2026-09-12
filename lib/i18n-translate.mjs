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

/**
 * Normaliza una lista de FAQ al formato { pregunta, respuesta } con AMBOS textos
 * no vacíos; tolera null/valores inválidos (devuelve []).
 * Se usa tanto para el payload que recibe el modelo como para lo que devuelve,
 * de modo que nunca se persiste una entrada a medias en el JSONB.
 * @param {unknown} value Valor crudo (FAQ base o salida del modelo).
 * @returns {{ pregunta: string, respuesta: string }[]}
 */
export function normalizeFaqList(value) {
  if (!Array.isArray(value)) return []
  const items = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const pregunta = typeof entry.pregunta === 'string' ? entry.pregunta.trim() : ''
    const respuesta = typeof entry.respuesta === 'string' ? entry.respuesta.trim() : ''
    if (!pregunta || !respuesta) continue
    items.push({ pregunta, respuesta })
  }
  return items
}

/**
 * Idiomas destino que faltan por traducir en un PRODUCTO.
 * Exige el nombre y, si el producto tiene descripción base, su versión traducida.
 * Es la fuente ÚNICA de detección: la usan el backfill y el panel admin.
 * @param {any} row Fila de `products` (con `translations` y `description`).
 * @param {boolean} [force] TRUE = considera pendientes TODOS los idiomas destino.
 * @returns {string[]} Locales destino pendientes.
 */
export function missingProductLocales(row, force = false) {
  const translations = toLocaleMap(row?.translations)
  const tieneDescripcion = Boolean(row?.description)
  return TARGET_LOCALES.filter((locale) => {
    if (force) return true
    const entry = toLocaleMap(translations[locale])
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (!name) return true
    const description = typeof entry.description === 'string' ? entry.description.trim() : ''
    return tieneDescripcion && !description
  })
}

/**
 * Idiomas destino que faltan por traducir en una CATEGORÍA.
 * Exige nombre + slug y, si el idioma raíz tiene contenido editorial (seo_*), su
 * traducción correspondiente (así no quedan pendientes perpetuos).
 * @param {any} row Fila de `categories`.
 * @param {boolean} [force] TRUE = considera pendientes TODOS los idiomas destino.
 * @returns {string[]} Locales destino pendientes.
 */
export function missingCategoryLocales(row, force = false) {
  const names = toLocaleMap(row?.name_i18n)
  const slugs = toLocaleMap(row?.slug_i18n)
  const seoTitles = toLocaleMap(row?.seo_title_i18n)
  const seoIntros = toLocaleMap(row?.seo_intro_i18n)
  const seoFaqs = toLocaleMap(row?.seo_faq_i18n)
  const tieneSeoTitle = Boolean(row?.seo_title)
  const tieneSeoIntro = Boolean(row?.seo_intro)
  const tieneSeoFaq = Array.isArray(row?.seo_faq) && row.seo_faq.length > 0

  return TARGET_LOCALES.filter((locale) => {
    if (force) return true
    const name = typeof names[locale] === 'string' ? names[locale].trim() : ''
    const slug = typeof slugs[locale] === 'string' ? slugs[locale].trim() : ''
    if (!name || !slug) return true
    if (tieneSeoTitle && !seoTitles[locale]) return true
    if (tieneSeoIntro && !seoIntros[locale]) return true
    if (tieneSeoFaq && !seoFaqs[locale]) return true
    return false
  })
}

/** Reglas comunes de acrónimos que NO deben traducirse. */
const REGLA_ACRONIMOS = 'Mantén en MAYÚSCULAS los acrónimos técnicos (RGB, LED, USB, HDMI, WIFI, DIY, 3D).'

/**
 * Construye los mensajes del modelo para traducir una CATEGORÍA (nicho).
 * Traduce TODO el contenido visible/SEO del hub: nombre, descripción corta y el
 * contenido editorial (seo_title, seo_intro y la FAQ estructurada). Así la
 * landing del idioma deja de mostrar texto del idioma raíz (evita páginas
 * híbridas que Google puede leer como casi-duplicadas).
 * @param {{ nombre: string, descripcion?: string, seoTitle?: string|null, seoIntro?: string|null, seoFaq?: {pregunta:string,respuesta:string}[]|null, locales: string[] }} input
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
export function buildCategoryMessages({ nombre, descripcion, seoTitle, seoIntro, seoFaq, locales }) {
  const system =
    'Eres traductor profesional de e-commerce y SEO internacional. ' +
    'Traduce el contenido de una CATEGORÍA de tienda a los idiomas pedidos. ' +
    'REGLAS: 1) Respeta el significado comercial exacto, sin añadir ni inventar datos. ' +
    '2) ' + REGLA_ACRONIMOS + ' ' +
    '3) "name": nombre natural para BUSCARLO en Google en ese idioma (2-5 palabras). ' +
    '4) "description": frase corta (máx. 160 caracteres) para meta description. ' +
    '5) "seo_title": título H1 atractivo con intención de compra, de longitud similar al origen. ' +
    '6) "seo_intro": conserva EXACTAMENTE las mismas etiquetas HTML (<h2>,<h3>,<p>,<ul>,<li>) y traduce solo el texto visible. ' +
    '7) "seo_faq": traduce cada "pregunta"/"respuesta" manteniendo el MISMO número y orden de elementos. ' +
    '8) Si un campo de origen viene vacío, devuélvelo vacío ("" o []). ' +
    '9) Devuelve EXCLUSIVAMENTE JSON válido con la forma ' +
    '{"<idioma>":{"name":"","description":"","seo_title":"","seo_intro":"","seo_faq":[{"pregunta":"","respuesta":""}]}}, ' +
    'usando las claves de idioma exactas solicitadas. '

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        nombre_origen: nombre,
        descripcion_origen: descripcion ?? '',
        seo_title_origen: seoTitle ?? '',
        seo_intro_origen: seoIntro ?? '',
        seo_faq_origen: normalizeFaqList(seoFaq),
        idiomas_destino: locales,
      }),
    },
  ]
}

/**
 * Construye los mensajes del modelo para traducir un PRODUCTO (ficha).
 * Traduce el contenido de cara al cliente: nombre comercial, título SEO y el
 * cuerpo de la ficha (descripción HTML + FAQ estructurada). Nunca se tocan
 * precios, stock ni URLs, así la ficha y el JSON-LD no se desincronizan.
 * @param {{ nombre: string, tituloSeo?: string|null, descripcion?: string|null, seoFaq?: {pregunta:string,respuesta:string}[]|null, locales: string[] }} input
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
export function buildProductMessages({ nombre, tituloSeo, descripcion, seoFaq, locales }) {
  const system =
    'Eres traductor profesional de e-commerce y SEO internacional. ' +
    'Traduce el contenido de ficha de un PRODUCTO a los idiomas pedidos. ' +
    'REGLAS: 1) Respeta el producto exacto, sin inventar especificaciones. ' +
    '2) ' + REGLA_ACRONIMOS + ' ' +
    '3) "name": el nombre debe sonar natural al comprarlo en ese idioma. ' +
    '4) "titulo_seo": la versión optimizada para buscadores (máx. 60 caracteres). ' +
    '5) "description": conserva EXACTAMENTE las mismas etiquetas HTML (<h2>,<h3>,<p>,<ul>,<li>,<strong>) y traduce solo el texto visible. NUNCA uses <h1>. ' +
    '6) "seo_faq": traduce cada "pregunta"/"respuesta" manteniendo el MISMO número y orden de elementos. ' +
    '7) Si un campo de origen viene vacío, devuélvelo vacío ("" o []). ' +
    '8) Devuelve EXCLUSIVAMENTE JSON válido con la forma ' +
    '{"<idioma>":{"name":"","titulo_seo":"","description":"","seo_faq":[{"pregunta":"","respuesta":""}]}}, ' +
    'usando las claves de idioma exactas solicitadas. '

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        nombre_origen: nombre,
        titulo_seo_origen: tituloSeo ?? '',
        descripcion_origen: descripcion ?? '',
        seo_faq_origen: normalizeFaqList(seoFaq),
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
 * Cubre tanto el contenido básico (name/description) como el editorial del hub
 * (seo_title/seo_intro/seo_faq); un campo vacío del modelo no borra lo existente.
 * @param {any} row Fila actual de `categories`.
 * @param {Record<string, { name?: string, description?: string, seo_title?: string, seo_intro?: string, seo_faq?: {pregunta:string,respuesta:string}[] }>} traduccion Salida del modelo.
 * @returns {{ name_i18n: Record<string,string>, slug_i18n: Record<string,string>, description_i18n: Record<string,string>, seo_title_i18n: Record<string,string>, seo_intro_i18n: Record<string,string>, seo_faq_i18n: Record<string,{pregunta:string,respuesta:string}[]> }}
 */
export function mergeCategoryTranslations(row, traduccion) {
  const nameI18n = { ...toLocaleMap(row?.name_i18n) }
  const slugI18n = { ...toLocaleMap(row?.slug_i18n) }
  const descriptionI18n = { ...toLocaleMap(row?.description_i18n) }
  const seoTitleI18n = { ...toLocaleMap(row?.seo_title_i18n) }
  const seoIntroI18n = { ...toLocaleMap(row?.seo_intro_i18n) }
  const seoFaqI18n = { ...toLocaleMap(row?.seo_faq_i18n) }

  // Idioma raíz: se hereda del dato base (nunca se traduce ni se re-slugifica).
  if (row?.name) nameI18n[SOURCE_LOCALE] = row.name
  if (row?.slug) slugI18n[SOURCE_LOCALE] = row.slug

  for (const locale of TARGET_LOCALES) {
    const entry = traduccion?.[locale]
    if (!entry) continue

    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (name) {
      nameI18n[locale] = name
      const slug = slugify(name)
      if (slug) slugI18n[locale] = slug
    }

    const description = typeof entry.description === 'string' ? entry.description.trim() : ''
    if (description) descriptionI18n[locale] = description

    const seoTitle = typeof entry.seo_title === 'string' ? entry.seo_title.trim() : ''
    if (seoTitle) seoTitleI18n[locale] = seoTitle

    const seoIntro = typeof entry.seo_intro === 'string' ? entry.seo_intro.trim() : ''
    if (seoIntro) seoIntroI18n[locale] = seoIntro

    const seoFaq = normalizeFaqList(entry.seo_faq)
    if (seoFaq.length > 0) seoFaqI18n[locale] = seoFaq
  }

  return {
    name_i18n: nameI18n,
    slug_i18n: slugI18n,
    description_i18n: descriptionI18n,
    seo_title_i18n: seoTitleI18n,
    seo_intro_i18n: seoIntroI18n,
    seo_faq_i18n: seoFaqI18n,
  }
}

/**
 * Fusiona la traducción nueva con el estado actual de un producto.
 * Guarda solo textos de cara al cliente: nombre comercial, título SEO, cuerpo de
 * la ficha (descripción HTML) y la FAQ estructurada. Un campo vacío del modelo
 * conserva el valor ya guardado (nunca lo borra).
 * @param {Record<string, any>} translationsActuales Valor actual de `products.translations`.
 * @param {Record<string, { name?: string, titulo_seo?: string, description?: string, seo_faq?: {pregunta:string,respuesta:string}[] }>} traduccion Salida del modelo.
 * @returns {Record<string, { name?: string, titulo_seo?: string, description?: string, seo_faq?: {pregunta:string,respuesta:string}[] }>}
 */
export function mergeProductTranslations(translationsActuales, traduccion) {
  const translations = { ...toLocaleMap(translationsActuales) }

  for (const locale of TARGET_LOCALES) {
    const entry = traduccion?.[locale]
    if (!entry) continue

    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    const tituloSeo = typeof entry.titulo_seo === 'string' ? entry.titulo_seo.trim() : ''
    const description = typeof entry.description === 'string' ? entry.description.trim() : ''
    const seoFaq = normalizeFaqList(entry.seo_faq)

    // Nada traducible en este idioma: no se crea una clave vacía.
    if (!name && !tituloSeo && !description && seoFaq.length === 0) continue

    translations[locale] = {
      ...toLocaleMap(translations[locale]),
      ...(name ? { name } : {}),
      ...(tituloSeo ? { titulo_seo: tituloSeo } : {}),
      ...(description ? { description } : {}),
      ...(seoFaq.length > 0 ? { seo_faq: seoFaq } : {}),
    }
  }

  return translations
}

// ============================================================
// ENTRADAS SEO (comparativas y guías)
// Mismo contrato que categorías/productos: el idioma raíz NUNCA se traduce
// (se hereda del dato base) y los slugs se generan en local, de modo que una
// URL ya indexada no cambia al añadir idiomas.
// ============================================================

/**
 * Idiomas destino que faltan por traducir en una ENTRADA.
 * Exige título + resumen y, si el idioma raíz tiene cuerpo editorial, su
 * versión traducida (evita "pendientes perpetuos").
 * @param {any} row Fila de `seo_entries`.
 * @param {boolean} [force] TRUE = considera pendientes TODOS los idiomas destino.
 * @returns {string[]} Locales destino pendientes.
 */
export function missingEntryLocales(row, force = false) {
  const titulos = toLocaleMap(row?.titulo_i18n)
  const resumenes = toLocaleMap(row?.resumen_i18n)
  const cuerpos = toLocaleMap(row?.cuerpo_html_i18n)
  const faqs = toLocaleMap(row?.faq_i18n)
  const tieneCuerpo = Boolean(row?.cuerpo_html)
  const tieneFaq = Array.isArray(row?.faq) && row.faq.length > 0

  return TARGET_LOCALES.filter((locale) => {
    if (force) return true
    const titulo = typeof titulos[locale] === 'string' ? titulos[locale].trim() : ''
    const resumen = typeof resumenes[locale] === 'string' ? resumenes[locale].trim() : ''
    if (!titulo || !resumen) return true
    if (tieneCuerpo && !cuerpos[locale]) return true
    if (tieneFaq && !faqs[locale]) return true
    return false
  })
}

/**
 * Construye los mensajes del modelo para traducir una ENTRADA (artículo).
 * Conserva el HTML y el número de preguntas: la estructura editorial es parte
 * del SEO, así que NO se puede reorganizar ni recortar al traducir.
 * @param {{ titulo: string, resumen?: string, cuerpoHtml?: string, faq?: {pregunta:string,respuesta:string}[]|null, locales: string[] }} input
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
export function buildEntryMessages({ titulo, resumen, cuerpoHtml, faq, locales }) {
  const system =
    'Eres traductor profesional de e-commerce y SEO internacional. ' +
    'Traduce una GUIA/COMPARATIVA de productos a los idiomas pedidos. ' +
    'REGLAS: 1) Respeta el significado exacto, sin anadir opiniones ni datos nuevos. ' +
    '2) ' + REGLA_ACRONIMOS + ' ' +
    '3) "titulo": titulo periodistico con gancho, de longitud similar al origen. ' +
    '4) "resumen": frase de meta description (max. 160 caracteres). ' +
    '5) "cuerpo_html": conserva EXACTAMENTE las mismas etiquetas HTML (<h2>,<h3>,<p>,<ul>,<li>,<strong>) y traduce solo el texto visible. NO cambies ni quites los encabezados. ' +
    '6) "faq": traduce cada "pregunta"/"respuesta" manteniendo el MISMO numero y orden. ' +
    '7) Si un campo de origen viene vacio, devuelvelo vacio ("") o []. ' +
    '8) Devuelve EXCLUSIVAMENTE JSON valido con la forma ' +
    '{"<idioma>":{"titulo":"","resumen":"","cuerpo_html":"","faq":[{"pregunta":"","respuesta":""}]}}, ' +
    'usando las claves de idioma exactas solicitadas. '

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: JSON.stringify({
        titulo_origen: titulo,
        resumen_origen: resumen ?? '',
        cuerpo_html_origen: cuerpoHtml ?? '',
        faq_origen: normalizeFaqList(faq),
        idiomas_destino: locales,
      }),
    },
  ]
}

/**
 * Fusiona la traducción nueva con el estado actual de una entrada.
 * El idioma raíz SIEMPRE se rellena con el dato base y el slug localizado se
 * genera con `slugify` del título traducido (ej: /fr/guias/titre-traduit).
 * Un campo vacío del modelo conserva el valor ya guardado (nunca lo borra).
 * @param {any} row Fila actual de `seo_entries`.
 * @param {Record<string, { titulo?: string, resumen?: string, cuerpo_html?: string, faq?: {pregunta:string,respuesta:string}[] }>} traduccion Salida del modelo.
 * @returns {{ titulo_i18n: Record<string,string>, slug_i18n: Record<string,string>, resumen_i18n: Record<string,string>, cuerpo_html_i18n: Record<string,string>, faq_i18n: Record<string,{pregunta:string,respuesta:string}[]> }}
 */
export function mergeEntryTranslations(row, traduccion) {
  const tituloI18n = { ...toLocaleMap(row?.titulo_i18n) }
  const slugI18n = { ...toLocaleMap(row?.slug_i18n) }
  const resumenI18n = { ...toLocaleMap(row?.resumen_i18n) }
  const cuerpoI18n = { ...toLocaleMap(row?.cuerpo_html_i18n) }
  const faqI18n = { ...toLocaleMap(row?.faq_i18n) }

  // Idioma raíz: se hereda del dato base (nunca se traduce ni se re-slugifica).
  if (row?.titulo) tituloI18n[SOURCE_LOCALE] = row.titulo
  if (row?.slug) slugI18n[SOURCE_LOCALE] = row.slug
  if (row?.resumen) resumenI18n[SOURCE_LOCALE] = row.resumen
  if (row?.cuerpo_html) cuerpoI18n[SOURCE_LOCALE] = row.cuerpo_html
  if (Array.isArray(row?.faq) && row.faq.length > 0) faqI18n[SOURCE_LOCALE] = normalizeFaqList(row.faq)

  for (const locale of TARGET_LOCALES) {
    const entry = traduccion?.[locale]
    if (!entry) continue

    const titulo = typeof entry.titulo === 'string' ? entry.titulo.trim() : ''
    if (titulo) {
      tituloI18n[locale] = titulo
      const slug = slugify(titulo)
      if (slug) slugI18n[locale] = slug
    }

    const resumen = typeof entry.resumen === 'string' ? entry.resumen.trim() : ''
    if (resumen) resumenI18n[locale] = resumen

    const cuerpo = typeof entry.cuerpo_html === 'string' ? entry.cuerpo_html.trim() : ''
    if (cuerpo) cuerpoI18n[locale] = cuerpo

    const faq = normalizeFaqList(entry.faq)
    if (faq.length > 0) faqI18n[locale] = faq
  }

  return {
    titulo_i18n: tituloI18n,
    slug_i18n: slugI18n,
    resumen_i18n: resumenI18n,
    cuerpo_html_i18n: cuerpoI18n,
    faq_i18n: faqI18n,
  }
}
