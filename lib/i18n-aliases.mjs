/**
 * Normalización de las CLAVES de las respuestas del traductor (lógica pura).
 * ------------------------------------------------------------------
 * POR QUÉ existe (bug real detectado en producción):
 *   El modelo a veces TRADUCE TAMBIÉN LOS NOMBRES DE LOS CAMPOS. Traduciendo al
 *   portugués devolvía `{"resumo": "..."}` en lugar de `{"resumen": "..."}`, y la
 *   fusión descartaba el valor en silencio: el idioma quedaba como pendiente
 *   para siempre y la web mostraba el texto del idioma raíz.
 *
 * Solución: antes de fusionar, cada campo se lee por ALIAS conocidos (nombre en
 * español + equivalentes en los idiomas destino) con comparación insensible a
 * mayúsculas, acentos y separadores (`seo_title` ≡ `seoTitle` ≡ `SEO-TITLE`).
 *
 * Formato .mjs puro: lo consumen lib/i18n-translate.mjs y lib/legal-i18n.mjs
 * (y, por tanto, la app y los scripts de backfill) sin compilar TypeScript.
 */

/**
 * Normaliza una clave para compararla: minúsculas, sin acentos ni separadores.
 * @param {unknown} key Clave cruda del modelo ("Título SEO").
 * @returns {string} Clave normalizada ("tituloseo").
 */
export function normalizeKey(key) {
  return String(key ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Devuelve el primer valor de `obj` cuya clave coincide con alguno de los alias.
 * @param {unknown} obj Objeto del modelo (puede ser null).
 * @param {string[]} aliases Alias YA normalizados a buscar.
 * @returns {unknown} Valor encontrado o undefined.
 */
export function pickAliased(obj, aliases) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined
  for (const [key, value] of Object.entries(obj)) {
    if (aliases.includes(normalizeKey(key))) return value
  }
  return undefined
}

/** Alias del campo `name` (nombre) de productos y categorías. */
export const NAME_ALIASES = ['name', 'nombre', 'nom', 'nome', 'nombredelproducto', 'productname', 'bezeichnung']

/** Alias del campo `titulo_seo` (título optimizado para buscadores). */
export const SEO_TITLE_ALIASES = ['tituloseo', 'seotitle', 'tituloseo60', 'seotitel', 'titrecol', 'titoloseo', 'metatitle']

/** Alias del campo `description` (descripción visible / HTML). */
export const DESCRIPTION_ALIASES = [
  'description',
  'descripcion',
  'descricao',
  'descrizione',
  'beschreibung',
  'descripcionhtml',
  'descriptionhtml',
  'descripcionlarga',
]

/** Alias del campo `seo_faq` (preguntas frecuentes estructuradas). */
export const SEO_FAQ_ALIASES = [
  'seofaq',
  'faq',
  'faqs',
  'faqseo',
  'preguntasfrecuentes',
  'perguntasfrequentes',
  'questionsfrequentes',
  'domandefrequenti',
  'haufigefragen',
]

/** Alias del campo `titulo` (título editorial de una entrada SEO). */
export const TITLE_ALIASES = ['titulo', 'title', 'titre', 'titolo', 'titel', 'titulodelaentrada']

/** Alias del campo `resumen` (meta description de una entrada SEO). */
export const SUMMARY_ALIASES = [
  'resumen',
  'resumo',
  'summary',
  'resume',
  'riepilogo',
  'sommario',
  'zusammenfassung',
  'metadescripcion',
  'metadescription',
]

/** Alias del campo `cuerpo_html` (cuerpo del artículo, con HTML). */
export const BODY_HTML_ALIASES = [
  'cuerpohtml',
  'cuerpo',
  'contenidohtml',
  'contenidobody',
  'corpohtml',
  'corpo',
  'bodyhtml',
  'contenthtml',
  'contenuhtml',
  'inhalthtml',
  'html',
]

/** Alias del campo `seo_intro` (guía editorial del hub de categoría). */
export const SEO_INTRO_ALIASES = ['seointro', 'introseo', 'introduccionseo', 'introducaoseo', 'guide', 'guia', 'einfuhrung']

/** Alias del campo `summary` de un documento legal. */
export const LEGAL_SUMMARY_ALIASES = [...SUMMARY_ALIASES, 'descripcioncorta']

/** Alias del campo `sections` de un documento legal. */
export const LEGAL_SECTIONS_ALIASES = ['sections', 'secciones', 'seciones', 'secoes', 'sezioni', 'abschnitte']

/** Alias del campo `id` de una sección legal (ancla estable, nunca cambia). */
export const LEGAL_ID_ALIASES = ['id', 'identificador', 'clave', 'key', 'anchor', 'ancla']

/** Alias del campo `title` de una sección legal. */
export const LEGAL_SECTION_TITLE_ALIASES = [...TITLE_ALIASES, 'encabezado', 'heading']

/** Alias del campo `blocks` de una sección legal. */
export const LEGAL_BLOCKS_ALIASES = ['blocks', 'bloques', 'blocos', 'blocchi', 'blocke', 'parrafos', 'paragraphs']

/** Alias del campo `kind` de un bloque legal ('p' | 'ul'). */
export const LEGAL_KIND_ALIASES = ['kind', 'tipo', 'type', 'typ', 'clase', 'format']

/** Alias del campo `text` de un párrafo legal. */
export const LEGAL_TEXT_ALIASES = ['text', 'texto', 'texte', 'testo', 'inhalt', 'contenido']

/** Alias del campo `items` de una lista legal. */
export const LEGAL_ITEMS_ALIASES = ['items', 'elementos', 'itens', 'elements', 'elementi', 'eintraege', 'puntos']

/** Alias de la clave `pregunta` de un ítem de FAQ. */
export const FAQ_QUESTION_ALIASES = ['pregunta', 'question', 'pergunta', 'domanda', 'frage', 'preguntafrecuente']

/** Alias de la clave `respuesta` de un ítem de FAQ. */
export const FAQ_ANSWER_ALIASES = ['respuesta', 'answer', 'resposta', 'risposta', 'antwort', 'reponse', 'respuestafrecuente']
