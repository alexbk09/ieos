/**
 * Declaración de tipos para lib/i18n-translate.mjs.
 * Núcleo puro de traducción de contenido (prompt, llamada y fusión).
 */

/** Resultado de una operación que puede fallar. */
export type TranslateResult<T> = { success: true; data: T } | { success: false; error: string }

/** Mensaje del modelo de chat. */
export type ChatMessage = { role: 'system' | 'user'; content: string }

/** Idiomas destino de la traducción (todos menos el idioma raíz). */
export const TARGET_LOCALES: readonly string[]

/** Normaliza un campo JSONB a objeto plano. */
export function toLocaleMap(value: unknown): Record<string, any>

/** Pregunta/respuesta frecuente (forma mínima compartida). */
export type FaqItemLike = { pregunta: string; respuesta: string }

/**
 * Normaliza una lista de FAQ al formato { pregunta, respuesta } con ambos textos
 * no vacíos; tolera null/valores inválidos (devuelve []).
 */
export function normalizeFaqList(value: unknown): FaqItemLike[]

/** Idiomas destino que faltan por traducir en un producto (fuente única). */
export function missingProductLocales(row: any, force?: boolean): string[]

/** Idiomas destino que faltan por traducir en una categoría (fuente única). */
export function missingCategoryLocales(row: any, force?: boolean): string[]

/** Mensajes del modelo para traducir una categoría (nombre, descripción y SEO del hub). */
export function buildCategoryMessages(input: {
  nombre: string
  descripcion?: string
  seoTitle?: string | null
  seoIntro?: string | null
  seoFaq?: FaqItemLike[] | null
  locales: string[]
}): ChatMessage[]

/** Mensajes del modelo para traducir un producto (nombre, título SEO, descripción y FAQ). */
export function buildProductMessages(input: {
  nombre: string
  tituloSeo?: string | null
  descripcion?: string | null
  seoFaq?: FaqItemLike[] | null
  locales: string[]
}): ChatMessage[]

/** Parsea y valida el JSON devuelto por el modelo. */
export function parseTranslationResponse(
  text: string,
): TranslateResult<Record<string, any>>

/** Ejecuta la llamada al modelo de traducción (config inyectada). */
export function requestTranslation(input: {
  apiKey: string
  apiUrl: string
  model: string
  temperature: number
  maxTokens: number
  messages: ChatMessage[]
}): Promise<
  | {
      success: true
      text: string
      /** 'stop' = respuesta completa; 'length' = cortada por límite de tokens. */
      finishReason: string | null
      usage: Record<string, unknown> | null
    }
  | { success: false; error: string }
>

/**
 * Reparte los idiomas pendientes en lotes (evita respuestas truncadas al
 * traducir contenido largo a varios idiomas en una sola llamada).
 */
export function chunkLocales(locales: string[], size: number): string[][]

/** Fusiona la traducción nueva con el estado actual de una categoría. */
export function mergeCategoryTranslations(
  row: any,
  traduccion: Record<
    string,
    { name?: string; description?: string; seo_title?: string; seo_intro?: string; seo_faq?: FaqItemLike[] }
  >,
): {
  name_i18n: Record<string, string>
  slug_i18n: Record<string, string>
  description_i18n: Record<string, string>
  seo_title_i18n: Record<string, string>
  seo_intro_i18n: Record<string, string>
  seo_faq_i18n: Record<string, FaqItemLike[]>
}

/**
 * Huella comparable de un nombre (minúsculas, sin acentos y palabras ordenadas).
 * Sirve para comparar traducciones automáticas que reordenan las palabras.
 */
export function nameFingerprint(text: unknown): string

/**
 * TRUE si el nombre base de la categoría aún no está redactado en el idioma raíz
 * (data heredada escrita en inglés). Coste cero: solo lee el JSONB.
 */
export function isSourceLocaleNamePending(row: any): boolean

/** Mensajes del modelo para redactar el nombre de una categoría en el idioma raíz. */
export function buildSourceLocaleNameMessages(input: {
  nombre: string
  locale?: string
}): ChatMessage[]

/** Extrae el nombre redactado en el idioma raíz de la respuesta del modelo. */
export function parseSourceLocaleName(
  text: string,
): { success: true; name: string } | { success: false; error: string }

/**
 * Fusiona el nombre del idioma raíz con el estado actual: solo reescribe `name`
 * y su clave del JSONB (los idiomas y los slugs quedan intactos).
 */
export function mergeSourceLocaleName(
  row: any,
  nombre: string,
): { name: string; name_i18n: Record<string, string> } | null

/** Fusiona la traducción nueva con el estado actual de un producto. */
export function mergeProductTranslations(
  translationsActuales: Record<string, any> | null | undefined,
  traduccion: Record<
    string,
    { name?: string; titulo_seo?: string; description?: string; seo_faq?: FaqItemLike[] }
  >,
): Record<
  string,
  { name?: string; titulo_seo?: string; description?: string; seo_faq?: FaqItemLike[] }
>

// ---------- Entradas SEO (comparativas y guías) ----------

/** Idiomas destino que faltan por traducir en una entrada SEO (fuente única). */
export function missingEntryLocales(row: any, force?: boolean): string[]

/** Mensajes del modelo para traducir una entrada (título, resumen, cuerpo y FAQ). */
export function buildEntryMessages(input: {
  titulo: string
  resumen?: string
  cuerpoHtml?: string
  faq?: FaqItemLike[] | null
  locales: string[]
}): ChatMessage[]

/** Fusiona la traducción nueva con el estado actual de una entrada SEO. */
export function mergeEntryTranslations(
  row: any,
  traduccion: Record<
    string,
    { titulo?: string; resumen?: string; cuerpo_html?: string; faq?: FaqItemLike[] }
  >,
): {
  titulo_i18n: Record<string, string>
  slug_i18n: Record<string, string>
  resumen_i18n: Record<string, string>
  cuerpo_html_i18n: Record<string, string>
  faq_i18n: Record<string, FaqItemLike[]>
}
