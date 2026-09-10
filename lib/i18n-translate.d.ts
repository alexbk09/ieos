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

/** Mensajes del modelo para traducir una categoría (nombre + descripción). */
export function buildCategoryMessages(input: {
  nombre: string
  descripcion?: string
  locales: string[]
}): ChatMessage[]

/** Mensajes del modelo para traducir un producto (nombre + título SEO). */
export function buildProductMessages(input: {
  nombre: string
  tituloSeo?: string | null
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
}): Promise<{ success: true; text: string } | { success: false; error: string }>

/** Fusiona la traducción nueva con el estado actual de una categoría. */
export function mergeCategoryTranslations(
  row: any,
  traduccion: Record<string, { name?: string; description?: string }>,
): {
  name_i18n: Record<string, string>
  slug_i18n: Record<string, string>
  description_i18n: Record<string, string>
}

/** Fusiona la traducción nueva con el estado actual de un producto. */
export function mergeProductTranslations(
  translationsActuales: Record<string, any> | null | undefined,
  traduccion: Record<string, { name?: string; titulo_seo?: string }>,
): Record<string, { name?: string; titulo_seo?: string }>
