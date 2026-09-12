import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import {
  DEFAULT_LOCALE,
  ENTRY_INDEX_PAGE_SIZE,
  ENTRY_MAX_PER_CATEGORY,
  ENTRY_RELATED_LIMIT,
  ENTRY_TYPES,
  SOURCE_LOCALE,
} from '@/lib/constants'
import { baseLanguage } from '@/lib/i18n-config'
import { resolveLocalizedList, resolveLocalizedValue } from '@/lib/i18n-content'
import { revalidarSitemap } from '@/lib/sitemap-revalidate'
import type { SeoFaqItem } from '@/lib/seo-types'

/**
 * Servicio de ENTRADAS SEO (comparativas y guías): capa ÚNICA de acceso a
 * Supabase para `seo_entries` y sus relaciones.
 * ------------------------------------------------------------------
 * Regla de oro: los componentes y las páginas NUNCA llaman a supabase.from();
 * todo pasa por aquí. Las lecturas públicas usan el cliente público (SSG+ISR)
 * y las escrituras el de servidor (RLS + RBAC deciden).
 *
 * NO toca `categories` ni `products`: solo los ENLAZA (tablas puente).
 */

// ---------- Tipos ----------

/** Estados del ciclo editorial (espejo del CHECK de la migración 0056). */
export type EntryEstado = 'borrador' | 'revision' | 'publicado' | 'archivado'

/** Tipo/intención de la entrada (fuente única: ENTRY_TYPES). */
export type EntryTipo = (typeof ENTRY_TYPES)[number]

/** Fila de la tabla comparativa: criterio + valor por producto. */
export type EntryComparisonRow = { criterio: string; valores: { slug: string; valor: string }[] }

/** Comparativa estructurada que alimenta el componente y el schema ItemList. */
export type EntryComparison = { criterios: EntryComparisonRow[] }

/** Producto real enlazado a la entrada (con su posición en la comparativa). */
export type EntryProduct = {
  id: string
  name: string
  slug: string
  image_url: string | null
  price_usd: number
  stock: number
  specifications: Record<string, string> | null
  url_afiliado_ali: string | null
  url_afiliado_amazon: string | null
  url_afiliado_store: string | null
  /** Orden dentro de la comparativa/top. */
  posicion: number
  /** Veredicto corto del producto dentro de esta entrada. */
  nota: string | null
}

/** Nicho enlazado a la entrada (enlazado interno hacia el hub). */
export type EntryCategory = {
  id: string
  name: string
  slug: string
  /** Slug localizado por idioma (para enlazar a la URL del idioma activo). */
  slug_i18n?: Record<string, string> | null
  /** Slug resuelto para el idioma pedido (fallback = slug base). */
  slug_localizado?: string
}

/** Entrada SEO completa (campos base + relaciones + i18n). */
export type Entry = {
  id: string
  tipo: EntryTipo
  estado: EntryEstado
  titulo: string
  slug: string
  resumen: string | null
  cuerpo_html: string | null
  comparativa: EntryComparison | null
  faq: SeoFaqItem[] | null
  keywords: string[] | null
  keyword_objetivo: string | null
  angulo: string | null
  hero_image_url: string | null
  autor: string | null
  revisor_id: string | null
  lectura_minutos: number | null
  indexado_google: boolean
  publicado_en: string | null
  created_at: string
  updated_at: string
  products: EntryProduct[]
  categories: EntryCategory[]
  /** Slug resuelto para el idioma pedido (localizado o base). */
  slug_localizado?: string
  /** Slugs localizados por idioma (alimentan hreflang y sitemap). */
  slugI18n?: Record<string, string> | null
}

/** Resolución i18n: idioma raíz = español, idioma por defecto = es. */
const I18N_RESOLVE_OPTIONS = { sourceLocale: SOURCE_LOCALE, defaultLocale: DEFAULT_LOCALE }

/**
 * Columnas que se leen SIEMPRE: la entrada + sus productos (datos para la tabla
 * comparativa y el CTA de afiliado) + sus nichos.
 */
export const ENTRY_SELECT =
  '*, seo_entry_products(posicion,nota,products(id,name,slug,image_url,price_usd,stock,specifications,url_afiliado_ali,url_afiliado_amazon,url_afiliado_store)), seo_entry_categories(categories(id,name,slug,slug_i18n))'

// ---------- Normalización ----------

/** Normaliza la FAQ (JSONB) a {pregunta, respuesta} sin entradas vacías. */
function normalizarFaq(value: unknown): SeoFaqItem[] | null {
  if (!Array.isArray(value)) return null
  const items = value
    .map((item: any) => ({
      pregunta: String(item?.pregunta ?? '').trim(),
      respuesta: String(item?.respuesta ?? '').trim(),
    }))
    .filter((item) => item.pregunta && item.respuesta)
  return items.length > 0 ? items : null
}

/** Normaliza la comparativa (JSONB) descartando filas y valores vacíos. */
function normalizarComparativa(value: unknown): EntryComparison | null {
  const criterios = (value as any)?.criterios
  if (!Array.isArray(criterios)) return null
  const filas: EntryComparisonRow[] = criterios
    .map((fila: any) => ({
      criterio: String(fila?.criterio ?? '').trim(),
      valores: (Array.isArray(fila?.valores) ? fila.valores : []).map((valor: any) => ({
        slug: String(valor?.slug ?? '').trim(),
        valor: String(valor?.valor ?? '').trim(),
      })),
    }))
    .filter(
      (fila: { criterio: string; valores: { slug: string; valor: string }[] }) =>
        fila.criterio && fila.valores.some((valor: { valor: string }) => valor.valor),
    )
  return filas.length > 0 ? { criterios: filas } : null
}

/** Convierte una fila de Supabase en `Entry` tipada (relaciones ordenadas). */
export function mapEntry(row: any): Entry {
  const products: EntryProduct[] = ((row?.seo_entry_products ?? []) as any[])
    .filter((link) => link?.products)
    .map((link) => ({
      id: link.products.id,
      name: link.products.name,
      slug: link.products.slug,
      image_url: link.products.image_url ?? null,
      price_usd: Number(link.products.price_usd ?? 0),
      stock: Number(link.products.stock ?? 0),
      specifications: link.products.specifications ?? null,
      url_afiliado_ali: link.products.url_afiliado_ali ?? null,
      url_afiliado_amazon: link.products.url_afiliado_amazon ?? null,
      url_afiliado_store: link.products.url_afiliado_store ?? null,
      posicion: Number(link.posicion ?? 0),
      nota: link.nota ?? null,
    }))
    // `posicion` manda: es el orden editorial de la comparativa.
    .sort((a, b) => a.posicion - b.posicion)

  const categories: EntryCategory[] = ((row?.seo_entry_categories ?? []) as any[])
    .filter((link) => link?.categories)
    .map((link) => ({
      id: link.categories.id,
      name: link.categories.name,
      slug: link.categories.slug,
      slug_i18n: link.categories.slug_i18n ?? null,
    }))

  return {
    id: row.id,
    tipo: row.tipo,
    estado: row.estado,
    titulo: row.titulo,
    slug: row.slug,
    resumen: row.resumen ?? null,
    cuerpo_html: row.cuerpo_html ?? null,
    comparativa: normalizarComparativa(row.comparativa),
    faq: normalizarFaq(row.faq),
    keywords: Array.isArray(row.keywords) ? row.keywords : null,
    keyword_objetivo: row.keyword_objetivo ?? null,
    angulo: row.angulo ?? null,
    hero_image_url: row.hero_image_url ?? null,
    autor: row.autor ?? null,
    revisor_id: row.revisor_id ?? null,
    lectura_minutos: row.lectura_minutos ?? null,
    indexado_google: row.indexado_google !== false,
    publicado_en: row.publicado_en ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    products,
    categories,
    // Se expone el mapa i18n de slugs para que las páginas emitan hreflang
    // correcto (una URL localizada por idioma) y no solo el del idioma activo.
    slugI18n: row.slug_i18n ?? null,
  }
}

/**
 * Aplica las traducciones del idioma pedido a una entrada.
 * Cadena de fallback estándar (pedido → por defecto → raíz) para que un idioma
 * sin traducir nunca muestre texto vacío. Sin `locale` devuelve la fila tal cual
 * (cero cambios visibles hasta que el enrutado por idioma lo solicite).
 */
function localizarEntrada(row: any, locale?: string): Entry {
  const entrada = mapEntry(row)
  if (!locale) return entrada

  const titulo = resolveLocalizedValue(row?.titulo_i18n, locale, I18N_RESOLVE_OPTIONS)
  const resumen = resolveLocalizedValue(row?.resumen_i18n, locale, I18N_RESOLVE_OPTIONS)
  const cuerpo = resolveLocalizedValue(row?.cuerpo_html_i18n, locale, I18N_RESOLVE_OPTIONS)
  const slug = resolveLocalizedValue(row?.slug_i18n, locale, I18N_RESOLVE_OPTIONS)
  const faq = resolveLocalizedList<SeoFaqItem>(row?.faq_i18n, locale, I18N_RESOLVE_OPTIONS)

  return {
    ...entrada,
    titulo: titulo || entrada.titulo,
    resumen: resumen || entrada.resumen,
    cuerpo_html: cuerpo || entrada.cuerpo_html,
    faq: faq.length > 0 ? faq : entrada.faq,
    slug_localizado: slug || entrada.slug,
    categories: entrada.categories.map((categoria) => ({
      ...categoria,
      slug_localizado:
        resolveLocalizedValue(categoria.slug_i18n, locale, I18N_RESOLVE_OPTIONS) || categoria.slug,
    })),
  }
}

// ---------- Lectura pública (SSG + ISR: cliente público) ----------

/** Filtros de la lista de entradas del panel (incluye borradores por RLS). */
export type EntryListFilters = {
  estado?: EntryEstado
  tipo?: EntryTipo
  /** Búsqueda por título. */
  search?: string
  limit?: number
  offset?: number
}

/**
 * Lista las entradas PUBLICADAS (hub /guias).
 * Cliente público → cacheable y sin exponer borradores.
 */
export async function listPublishedEntries(
  input: { locale?: string; limit?: number; offset?: number } = {},
) {
  const supabase = createPublicClient()
  const limit = Math.max(Number(input.limit) || ENTRY_INDEX_PAGE_SIZE, 1)
  const offset = Math.max(Number(input.offset) || 0, 0)

  const { data, error } = await supabase
    .from('seo_entries')
    .select(ENTRY_SELECT)
    .eq('estado', 'publicado')
    .order('publicado_en', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) return { entries: [] as Entry[], error }
  return { entries: (data ?? []).map((row) => localizarEntrada(row, input.locale)), error: null }
}

/**
 * Obtiene una entrada publicada por slug (página /guias/[slug]).
 * Igual que las categorías: primero el slug BASE (URL histórica ya indexada) y
 * luego el slug LOCALIZADO del idioma activo.
 */
export async function getPublishedEntryBySlug(slug: string, locale?: string) {
  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from('seo_entries')
    .select(ENTRY_SELECT)
    .eq('estado', 'publicado')
    .eq('slug', slug)
    .maybeSingle()
  if (error) return { entry: null, error }
  if (data) return { entry: localizarEntrada(data, locale), error: null }

  // Fallback: slug localizado (ej: /fr/guias/titre-en-francais).
  if (locale) {
    const { data: localized } = await supabase
      .from('seo_entries')
      .select(ENTRY_SELECT)
      .eq('estado', 'publicado')
      .contains('slug_i18n', { [baseLanguage(locale)]: slug })
      .maybeSingle()
    if (localized) return { entry: localizarEntrada(localized, locale), error: null }
  }

  return { entry: null, error: null }
}

/** Slugs base + traducciones de las entradas publicadas (generateStaticParams). */
export async function getEntrySlugs() {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('seo_entries')
    .select('slug,slug_i18n')
    .eq('estado', 'publicado')
  if (error) {
    return { items: [] as { slug: string; slug_i18n: Record<string, string> | null }[], error }
  }
  const items = ((data ?? []) as any[])
    .filter((row) => row?.slug)
    .map((row) => ({ slug: String(row.slug), slug_i18n: row.slug_i18n ?? null }))
  return { items, error: null }
}

/** Entradas que deben entrar al sitemap: publicadas E indexables. */
export async function getSitemapEntries() {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('seo_entries')
    .select('slug,updated_at,publicado_en,slug_i18n')
    .eq('estado', 'publicado')
    .eq('indexado_google', true)
  if (error) {
    return {
      items: [] as { slug: string; lastmod: string; slug_i18n: Record<string, string> | null }[],
      error,
    }
  }
  const items = ((data ?? []) as any[])
    .filter((row) => row?.slug)
    .map((row) => ({
      slug: String(row.slug),
      // `lastmod` REAL: la última edición, no la fecha de generación del XML.
      lastmod: String(row.updated_at ?? row.publicado_en ?? new Date().toISOString()),
      slug_i18n: row.slug_i18n ?? null,
    }))
  return { items, error: null }
}

// ---------- Cluster de enlazado interno (entrada ↔ producto ↔ nicho) ----------

/**
 * Lee entradas publicadas por id (helper compartido por los 3 bloques de
 * enlazado interno). Centralizarlo evita triplicar la misma consulta.
 */
async function fetchPublishedEntriesByIds(
  ids: string[],
  locale?: string,
  limit = ENTRY_RELATED_LIMIT,
) {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('seo_entries')
    .select(ENTRY_SELECT)
    .eq('estado', 'publicado')
    .in('id', ids)
    .order('publicado_en', { ascending: false })
    .limit(limit)
  if (error) return { entries: [] as Entry[], error }
  return { entries: (data ?? []).map((row) => localizarEntrada(row, locale)), error: null }
}

/**
 * IDs de entrada enlazados a un valor concreto en una tabla puente.
 * Se hace en dos pasos (puente → entradas) en lugar de un join embebido: es
 * más explícito, más barato de depurar y no depende de las sutilezas de
 * filtrado sobre recursos anidados de PostgREST.
 */
async function fetchLinkedEntryIds(
  table: 'seo_entry_products' | 'seo_entry_categories',
  column: 'product_id' | 'category_id',
  value: string,
) {
  const supabase = createPublicClient()
  const { data, error } = await supabase.from(table).select('entry_id').eq(column, value)
  if (error) return { ids: [] as string[], error }
  const ids = [...new Set(((data ?? []) as any[]).map((link) => link.entry_id))].filter(Boolean)
  return { ids, error: null }
}

/**
 * Entradas relacionadas: comparten nicho con la entrada actual.
 * Es el "cluster" que reparte autoridad entre artículos del mismo tema.
 */
export async function getRelatedEntries(input: {
  entryId: string
  categoryIds: string[]
  locale?: string
  limit?: number
}) {
  const limit = Math.min(Math.max(Number(input.limit) || ENTRY_RELATED_LIMIT, 1), ENTRY_RELATED_LIMIT)
  const categoryIds = (input.categoryIds ?? []).filter(Boolean)
  if (categoryIds.length === 0) return { entries: [] as Entry[], error: null }

  const supabase = createPublicClient()
  const { data: links, error: linkError } = await supabase
    .from('seo_entry_categories')
    .select('entry_id')
    .in('category_id', categoryIds)
  if (linkError) return { entries: [] as Entry[], error: linkError }

  const ids = [...new Set(((links ?? []) as any[]).map((link) => link.entry_id))].filter(
    (id) => id && id !== input.entryId,
  )
  if (ids.length === 0) return { entries: [] as Entry[], error: null }
  return fetchPublishedEntriesByIds(ids, input.locale, limit)
}

/**
 * Entradas publicadas donde aparece un producto ("Guías donde aparece").
 * Cierra el enlazado BIDIRECCIONAL producto ↔ guía (crawl + descubrimiento).
 */
export async function getEntriesForProduct(
  productId: string,
  locale?: string,
  limit = ENTRY_RELATED_LIMIT,
) {
  const { ids, error } = await fetchLinkedEntryIds('seo_entry_products', 'product_id', productId)
  if (error) return { entries: [] as Entry[], error }
  if (ids.length === 0) return { entries: [] as Entry[], error: null }
  return fetchPublishedEntriesByIds(ids, locale, limit)
}

/** Entradas publicadas de un nicho (bloque "Guías del nicho" en el hub). */
export async function getEntriesForCategory(
  categoryId: string,
  locale?: string,
  limit = ENTRY_RELATED_LIMIT,
) {
  const { ids, error } = await fetchLinkedEntryIds('seo_entry_categories', 'category_id', categoryId)
  if (error) return { entries: [] as Entry[], error }
  if (ids.length === 0) return { entries: [] as Entry[], error: null }
  return fetchPublishedEntriesByIds(ids, locale, limit)
}

// ---------- Panel de administración (incluye borradores por RLS) ----------

/**
 * Lista las entradas para el panel (BORRADORES incluidos).
 * Usa el cliente de servidor: la RLS solo permite ver borradores a quien tenga
 * permiso del módulo 'guias_comparativas'.
 */
export async function listEntries(filters: EntryListFilters = {}) {
  const supabase = await createServerClient()
  const limit = Math.min(Math.max(Number(filters.limit) || ENTRY_INDEX_PAGE_SIZE, 1), 100)
  const offset = Math.max(Number(filters.offset) || 0, 0)

  let query = supabase
    .from('seo_entries')
    .select(ENTRY_SELECT)
    .order('updated_at', { ascending: false })
  if (filters.estado) query = query.eq('estado', filters.estado)
  if (filters.tipo) query = query.eq('tipo', filters.tipo)
  const search = String(filters.search ?? '').trim()
  if (search) query = query.ilike('titulo', '%' + search + '%')

  const { data, error } = await query.range(offset, offset + limit - 1)
  if (error) return { entries: [] as Entry[], error }
  // Sin localizar: el editor trabaja sobre el idioma raíz (fuente de verdad).
  return { entries: (data ?? []).map((row) => mapEntry(row)), error: null }
}

/** Lee una entrada por id (editor del panel). Sin localizar: idioma raíz. */
export async function getEntryById(id: string) {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('seo_entries')
    .select(ENTRY_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) return { entry: null, error }
  if (!data) return { entry: null, error: null }
  return { entry: mapEntry(data), error: null }
}

/**
 * Cuenta las entradas NO archivadas de un nicho.
 * POR QUÉ existe: es el gate que evita inundar un nicho con variaciones
 * (contenido "doorway" a escala). El asistente de IA lo consulta antes de
 * proponer una entrada nueva.
 */
export async function countEntriesByCategory(categoryId: string) {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('seo_entry_categories')
    .select('entry_id')
    .eq('category_id', categoryId)
  if (error) return { count: 0, error }

  const ids = [...new Set(((data ?? []) as any[]).map((link) => link.entry_id))].filter(Boolean)
  if (ids.length === 0) return { count: 0, error: null }

  const { data: rows, error: rowsError } = await supabase
    .from('seo_entries')
    .select('id')
    .in('id', ids)
    .neq('estado', 'archivado')
  if (rowsError) return { count: 0, error: rowsError }
  return { count: (rows ?? []).length, error: null }
}

/** TRUE si el nicho ya está en el tope de entradas (gate anti-spam). */
export async function alcanzoTopeDeCategoria(categoryId: string) {
  const { count, error } = await countEntriesByCategory(categoryId)
  if (error) return false
  return count >= ENTRY_MAX_PER_CATEGORY
}

// ---------- Escritura (cliente de servidor: la RLS + RBAC deciden) ----------

/** Payload de alta/edición de una entrada. */
export type EntryInput = {
  tipo?: EntryTipo
  estado?: EntryEstado
  titulo: string
  slug: string
  resumen?: string | null
  cuerpo_html?: string | null
  comparativa?: EntryComparison | null
  faq?: SeoFaqItem[] | null
  keywords?: string[] | null
  keyword_objetivo?: string | null
  angulo?: string | null
  hero_image_url?: string | null
  autor?: string | null
  revisor_id?: string | null
  lectura_minutos?: number | null
  indexado_google?: boolean
  titulo_i18n?: Record<string, string> | null
  slug_i18n?: Record<string, string> | null
  resumen_i18n?: Record<string, string> | null
  cuerpo_html_i18n?: Record<string, string> | null
  faq_i18n?: Record<string, SeoFaqItem[]> | null
}

/** Relaciones de la entrada: qué productos compara y a qué nichos pertenece. */
export type EntryRelationsInput = {
  productIds?: string[]
  categoryIds?: string[]
  /** Veredicto corto por producto (id de producto → nota). */
  notas?: Record<string, string>
}

/**
 * Reemplaza las relaciones (productos + nichos) de una entrada.
 * POR QUÉ borrar e insertar: el orden editorial de la comparativa vive en
 * `posicion`, así que la forma más simple y predecible de actualizarlo es
 * reconstruir los enlaces dentro de la misma operación del panel.
 */
async function replaceRelations(entryId: string, relations: EntryRelationsInput) {
  const supabase = await createServerClient()

  const { error: deleteProductsError } = await supabase
    .from('seo_entry_products')
    .delete()
    .eq('entry_id', entryId)
  if (deleteProductsError) return { error: deleteProductsError }

  const { error: deleteCategoriesError } = await supabase
    .from('seo_entry_categories')
    .delete()
    .eq('entry_id', entryId)
  if (deleteCategoriesError) return { error: deleteCategoriesError }

  const productIds = (relations.productIds ?? []).filter(Boolean)
  if (productIds.length > 0) {
    const rows = productIds.map((productId, index) => ({
      entry_id: entryId,
      product_id: productId,
      posicion: index,
      nota: relations.notas?.[productId]?.trim() || null,
    }))
    const { error } = await supabase.from('seo_entry_products').insert(rows)
    if (error) return { error }
  }

  const categoryIds = (relations.categoryIds ?? []).filter(Boolean)
  if (categoryIds.length > 0) {
    const rows = categoryIds.map((categoryId) => ({ entry_id: entryId, category_id: categoryId }))
    const { error } = await supabase.from('seo_entry_categories').insert(rows)
    if (error) return { error }
  }

  return { error: null }
}

/** Envuelve un valor en su mapa i18n del idioma raíz (o {} si viene vacío). */
function rootI18n<T>(value: T | null | undefined): Record<string, T> {
  if (value === null || value === undefined) return {}
  if (typeof value === 'string' && !value.trim()) return {}
  if (Array.isArray(value) && value.length === 0) return {}
  return { [SOURCE_LOCALE]: value }
}

/**
 * Crea una entrada sembrando SIEMPRE el idioma raíz (igual que createCategory).
 * Así cualquier locale resuelve por fallback desde el primer momento y la URL
 * localizada nunca queda sin slug.
 */
export async function createEntry(payload: EntryInput, relations: EntryRelationsInput = {}) {
  const supabase = await createServerClient()
  const row = {
    ...payload,
    titulo_i18n: { ...rootI18n(payload.titulo), ...(payload.titulo_i18n ?? {}) },
    slug_i18n: { ...rootI18n(payload.slug), ...(payload.slug_i18n ?? {}) },
    resumen_i18n: { ...rootI18n(payload.resumen), ...(payload.resumen_i18n ?? {}) },
    cuerpo_html_i18n: { ...rootI18n(payload.cuerpo_html), ...(payload.cuerpo_html_i18n ?? {}) },
    faq_i18n: { ...rootI18n(payload.faq), ...(payload.faq_i18n ?? {}) },
  }

  const { data, error } = await supabase
    .from('seo_entries')
    .insert(row)
    .select('id,slug')
    .single()
  if (error) return { entry: null, error }

  const relationResult = await replaceRelations(data.id, relations)
  if (relationResult.error) return { entry: null, error: relationResult.error }

  // El sitemap se refresca al instante (regla del proyecto: nunca esperar la ISR).
  revalidarSitemap({ entradaSlug: data.slug })
  return { entry: data as { id: string; slug: string }, error: null }
}

/**
 * Actualiza una entrada y, si se pasan, sus relaciones.
 * El slug resultante se revalida junto al sitemap para que la URL concreta
 * sirva el contenido nuevo de inmediato (sin esperar la ISR de 5 minutos).
 */
export async function updateEntry(
  id: string,
  payload: Partial<EntryInput>,
  relations?: EntryRelationsInput,
) {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('seo_entries')
    .update(payload)
    .eq('id', id)
    .select('id,slug')
    .single()
  if (error) return { entry: null, error }

  if (relations) {
    const relationResult = await replaceRelations(id, relations)
    if (relationResult.error) return { entry: null, error: relationResult.error }
  }

  revalidarSitemap({ entradaSlug: data.slug })
  return { entry: data as { id: string; slug: string }, error: null }
}

/**
 * Cambia el estado editorial (publicar / despublicar / archivar).
 * POR QUÉ va aparte del update normal: publicar decide si el contenido entra al
 * sitemap y a la web pública, así que merece su propio camino y su propia
 * revalidación inmediata.
 */
export async function updateEntryEstado(id: string, estado: EntryEstado) {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('seo_entries')
    .update({ estado })
    .eq('id', id)
    .select('id,slug,estado')
    .single()
  if (error) return { entry: null, error }

  revalidarSitemap({ entradaSlug: data.slug })
  return { entry: data as { id: string; slug: string; estado: EntryEstado }, error: null }
}

/** Elimina una entrada (sus relaciones caen por ON DELETE CASCADE). */
export async function deleteEntry(id: string) {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('seo_entries')
    .delete()
    .eq('id', id)
    .select('slug')
    .single()
  if (error) return { slug: null, error }

  revalidarSitemap({ entradaSlug: (data?.slug as string) ?? null })
  return { slug: (data?.slug as string) ?? null, error: null }
}

/**
 * Registra una generación/traducción con IA en `seo_entry_generations`.
 * Es observabilidad (tokens, coste, errores): un fallo al registrar NUNCA debe
 * romper la operación principal, por eso solo se loggea en consola.
 */
export async function logEntryGeneration(input: {
  entryId?: string | null
  locale?: string
  etapa?: 'generacion' | 'traduccion'
  modelo?: string | null
  exito: boolean
  tokensPrompt?: number | null
  tokensSalida?: number | null
  costeUsd?: number | null
  errores?: string | null
}) {
  const supabase = await createServerClient()
  const { error } = await supabase.from('seo_entry_generations').insert({
    entry_id: input.entryId ?? null,
    locale: input.locale ?? SOURCE_LOCALE,
    etapa: input.etapa ?? 'generacion',
    modelo: input.modelo ?? null,
    exito: input.exito,
    tokens_prompt: input.tokensPrompt ?? null,
    tokens_salida: input.tokensSalida ?? null,
    coste_usd: input.costeUsd ?? null,
    errores: input.errores ?? null,
  })
  if (error) console.error('[entries] logEntryGeneration:', error.message)
  return { error }
}
