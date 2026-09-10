/**
 * Declaración de tipos para lib/seo-rules.mjs.
 * Lógica pura SEO: normalización de títulos, validación de calidad de
 * contenido y constructores de schema JSON-LD (BreadcrumbList / FAQPage).
 */

/** Pregunta/respuesta frecuente. */
export type SeoFaqItemLike = { pregunta: string; respuesta: string }

/** Normaliza un texto (minúsculas, sin acentos ni signos, espacios simples). */
export function normalizarTitulo(titulo: string): string

/** Extrae la firma anti-duplicado (primeras N palabras significativas). */
export function firmaTitulo(titulo: string, maxPalabras?: number): string

/** Convierte HTML a texto plano (para respuestas de FAQ en el schema). */
export function stripHtml(html: string): string

/** Valida el fondo del contenido SEO generado por la IA. */
export function validarCalidadSeo(
  data: { titulo_seo: string; descripcion_html: string },
  opciones?: {
    bannedPhrases?: string[]
    requiredSections?: string[]
    minTitleLength?: number
    requireNoH1?: boolean
  },
): { ok: boolean; errores: string[] }

/** Construye el JSON-LD BreadcrumbList (migas de pan estructuradas). */
export function buildBreadcrumbSchema(
  items: { name: string; url: string }[],
): { '@context': string; '@type': 'BreadcrumbList'; itemListElement: Record<string, unknown>[] }

/** Construye el JSON-LD FAQPage (o null si no hay preguntas válidas). */
export function buildFaqSchema(faq: SeoFaqItemLike[] | null | undefined): Record<string, unknown> | null
