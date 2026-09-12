/**
 * Declaración de tipos para lib/entry-rules.mjs.
 * Lógica pura de las ENTRADAS SEO (guías y comparativas): conteo/tiempo de
 * lectura, gate de calidad, selección de pares comparables, tabla comparativa
 * y constructores de schema JSON-LD (Article / ItemList / grafo completo).
 */

// ---------- Tipos compartidos ----------

/** Pregunta/respuesta frecuente de una entrada. */
export type EntryFaqItemLike = { pregunta: string; respuesta: string }

/** Entrada evaluada por el gate de calidad. */
export type EntryQualityInput = {
  titulo?: string
  slug?: string
  resumen?: string
  cuerpo_html?: string
  faq?: EntryFaqItemLike[]
  keywords?: string[]
  /** Productos REALES del catálogo asociados a la entrada. */
  productos?: unknown[]
  tipo?: string
}

/** Umbrales del gate. La fuente de los valores es lib/constants.ts. */
export type EntryQualityOptions = {
  bannedPhrases?: string[]
  requiredSections?: string[]
  minTitleLength?: number
  maxTitleLength?: number
  minResumenLength?: number
  maxResumenLength?: number
  minWords?: number
  minFaq?: number
  maxFaq?: number
  minKeywords?: number
  maxKeywords?: number
  minProductos?: number
  requireNoH1?: boolean
  allowedTipos?: readonly string[]
}

/** Producto mínimo para proponer pares comparables. */
export type ComparableProduct = { id: string; categoryIds?: string[] }

/** Par "X vs Y" propuesto dentro de una misma categoría. */
export type ComparablePair<T extends ComparableProduct = ComparableProduct> = {
  categoriaId: string
  a: T
  b: T
}

/** Producto mínimo para construir la tabla comparativa. */
export type ComparisonProduct = {
  slug: string
  specifications?: Record<string, string>
}

/** Tabla comparativa lista para renderizar y para el schema. */
export type ComparisonTable = {
  criterios: { criterio: string; valores: { slug: string; valor: string }[] }[]
}

/** Datos reales de la entrada que alimentan el schema Article. */
export type ArticleSchemaInput = {
  url?: string
  headline?: string
  description?: string
  image?: string
  datePublished?: string
  dateModified?: string
  author?: string
  keywords?: string[]
  section?: string
  inLanguage?: string
  publisher?: { name?: string; logoUrl?: string }
}

/** Piezas reales que se ensamblan en el @graph JSON-LD de la página. */
export type EntryJsonLdInput = {
  article?: ArticleSchemaInput
  items?: { name: string; url: string }[]
  itemsName?: string
  faq?: EntryFaqItemLike[] | null
  breadcrumb?: { name: string; url: string }[]
}

// ---------- Funciones ----------

/** Cuenta las palabras reales del cuerpo HTML (sin etiquetas). */
export function contarPalabras(html: string): number

/** Calcula el tiempo de lectura estimado en minutos (siempre ≥ 1). */
export function calcularMinutosLectura(html: string, palabrasPorMinuto?: number): number

/** TRUE si el cuerpo HTML ya incluye la sección con ese título (<h2>). */
export function tieneSeccionEnCuerpo(html: string, titulo: string): boolean

/** Valida el fondo de una entrada (gate anti "thin content" y anti plantilla). */
export function validarCalidadEntrada(
  data: EntryQualityInput,
  opciones?: EntryQualityOptions,
): { ok: boolean; errores: string[] }

/** Propone pares "X vs Y" solo dentro de la misma categoría (determinista). */
export function seleccionarParesComparables<T extends ComparableProduct>(
  productos: T[],
  opciones?: { maxPares?: number },
): ComparablePair<T>[]

/** Construye la tabla comparativa usando SOLO especificaciones reales. */
export function construirComparativa(
  productos: ComparisonProduct[],
  criterios?: string[],
  opciones?: { maxCriterios?: number },
): ComparisonTable

/** Construye el JSON-LD Article (null si faltan URL o titular). */
export function buildArticleSchema(input: ArticleSchemaInput): Record<string, unknown> | null

/** Construye el JSON-LD ItemList de los productos comparados. */
export function buildItemListSchema(
  items: { name: string; url: string }[],
  nombre?: string,
): Record<string, unknown> | null

/** Ensambla el @graph JSON-LD completo (artículo + lista + FAQ + migas). */
export function buildEntryJsonLd(input: EntryJsonLdInput): Record<string, unknown> | null

// ---------- Re-exportados de seo-rules.mjs (único punto de entrada) ----------

/** Convierte HTML a texto plano. */
export function stripHtml(html: string): string

/** Firma anti-duplicado de un título (primeras N palabras significativas). */
export function firmaTitulo(titulo: string, maxPalabras?: number): string

/** Construye el JSON-LD BreadcrumbList. */
export function buildBreadcrumbSchema(
  items: { name: string; url: string }[],
): { '@context': string; '@type': 'BreadcrumbList'; itemListElement: Record<string, unknown>[] }

/** Construye el JSON-LD FAQPage (o null si no hay preguntas válidas). */
export function buildFaqSchema(faq: EntryFaqItemLike[] | null | undefined): Record<string, unknown> | null
