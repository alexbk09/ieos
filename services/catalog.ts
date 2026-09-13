import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import {
  CATALOG_PAGE_SIZE,
  CATEGORY_NAV_CACHE_TAG,
  CATEGORY_NAV_LIMIT,
  DEFAULT_CATALOG_SORT,
  DEFAULT_LOCALE,
  FEATURED_PRODUCTS_LIMIT,
  PUBLIC_DATA_REVALIDATE_SECONDS,
  RELATED_PRODUCTS_LIMIT,
  SOURCE_LOCALE,
  type CatalogSortValue,
} from '@/lib/constants'
// Resolución de traducciones JSONB (lógica pura compartida) y base de idioma.
import { resolveLocalizedValue, resolveLocalizedList, resolveProductTranslations } from '@/lib/i18n-content'
import { baseLanguage } from '@/lib/i18n-config'
import type { SeoFaqItem } from '@/lib/seo-types'
// Estado de disponibilidad del marketplace de afiliado (lógica pura compartida).
import type { AliEstadoDisponibilidad } from '@/lib/ali-availability'
import { revalidarSitemap } from '@/lib/sitemap-revalidate'
// Invalidación on-demand de la caché de datos públicos (navegación de categorías).
import { revalidarCacheDeDatos } from '@/lib/cache-revalidate'
// Fuente única de slugs (lógica pura .mjs reutilizable por scripts y tests).
import { slugify } from '@/lib/slug'

/**
 * Servicio de catálogo.
 * Capa única de acceso a Supabase para productos, categorías, marcas y proveedores.
 * Los componentes NUNCA deben llamar a supabase.from() directamente.
 * Las consultas públicas (portada, catálogo, categorías) usan el cliente público (SSG+ISR).
 */

// ---------- Tipos ----------
export type ProductImage = {
  id: string
  url: string
  alt_text: string | null
  sort_order: number
  /** Nombre del color al que pertenece la imagen (null = imagen general). */
  color_name?: string | null
}

/**
 * Reseña real de un producto (migración 0052).
 * Se guarda ya traducida del marketplace de origen y se muestra en la
 * sección "Opiniones" de la ficha (contenido único, long-tail natural).
 */
export type ProductReview = {
  /** Nombre del autor tal como lo publica el marketplace (puede faltar). */
  autor: string | null
  /** Valoración de la reseña en escala 0-5 (null si no viene). */
  valoracion: number | null
  /** Texto de la reseña (limpio y traducido). */
  texto: string
  /** Fecha relativa/absoluta publicada (texto libre, puede faltar). */
  fecha: string | null
}

export type Product = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  costo_inicial: number
  image_url: string | null
  category_id: string | null
  marca_id: string | null
  proveedor_id: string | null
  featured: boolean
  /** Peso del producto (texto libre, opcional). Ej: "0.8 kg" */
  peso?: string | null
  /** Tamaño del producto (texto libre, opcional). Ej: "50 x 50 cm" */
  tamaño?: string | null
  /** Tipo de precio: 'unit' (por unidad) o 'weight' (por peso). */
  pricing_type: 'unit' | 'weight'
  /** Precio en USD por kilogramo (solo si pricing_type = 'weight'). */
  price_per_kilo_usd: number
  /** Precio en USD por gramo (solo si pricing_type = 'weight'). */
  price_per_gram_usd: number
  /** Inventario en gramos (solo si pricing_type = 'weight'). */
  stock_grams: number
  /** Peso mínimo de compra en gramos (solo si pricing_type = 'weight'). */
  min_order_grams: number
  /** Etiqueta de la unidad de venta: u, g, kg, m, caja, etc. */
  unit_label: string
  /** Visible/oculto en el catálogo público. */
  is_available: boolean
  /**
   * Disponibilidad REAL en el marketplace de afiliado (migración 0058).
   * 'unavailable' = la ficha se DEGRADA (OutOfStock + alternativas) pero SIGUE
   * publicada a propósito para no perder la URL indexada ni crear soft-404.
   * 'ok' por defecto; `null`/`undefined` = aún sin verificar.
   */
  ali_status?: AliEstadoDisponibilidad | null
  /** Umbral de stock bajo (configurable). */
  low_stock_threshold: number
  /** SKU interno (opcional). */
  sku: string | null
  /** Código de barras EAN/UPC (opcional). */
  bar_code: string | null
  /** Descuento por volumen en % (mayoreo). */
  bulk_discount_percent: number
  /** Orden manual en el catálogo (menor = primero). */
  sort_order: number
  /** Peso neto por unidad/presentación en gramos (opcional). */
  weight_grams: number | null
  /** URL de afiliado de AliExpress (con tag de seguimiento). Opcional. */
  url_afiliado_ali?: string | null
  /** URL de afiliado de Amazon (con tag de seguimiento). Opcional. */
  url_afiliado_amazon?: string | null
  /** URL de afiliado genérica de la store (legado). Opcional. */
  url_afiliado_store?: string | null
  /** Código ASIN de la store/externo. Único; NULL si no aplica. */
  asin?: string | null
  /** Título optimizado para SEO/Google. Fallback = name. */
  titulo_seo?: string | null
  // ---------- Internacionalización (migración 0050) ----------
  /** Traducciones por idioma de la ficha: { fr: { name, titulo_seo, description, seo_faq } }. */
  translations?: Record<
    string,
    { name?: string; titulo_seo?: string; description?: string; seo_faq?: SeoFaqItem[] }
  > | null
  /** Precio original/referencia en USD (para mostrar oferta). */
  precio_original?: number | null
  /** TRUE = incluir en sitemap / indexación de Google. Default FALSE. */
  indexado_google?: boolean
  /** FAQ estructurada del producto (migración 0047) → schema FAQPage. */
  seo_faq?: SeoFaqItem[] | null
  /** Palabras clave long-tail objetivo (migración 0047). */
  seo_keywords?: string[] | null
  /** Valoración media real en escala 0-5 (migración 0052). NULL si no hay dato. */
  rating_average?: number | null
  /** Número de valoraciones reales reportadas (migración 0052). */
  rating_count?: number | null
  /** Origen de la valoración ('aliexpress' | 'amazon' | 'store'). */
  rating_source?: string | null
  /** Reseñas reales traducidas (migración 0052) → sección Opiniones. */
  reviews?: ProductReview[] | null
  categories?: Category[]
  images?: ProductImage[]
  colors?: string[]
  specifications?: Record<string, string>
  /** Marca resuelta por la relación FK (solo cuando se incluye en el select). */
  marca?: { id: string; nombre: string; activa: boolean } | null
  /** Proveedor resuelto por la relación FK (solo cuando se incluye en el select). */
  proveedor?: { id: string; nombre: string; rif: string | null; activo: boolean } | null
}

export type Category = {
  id: string
  name: string
  slug: string
  description: string | null
  activa: boolean
  created_at: string
  updated_at: string
  /** Título H1 largo del hub (migración 0047). Fallback = name. */
  seo_title?: string | null
  /** HTML editorial del hub: Guía de compra, Cómo elegir, Consejos. */
  seo_intro?: string | null
  /** FAQ del nicho (migración 0047) → schema FAQPage de la categoría. */
  seo_faq?: SeoFaqItem[] | null
  /**
   * Firma editorial del hub (migración 0057): autoría visible del contenido
   * informacional de la categoría (señal E-E-A-T). Por defecto se rellena con
   * `DEFAULT_AUTHOR` (variable NEXT_PUBLIC_DEFAULT_AUTHOR) y es editable.
   */
  autor?: string | null
  // ---------- Internacionalización (migración 0049) ----------
  // El inglés (idioma raíz/puente) sigue en `name`/`slug`; aquí van las
  // traducciones por locale. La resolución con fallback vive en
  // lib/i18n-content.mjs (resolveLocalizedValue / resolveLocalizedList).
  /** Nombre visible por idioma: { en: "...", es: "..." }. */
  name_i18n?: Record<string, string> | null
  /** Slug/URL localizada por idioma: { es: "ratones-gamer" }. */
  slug_i18n?: Record<string, string> | null
  /** Descripción corta por idioma. */
  description_i18n?: Record<string, string> | null
  /** Título H1 del hub por idioma. */
  seo_title_i18n?: Record<string, string> | null
  /** HTML editorial del hub por idioma. */
  seo_intro_i18n?: Record<string, string> | null
  /** FAQ del nicho por idioma: { es: [{ pregunta, respuesta }] }. */
  seo_faq_i18n?: Record<string, SeoFaqItem[]> | null
  /**
   * Slug traducido del idioma pedido, resuelto por `localizarCategoria`.
   * `slug` sigue siendo el BASE (identidad de ruta estable e indexada).
   */
  slug_localizado?: string
}

export type CategoryInput = {
  name: string
  slug: string
  description?: string | null
  activa?: boolean
  /** Traducciones por idioma (migración 0049). Opcionales: el CRUD simple no las toca. */
  name_i18n?: Record<string, string> | null
  slug_i18n?: Record<string, string> | null
  description_i18n?: Record<string, string> | null
  seo_title_i18n?: Record<string, string> | null
  seo_intro_i18n?: Record<string, string> | null
  seo_faq_i18n?: Record<string, SeoFaqItem[]> | null
}

/** Imagen de producto con color asociado (opcional). */
export type ProductImageInput = {
  url: string
  /** Nombre exacto del color al que pertenece (null = imagen general). */
  color_name?: string | null
}

export type ProductInput = {
  name: string
  slug: string
  description?: string | null
  price_usd: number
  stock: number
  costo_inicial?: number
  image_url?: string | null
  marca_id?: string | null
  proveedor_id?: string | null
  featured?: boolean
  category_ids?: string[]
  images?: string[]
  /** Imágenes asociadas a un color específico (color_name + url). */
  colorImages?: ProductImageInput[]
  colors?: string[]
  /** Peso del producto (texto libre, opcional). */
  peso?: string | null
  /** Tamaño del producto (texto libre, opcional). */
  tamaño?: string | null
  specifications?: Record<string, string>
  /** Tipo de precio: 'unit' (por unidad) o 'weight' (por peso). */
  pricing_type?: 'unit' | 'weight'
  /** Precio por kilogramo (peso). */
  price_per_kilo_usd?: number
  /** Precio por gramo (peso). Se re-deriva si se envía price_per_kilo_usd. */
  price_per_gram_usd?: number
  /** Stock en gramos (peso). */
  stock_grams?: number
  /** Peso mínimo de compra en gramos (peso). */
  min_order_grams?: number
  /** Etiqueta de la unidad de venta. */
  unit_label?: string
  /** Visible/oculto en el catálogo público. */
  is_available?: boolean
  /** Umbral de stock bajo. */
  low_stock_threshold?: number
  /** SKU interno. */
  sku?: string | null
  /** Código de barras EAN/UPC. */
  bar_code?: string | null
  /** Descuento por volumen en % (mayoreo). */
  bulk_discount_percent?: number
  /** Orden manual en el catálogo (menor = primero). */
  sort_order?: number
  /** Peso neto por unidad/presentación en gramos. */
  weight_grams?: number | null
  /** URL de afiliado de AliExpress (con tag de seguimiento). Opcional. */
  url_afiliado_ali?: string | null
  /** URL de afiliado de Amazon (con tag de seguimiento). Opcional. */
  url_afiliado_amazon?: string | null
  /** URL de afiliado genérica de la store (legado). Opcional. */
  url_afiliado_store?: string | null
  /** Código ASIN (store/externo). Opcional. */
  asin?: string | null
  /** Título optimizado para SEO/Google. Opcional (fallback = name). */
  titulo_seo?: string | null
  /** Precio original/referencia en USD (precio tachado). Opcional. */
  precio_original?: number | null
  /** TRUE = incluir en sitemap / indexación de Google. */
  indexado_google?: boolean
  /** FAQ estructurada del producto (migración 0047) → schema FAQPage. */
  seo_faq?: SeoFaqItem[] | null
  /** Palabras clave long-tail objetivo (migración 0047). */
  seo_keywords?: string[] | null
  /** Valoración media real 0-5 (migración 0052). Solo pipeline/afiliados. */
  rating_average?: number | null
  /** Nº de valoraciones reales (migración 0052). */
  rating_count?: number | null
  /** Origen de la valoración (migración 0052). */
  rating_source?: string | null
  /** Reseñas reales traducidas (migración 0052). */
  reviews?: ProductReview[] | null
  // Solo para carga masiva: nombres de marca/proveedor/categoria.
  // Si el item trae nombre y no trae id, se resuelve o crea automaticamente.
  marca_nombre?: string | null
  proveedor_nombre?: string | null
  categoria_nombre?: string | null
  categoria_dos_nombre?: string | null
}

/** Filtros del catálogo público. */
export type CatalogFilters = {
  search?: string
  slug?: string
  minPrice?: number
  maxPrice?: number
  categoryIds?: string[]
  marcaIds?: string[]
  featuredOnly?: boolean
  /** Solo productos con precio de referencia (oferta / precio tachado). */
  onSaleOnly?: boolean
  /** Valoración mínima (escala 0-5) para "Mejor valorados". */
  minRating?: number
  /** Solo productos con stock local disponible (> 0). */
  inStockOnly?: boolean
  /** Solo productos con descuento por mayoreo activo (> 0). */
  bulkOnly?: boolean
  /** Orden de los resultados (ver CATALOG_SORT_OPTIONS). Por defecto: curaduría. */
  sort?: CatalogSortValue
}

export const PRODUCT_SELECT =
  '*, product_categories(categories(id,name,slug,description,name_i18n,slug_i18n,description_i18n)), product_images(id,url,alt_text,sort_order,color_name), marcas(id,nombre,activa), proveedores(id,nombre,rif,activo)'

/** Convierte una fila de Supabase en Product tipado. */
export function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price_usd: Number(row.price_usd),
    stock: row.stock,
    costo_inicial: Number(row.costo_inicial ?? 0),
    image_url: row.image_url,
    category_id: row.category_id,
    marca_id: row.marca_id ?? null,
    proveedor_id: row.proveedor_id ?? null,
    featured: row.featured,
    peso: row.peso ?? null,
    tamaño: row.tamaño ?? null,
    pricing_type: row.pricing_type === 'weight' ? 'weight' : 'unit',
    price_per_kilo_usd: Number(row.price_per_kilo_usd ?? 0),
    price_per_gram_usd: Number(row.price_per_gram_usd ?? 0),
    stock_grams: Number(row.stock_grams ?? 0),
    min_order_grams: Number(row.min_order_grams ?? 0),
    unit_label: row.unit_label ?? 'u',
    is_available: row.is_available !== false,
    // Disponibilidad del afiliado: cualquier valor distinto de 'unavailable'
    // se normaliza a 'ok' (incluye filas previas a la migración 0058).
    ali_status: row.ali_status === 'unavailable' ? 'unavailable' : 'ok',
    low_stock_threshold: Number(row.low_stock_threshold ?? 10),
    sku: row.sku ?? null,
    bar_code: row.bar_code ?? null,
    bulk_discount_percent: Number(row.bulk_discount_percent ?? 0),
    sort_order: Number(row.sort_order ?? 0),
    weight_grams: row.weight_grams != null ? Number(row.weight_grams) : null,
    url_afiliado_ali: row.url_afiliado_ali ?? null,
    url_afiliado_amazon: row.url_afiliado_amazon ?? null,
    url_afiliado_store: row.url_afiliado_store ?? null,
    asin: row.asin ?? null,
    titulo_seo: row.titulo_seo ?? null,
    // Traducciones por idioma (migración 0050): las resuelve localizarProducto.
    translations: row.translations ?? null,
    precio_original: row.precio_original != null ? Number(row.precio_original) : null,
    // Tri-estado SEO: `true` = indexar, `false` = noindex, `undefined` =
    // la migración 0042 aún no creó la columna → indexar (comportamiento histórico).
    indexado_google: row.indexado_google == null ? undefined : row.indexado_google === true,
    // FAQ/keywords SEO (migración 0047): normaliza a array si viene null.
    seo_faq: Array.isArray(row.seo_faq) ? (row.seo_faq as SeoFaqItem[]) : null,
    seo_keywords: Array.isArray(row.seo_keywords) ? (row.seo_keywords as string[]) : null,
    // Valoraciones y opiniones reales (migración 0052).
    rating_average: row.rating_average != null ? Number(row.rating_average) : null,
    rating_count: row.rating_count != null ? Number(row.rating_count) : null,
    rating_source: row.rating_source ?? null,
    reviews: Array.isArray(row.reviews) ? (row.reviews as ProductReview[]) : null,
    colors: row.colors ?? [],
    specifications: row.specifications ?? {},
    categories:
      row.product_categories?.map((pc: any) => pc.categories).filter(Boolean) ??
      row.categories ??
      [],
    images:
      row.product_images
        ?.map((pi: any) => ({
          id: pi.id,
          url: pi.url,
          alt_text: pi.alt_text,
          sort_order: pi.sort_order,
          color_name: pi.color_name ?? null,
        }))
        .sort((a: any, b: any) => a.sort_order - b.sort_order) ?? [],
    marca: row.marcas ?? row.marca ?? null,
    proveedor: row.proveedores ?? row.proveedor ?? null,
  }
}

// ---------- Productos ----------

/** Obtiene todos los productos con categorías e imágenes (vista admin). */
export async function getProductsWithCategories() {
  const supabase = await createServerClient()
  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from('products').select(PRODUCT_SELECT).order('created_at', { ascending: false }),
    supabase.from('categories').select('id,name,slug').order('name'),
  ])
  return {
    products: (products ?? []).map(mapProduct),
    categories: (categories ?? []) as Pick<Category, 'id' | 'name' | 'slug'>[] | null,
  }
}

/** Obtiene los productos destacados (favoritos) para la portada. Cliente público → SSG+ISR. */
export async function getFeaturedProducts(locale?: string) {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('featured', true)
    .eq('is_available', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(FEATURED_PRODUCTS_LIMIT)
  if (error) return { products: null, error }
  return { products: (data ?? []).map((row) => localizarProducto(row, locale)), error: null }
}

/** Obtiene los IDs de productos que pertenecen a las categorías dadas. */
async function getProductIdsByCategories(categoryIds: string[]) {
  const supabase = createPublicClient()
  const { data } = await supabase.from('product_categories').select('product_id').in('category_id', categoryIds)
  return [...new Set((data ?? []).map((row: any) => row.product_id))]
}

/**
 * Aplica el ordenamiento elegido a la consulta del catálogo.
 * Centraliza el mapeo UI→columnas para que la API/rutas no conozcan columnas.
 * - relevance: curaduría manual del equipo + novedad (comportamiento histórico).
 * - rating: mejor valorados primero; los productos SIN valoración van al final.
 * - price-asc/desc: por precio USD, con el orden manual como desempate estable.
 * - newest: publicados más recientemente.
 */
function applyCatalogOrdering(query: any, sort: CatalogSortValue = DEFAULT_CATALOG_SORT) {
  switch (sort) {
    case 'price-asc':
      return query.order('price_usd', { ascending: true }).order('sort_order', { ascending: true })
    case 'price-desc':
      return query.order('price_usd', { ascending: false }).order('sort_order', { ascending: true })
    case 'newest':
      return query.order('created_at', { ascending: false })
    case 'rating':
      return query
        .order('rating_average', { ascending: false, nullsFirst: false })
        .order('rating_count', { ascending: false, nullsFirst: false })
    case 'relevance':
    default:
      return query.order('sort_order', { ascending: true }).order('created_at', { ascending: false })
  }
}

/**
 * Devuelve una página del catálogo con filtros aplicados.
 * Pensado para infinite scroll: entrega 10 productos por llamada.
 * Cliente público → SSG+ISR.
 */
export async function getCatalogPage(filters: CatalogFilters = {}, from = 0, locale?: string) {
  const supabase = createPublicClient()

  let query = supabase
    .from('products')
    .select(PRODUCT_SELECT, { count: 'exact' })
    .eq('is_available', true)

  query = applyCatalogOrdering(query, filters.sort)
  query = query.range(from, from + CATALOG_PAGE_SIZE - 1)

  if (filters.search) query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
  if (filters.slug) query = query.ilike('slug', `%${filters.slug}%`)
  if (filters.minPrice !== undefined && Number.isFinite(filters.minPrice)) query = query.gte('price_usd', filters.minPrice)
  if (filters.maxPrice !== undefined && Number.isFinite(filters.maxPrice)) query = query.lte('price_usd', filters.maxPrice)
  if (filters.featuredOnly) query = query.eq('featured', true)
  // Facetas de valor (filtros rápidos del catálogo público).
  if (filters.onSaleOnly) query = query.not('precio_original', 'is', null)
  if (filters.minRating !== undefined && Number.isFinite(filters.minRating)) query = query.gte('rating_average', filters.minRating)
  if (filters.inStockOnly) query = query.gt('stock', 0)
  if (filters.bulkOnly) query = query.gt('bulk_discount_percent', 0)
  if (filters.categoryIds && filters.categoryIds.length > 0) query = query.in('id', await getProductIdsByCategories(filters.categoryIds))
  if (filters.marcaIds && filters.marcaIds.length > 0) query = query.in('marca_id', filters.marcaIds)

  const { data, error, count } = await query
  if (error) return { products: null, total: 0, hasMore: false, error }

  const products = (data ?? []).map((row) => localizarProducto(row, locale))
  const total = count ?? 0
  return { products, total, hasMore: from + products.length < total, error: null }
}

/**
 * Obtiene un producto público por slug exacto (página /productos/[slug]).
 * Cliente público → SSG+ISR. Reutiliza PRODUCT_SELECT + mapProduct del módulo.
 * Solo devuelve productos visibles para mantener coherencia con el catálogo.
 * `locale` resuelve el nombre/título SEO traducidos (migración 0050).
 *
 * ⚡ `cache()` de React: `generateMetadata` y la página piden el MISMO producto
 * dentro del mismo render, así que se consulta una sola vez (ahorra un
 * round-trip de ~250 ms en cada una de las ~2.000 páginas del build).
 */
export const getPublicProductBySlug = cache(async (slug: string, locale?: string) => {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_available', true)
    .eq('slug', slug)
    .maybeSingle()
  if (error) return { product: null, error }
  return { product: data ? localizarProducto(data, locale) : null, error: null }
})

/**
 * Obtiene todos los slugs visibles para generateStaticParams del pSEO.
 * Así cada producto nuevo que se publique se sirve desde CDN/ISR.
 */
export async function getPublicProductSlugs() {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('products')
    .select('slug')
    .eq('is_available', true)
  if (error) return { slugs: [] as string[], error }
  return { slugs: (data ?? []).map((row: any) => row.slug).filter(Boolean) as string[], error: null }
}

/**
 * Slug simple desde un texto (minúsculas, sin acentos, guiones).
 * La lógica pura vive en lib/slug.mjs: es la fuente ÚNICA (testeable en Node y
 * reutilizable por scripts .mjs). Se re-exporta para no romper los imports
 * existentes (services/aliProducts.ts, services/aliPipeline.ts).
 */
export { slugify }

/**
 * Construye la lista de imágenes a guardar en product_images.
 * Primero las imágenes generales (sin color) y luego las imágenes
 * asociadas a cada color (color_name + url), manteniendo el orden.
 */
function buildProductImages(payload: ProductInput) {
  const generalImages = (payload.images ?? []).filter(Boolean).map((url) => ({ url }))
  const colorImages = (payload.colorImages ?? [])
    .filter((img) => img.url && img.color_name)
    .map((img) => ({ url: img.url, color_name: img.color_name }))
  return [...generalImages, ...colorImages]
}

/**
 * Construye el payload de la tabla products con los nuevos campos de
 * precio por peso, unidades, disponibilidad, SKU, mayoreo y orden.
 * Si el producto es 'weight', deriva el precio por gramo desde el
 * precio por kilo enviado (para mantener consistencia).
 */
function buildProductRow(payload: ProductInput) {
  const isWeight = payload.pricing_type === 'weight'
  // Precio por gramo: si el usuario envía precio por kilo, se re-deriva.
  const pricePerGram =
    isWeight && Number(payload.price_per_kilo_usd) > 0
      ? Number(payload.price_per_kilo_usd) / 1000
      : Number(payload.price_per_gram_usd ?? 0)

  return {
    name: payload.name,
    slug: payload.slug,
    description: payload.description ?? null,
    price_usd: payload.price_usd,
    stock: payload.stock,
    costo_inicial: payload.costo_inicial ?? 0,
    marca_id: payload.marca_id ?? null,
    proveedor_id: payload.proveedor_id ?? null,
    featured: payload.featured ?? false,
    colors: payload.colors ?? [],
    peso: payload.peso ?? null,
    tamaño: payload.tamaño ?? null,
    specifications: payload.specifications ?? {},
    pricing_type: isWeight ? 'weight' : 'unit',
    price_per_kilo_usd: isWeight ? Number(payload.price_per_kilo_usd ?? 0) : 0,
    price_per_gram_usd: isWeight ? Number(pricePerGram || 0) : 0,
    stock_grams: isWeight ? Number(payload.stock_grams ?? 0) : 0,
    min_order_grams: isWeight ? Number(payload.min_order_grams ?? 0) : 0,
    unit_label: payload.unit_label?.trim() || (isWeight ? 'g' : 'u'),
    is_available: payload.is_available !== undefined ? payload.is_available : true,
    low_stock_threshold: Number(payload.low_stock_threshold ?? 10),
    sku: payload.sku?.trim() || null,
    bar_code: payload.bar_code?.trim() || null,
    bulk_discount_percent: Number(payload.bulk_discount_percent ?? 0),
    sort_order: Number(payload.sort_order ?? 0),
    weight_grams: payload.weight_grams != null ? Number(payload.weight_grams) : null,
    url_afiliado_ali: payload.url_afiliado_ali?.trim() || null,
    url_afiliado_amazon: payload.url_afiliado_amazon?.trim() || null,
    url_afiliado_store: payload.url_afiliado_store?.trim() || null,
    asin: payload.asin?.trim() || null,
    titulo_seo: payload.titulo_seo?.trim() || null,
    precio_original: payload.precio_original != null ? Number(payload.precio_original) : null,
    indexado_google: payload.indexado_google === true,
    // seo_faq/seo_keywords solo se escriben si vienen definidos: así el CRUD
    // manual (que no los envía) no borra el contenido generado por la IA.
    ...(payload.seo_faq !== undefined ? { seo_faq: payload.seo_faq } : {}),
    ...(payload.seo_keywords !== undefined ? { seo_keywords: payload.seo_keywords } : {}),
    // Valoraciones/opiniones (migración 0052): solo se escriben si vienen
    // definidas; el CRUD manual no las envía y así no borra las del pipeline.
    ...(payload.rating_average !== undefined ? { rating_average: payload.rating_average } : {}),
    ...(payload.rating_count !== undefined ? { rating_count: payload.rating_count } : {}),
    ...(payload.rating_source !== undefined ? { rating_source: payload.rating_source } : {}),
    ...(payload.reviews !== undefined ? { reviews: payload.reviews } : {}),
  }
}

/**
 * Traduce la ficha de un producto (best-effort) tras crearlo o actualizarlo.
 * Importa el servicio de i18n de forma DIFERIDA: evita acoplar el CRUD al motor
 * de traducción y cualquier ciclo de importación. Nunca lanza: un fallo deja el
 * producto en su idioma raíz y el backfill (`npm run i18n:products`) reintenta.
 * @param productoId UUID del producto recién creado/actualizado.
 */
async function traducirFichaProducto(productoId: string) {
  try {
    const { traducirProducto } = await import('@/services/i18n-translate')
    const traduccion = await traducirProducto(productoId)
    if (!traduccion.success) console.error('[catalog] i18n producto:', traduccion.error)
  } catch (err: any) {
    console.error('[catalog] i18n producto inesperado:', err?.message)
  }
}

/**
 * Crea un producto con sus categorías (N:N), imágenes múltiples,
 * marca y proveedor. Requiere sesión de admin — usa cliente servidor.
 * El producto NACE internacional: al crearlo se traduce su ficha (nombre, título
 * SEO, descripción y FAQ) a los idiomas soportados. Es idempotente y de coste
 * cero si ya estaba traducido.
 * @param options.revalidar FALSE en cargas masivas (se revalida una vez al final).
 * @param options.traducir FALSE para no encadenar una llamada al modelo por item
 *   (lo usa la carga masiva; sus productos se traducen con `npm run i18n:products`).
 */
export async function createProduct(
  payload: ProductInput,
  options: { revalidar?: boolean; traducir?: boolean } = {},
) {
  const supabase = await createServerClient()

  const categoryIds = payload.category_ids?.filter(Boolean) ?? []
  if (categoryIds.length === 0) {
    return { error: { message: 'Selecciona al menos una categoría para el producto.' } }
  }

  const productImages = buildProductImages(payload)
  const firstImage = productImages[0]?.url ?? payload.image_url ?? null
  const productRow = buildProductRow(payload)

  const { data, error } = await supabase
    .from('products')
    .insert({ ...productRow, image_url: firstImage, category_id: categoryIds[0] })
    .select(PRODUCT_SELECT)
    .single()
  if (error || !data) return { error: error ?? { message: 'No se pudo crear el producto.' } }

  const { error: relError } = await supabase
    .from('product_categories')
    .insert(categoryIds.map((category_id) => ({ product_id: data.id, category_id })))
  if (relError) return { error: relError }

  if (productImages.length > 0) {
    const { error: imgError } = await supabase
      .from('product_images')
      .insert(productImages.map((img, index) => ({ product_id: data.id, ...img, sort_order: index })))
    if (imgError) return { error: imgError }
  }

  const { data: full } = await supabase.from('products').select(PRODUCT_SELECT).eq('id', data.id).single()
  // Sitemap al día al instante (salvo en carga masiva, que revalida una vez).
  if (options.revalidar !== false) revalidarSitemap({ productoSlug: payload.slug })
  // i18n: el producto nace internacional (traducción inmediata al crearlo).
  if (options.traducir !== false) await traducirFichaProducto(data.id)
  return { data: mapProduct(full ?? data) }
}

/**
 * Actualiza un producto incluyendo sus categorías (N:N), imágenes,
 * marca y proveedor. Requiere sesión de admin — usa cliente servidor.
 */
export async function updateProduct(id: string, payload: ProductInput) {
  const supabase = await createServerClient()

  const categoryIds = payload.category_ids?.filter(Boolean) ?? []
  if (categoryIds.length === 0) {
    return { error: { message: 'Selecciona al menos una categoría para el producto.' } }
  }

  const productImages = buildProductImages(payload)
  const firstImage = productImages[0]?.url ?? payload.image_url ?? null
  const productRow = buildProductRow(payload)

  const { data, error } = await supabase
    .from('products')
    .update({ ...productRow, image_url: firstImage, category_id: categoryIds[0] })
    .eq('id', id)
    .select('id')
    .single()
  if (error || !data) return { error: error ?? { message: 'No se pudo actualizar el producto.' } }

  await supabase.from('product_categories').delete().eq('product_id', id)
  const { error: relError } = await supabase
    .from('product_categories')
    .insert(categoryIds.map((category_id) => ({ product_id: id, category_id })))
  if (relError) return { error: relError }

  await supabase.from('product_images').delete().eq('product_id', id)
  if (productImages.length > 0) {
    const { error: imgError } = await supabase
      .from('product_images')
      .insert(productImages.map((img, index) => ({ product_id: id, ...img, sort_order: index })))
    if (imgError) return { error: imgError }
  }

  const { data: full } = await supabase.from('products').select(PRODUCT_SELECT).eq('id', id).single()
  // La url/última modificación cambió: sitemap y ficha al instante.
  revalidarSitemap({ productoSlug: payload.slug })
  return { data: mapProduct(full ?? data) }
}

/** Elimina un producto (las relaciones N:N e imágenes se borran en cascada). */
export async function deleteProduct(id: string) {
  const supabase = await createServerClient()
  const result = await supabase.from('products').delete().eq('id', id)
  // Al borrar, la URL deja de existir: se revalida el sitemap para retirarla.
  if (!result.error) revalidarSitemap()
  return result
}

// ---------- Resolución automática de marcas, proveedores y categorías ----------

/** Normaliza un nombre para usarlo como clave única en mapas. */
function normalizeKey(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Resuelve (o crea) las marcas, proveedores y categorías mencionadas
 * en la carga masiva, con el menor número de llamadas a Supabase:
 *   1) Trae todas las filas de cada tabla (son tablas pequeñas).
 *   2) Filtra en memoria los nombres mencionados.
 *   3) Crea solo los faltantes (una inserción en lote por entidad).
 *   4) Devuelve mapas de nombre normalizado → id.
 */
async function resolveBulkRelations(items: ProductInput[]) {
  const supabase = await createServerClient()

  // Recolectar nombres únicos mencionados en el Excel
  const marcasNombres = new Set<string>()
  const proveedoresNombres = new Set<string>()
  const categoriasNombres = new Set<string>()

  for (const item of items) {
    if (item.marca_nombre?.trim()) marcasNombres.add(item.marca_nombre.trim())
    if (item.proveedor_nombre?.trim()) proveedoresNombres.add(item.proveedor_nombre.trim())
    if (item.categoria_nombre?.trim()) categoriasNombres.add(item.categoria_nombre.trim())
    if (item.categoria_dos_nombre?.trim()) categoriasNombres.add(item.categoria_dos_nombre.trim())
  }

  // Traer todas las filas de cada tabla (una query paralela por entidad)
  const [marcasRes, proveedoresRes, categoriasRes] = await Promise.all([
    marcasNombres.size > 0 ? supabase.from('marcas').select('id,nombre') : null,
    proveedoresNombres.size > 0 ? supabase.from('proveedores').select('id,nombre') : null,
    categoriasNombres.size > 0 ? supabase.from('categories').select('id,name') : null,
  ])

  // Construir mapas por nombre normalizado
  const marcaMap = new Map<string, string>()
  const proveedorMap = new Map<string, string>()
  const categoriaMap = new Map<string, string>()

  for (const row of (marcasRes?.data ?? []) as any[]) marcaMap.set(normalizeKey(row.nombre), row.id)
  for (const row of (proveedoresRes?.data ?? []) as any[]) proveedorMap.set(normalizeKey(row.nombre), row.id)
  for (const row of (categoriasRes?.data ?? []) as any[]) categoriaMap.set(normalizeKey(row.name), row.id)

  // Determinar faltantes
  const marcasFaltantes = [...marcasNombres].filter((n) => !marcaMap.has(normalizeKey(n)))
  const proveedoresFaltantes = [...proveedoresNombres].filter((n) => !proveedorMap.has(normalizeKey(n)))
  const categoriasFaltantes = [...categoriasNombres].filter((n) => !categoriaMap.has(normalizeKey(n)))

  // Crear faltantes en lote
  if (marcasFaltantes.length > 0) {
    const { data: created, error } = await supabase
      .from('marcas')
      .insert(marcasFaltantes.map((nombre) => ({ nombre })))
      .select('id,nombre')
    if (error) throw new Error(`No se pudo crear las marcas: ${error.message}`)
    for (const row of (created ?? []) as any[]) marcaMap.set(normalizeKey(row.nombre), row.id)
  }

  if (proveedoresFaltantes.length > 0) {
    const { data: created, error } = await supabase
      .from('proveedores')
      .insert(proveedoresFaltantes.map((nombre) => ({ nombre })))
      .select('id,nombre')
    if (error) throw new Error(`No se pudo crear los proveedores: ${error.message}`)
    for (const row of (created ?? []) as any[]) proveedorMap.set(normalizeKey(row.nombre), row.id)
  }

  if (categoriasFaltantes.length > 0) {
    const { data: created, error } = await supabase
      .from('categories')
      .insert(categoriasFaltantes.map((name) => ({ name, slug: slugify(name) })))
      .select('id,name')
    if (error) throw new Error(`No se pudo crear las categorías: ${error.message}`)
    for (const row of (created ?? []) as any[]) categoriaMap.set(normalizeKey(row.name), row.id)
  }

  return { marcaMap, proveedorMap, categoriaMap }
}

/**
 * Crea múltiples productos en una sola operación (carga masiva por Excel).
 *
 * Lógica optimizada:
 * 1) Resuelve marcas/proveedores/categorías en lote (crea los que falten).
 * 2) Enriquece cada item con los IDs resueltos.
 * 3) Crea productos secuencialmente (Supabase no soporta insert N:N en lote),
 *    sin sleeps y con manejo de errores por fila.
 *
 * Si el Excel trae solo el NOMBRE del proveedor/marca/categoría, se crean
 * automáticamente y se relacionan con el producto por su id.
 */
export async function createProductsBulk(items: ProductInput[]) {
  if (items.length === 0) return { products: [], errors: null }

  const successful: Product[] = []
  const errors: { row: number; error: string }[] = []

  try {
    // Paso 1: Resolver (o crear) las relaciones mencionadas en la carga
    const { marcaMap, proveedorMap, categoriaMap } = await resolveBulkRelations(items)

    // Paso 2: Enriquecer cada item con los IDs resueltos
    const enriched = items.map((item, index) => {
      const marca_id = item.marca_id ?? (item.marca_nombre ? marcaMap.get(normalizeKey(item.marca_nombre)) : null)
      const proveedor_id =
        item.proveedor_id ?? (item.proveedor_nombre ? proveedorMap.get(normalizeKey(item.proveedor_nombre)) : null)

      let category_ids = item.category_ids ?? []
      let categoria_nombre = item.categoria_nombre ?? null
      if (item.categoria_nombre && categoriaMap.has(normalizeKey(item.categoria_nombre))) {
        const id = categoriaMap.get(normalizeKey(item.categoria_nombre))!
        if (!category_ids.includes(id)) category_ids = [...category_ids, id]
        categoria_nombre = null
      }
      if (item.categoria_dos_nombre && categoriaMap.has(normalizeKey(item.categoria_dos_nombre))) {
        const id = categoriaMap.get(normalizeKey(item.categoria_dos_nombre))!
        if (!category_ids.includes(id)) category_ids = [...category_ids, id]
      }
      if (category_ids.length === 0) {
        errors.push({ row: index + 2, error: 'Falta la categoría (o el nombre no se pudo resolver).' })
        return null
      }
      return { ...item, marca_id, proveedor_id, category_ids, categoria_nombre }
    })

    // Paso 3: Crear productos secuencialmente sin sleeps
    for (let i = 0; i < enriched.length; i++) {
      const payload = enriched[i]
      if (!payload) continue
      // i18n desactivado en lote: traducir 500 fichas dentro de UNA petición HTTP
      // la haría caducar. Se internacionalizan después con `npm run i18n:products`.
      const result = await createProduct(payload, { revalidar: false, traducir: false })
      if (result.error) {
        errors.push({ row: i + 2, error: result.error.message })
      } else if (result.data) {
        successful.push(result.data)
      }
    }

    // Una sola revalidación de sitemap para TODO el lote (eficiencia).
    if (successful.length > 0) revalidarSitemap()
  } catch (error: any) {
    // Fallo de resolución previene toda la carga
    for (let i = 0; i < items.length; i++) {
      errors.push({ row: i + 2, error: error.message ?? 'Error procesando el lote.' })
    }
  }

  return { products: successful, errors }
}

/** Obtiene el resumen del inventario. */
export async function getInventorySummary() {
  const supabase = await createServerClient()
  return supabase.from('products').select('id,stock,stock_grams,pricing_type,unit_label')
}

// ---------- Categorías ----------

/** Opciones de resolución i18n (fuente única: lib/constants.ts). */
const I18N_RESOLVE_OPTIONS = { sourceLocale: SOURCE_LOCALE, defaultLocale: DEFAULT_LOCALE }

/** Columnas i18n de categoría (migración 0049). */
const CATEGORY_I18N_COLUMNS = 'name_i18n,slug_i18n,description_i18n,seo_title_i18n,seo_intro_i18n,seo_faq_i18n'

/** ¿El error de PostgREST es por una columna inexistente (migración pendiente)? */
function esColumnaAusente(error: any): boolean {
  const code = error?.code
  const message = String(error?.message ?? '')
  return code === '42703' || /does not exist/i.test(message)
}

/**
 * Ejecuta una consulta de categorías DEGRADANDO la proyección de columnas en
 * cascada hasta que el entorno la soporte.
 *
 * POR QUÉ: un mismo código puede apuntar a varios entornos (dev/prod) con
 * migraciones desincronizadas. Si se selecciona una columna que ese entorno aún
 * no tiene (p. ej. 0047 `seo_*` o 0049 `*_i18n`), la consulta ENTERA falla y la
 * categoría se vuelve invisible (página "no encontrada", sitemap vacío).
 * Con esta cascada el sitio sirve lo que exista y solo pierde la capa opcional.
 *
 * Orden: proyección completa → sin i18n → mínimo viable (id/name/slug).
 *
 * @param build Constructor de la consulta (recibe las columnas a seleccionar).
 * @param baseColumns Columnas base del caso de uso.
 * @param i18nColumns Columnas de traducción (migración 0049).
 */
async function selectCategoriesConFallback<T>(
  build: (columns: string) => PromiseLike<{ data: T | null; error: any }>,
  baseColumns: string,
  i18nColumns: string = CATEGORY_I18N_COLUMNS,
): Promise<{ data: T | null; error: any }> {
  const proyecciones = [`${baseColumns},${i18nColumns}`, baseColumns, 'id,name,slug']

  let resultado = await build(proyecciones[0])
  for (let i = 1; i < proyecciones.length && resultado.error; i += 1) {
    if (!esColumnaAusente(resultado.error)) return resultado
    console.warn(`[catalog] Proyección no disponible en este entorno; se degrada a "${proyecciones[i]}".`)
    resultado = await build(proyecciones[i])
  }
  return resultado
}

/** Entrada del sitemap de categorías (incluye datos i18n para hreflang). */
export type SitemapCategoryItem = {
  slug: string
  lastmod: string
  name_i18n?: Record<string, string> | null
  slug_i18n?: Record<string, string> | null
  name_localizado?: string
}

/** Slug base de categoría + sus traducciones por idioma (para generateStaticParams). */
export type CategorySlugItem = {
  slug: string
  slug_i18n: Record<string, string> | null
}

/**
 * Aplica las traducciones del idioma pedido a una fila de categoría.
 * - `name`/`description`/`seo_*` se resuelven con fallback (pedido → defecto → raíz).
 * - `slug` se mantiene como BASE (identidad de ruta estable, ya indexada); el
 *   slug traducido se expone en `slug_localizado` para el enrutado localizado.
 * Si no se pasa `locale`, devuelve la fila tal cual (comportamiento histórico:
 * cero cambios visibles hasta que el enrutado por idioma los solicite).
 */
function localizarCategoria(row: any, locale?: string): Category {
  if (!locale || !row) return row as Category

  const localizedName = resolveLocalizedValue(row.name_i18n, locale, I18N_RESOLVE_OPTIONS)
  const localizedSlug = resolveLocalizedValue(row.slug_i18n, locale, I18N_RESOLVE_OPTIONS)
  const localizedDescription = resolveLocalizedValue(row.description_i18n, locale, I18N_RESOLVE_OPTIONS)
  const localizedSeoTitle = resolveLocalizedValue(row.seo_title_i18n, locale, I18N_RESOLVE_OPTIONS)
  const localizedSeoIntro = resolveLocalizedValue(row.seo_intro_i18n, locale, I18N_RESOLVE_OPTIONS)
  const localizedFaq = resolveLocalizedList<SeoFaqItem>(row.seo_faq_i18n, locale, I18N_RESOLVE_OPTIONS)

  return {
    ...row,
    name: localizedName || row.name,
    description: localizedDescription || (row.description ?? null),
    seo_title: localizedSeoTitle || (row.seo_title ?? null),
    seo_intro: localizedSeoIntro || (row.seo_intro ?? null),
    seo_faq: localizedFaq.length > 0 ? localizedFaq : (row.seo_faq ?? null),
    slug_localizado: localizedSlug || row.slug,
  } as Category
}

/**
 * Aplica las traducciones del idioma pedido a una fila de producto.
 * - `name`/`titulo_seo`/`description`/`seo_faq` se resuelven con fallback
 *   (pedido → defecto → raíz), de modo que la ficha y su JSON-LD (FAQPage)
 *   viajen en el idioma de la página.
 * - Las categorías anidadas se localizan también (nombre + slug localizado), de
 *   modo que los enlaces internos desde la card apunten a la URL del idioma.
 * Si no se pasa `locale`, devuelve el producto tal cual (cero cambios visibles).
 */
function localizarProducto(row: any, locale?: string): Product {
  const producto = mapProduct(row)
  if (!locale) return producto

  const { name, titulo_seo, description, seo_faq } = resolveProductTranslations(
    row?.translations,
    {
      name: row?.name,
      titulo_seo: row?.titulo_seo,
      description: row?.description,
      seo_faq: row?.seo_faq,
    },
    locale,
    I18N_RESOLVE_OPTIONS,
  )

  return {
    ...producto,
    name: name || producto.name,
    titulo_seo: titulo_seo || producto.titulo_seo,
    description: description || producto.description,
    // FAQ traducida: si el idioma aún no tiene traducción, se conserva la base.
    seo_faq: seo_faq.length > 0 ? seo_faq : (producto.seo_faq ?? null),
    categories: (producto.categories ?? []).map((categoria) =>
      localizarCategoria(categoria as any, locale),
    ),
  }
}

/** Obtiene todas las categorías ordenadas por nombre. Cliente público → SSG+ISR. */
export async function getCategories() {
  const supabase = createPublicClient()
  return supabase.from('categories').select('*').order('name')
}

/**
 * Obtiene solo las categorías activas (para el filtro del catálogo público).
 * Cliente público → SSG+ISR.
 */
export async function getCategoriesActivas(locale?: string) {
  const supabase = createPublicClient()
  const { data, error } = await selectCategoriesConFallback<any>(
    (columns) => supabase.from('categories').select(columns).eq('activa', true).order('name'),
    'id,name,slug,description,activa',
  )
  if (error) return { data: null, error }
  return { data: (data ?? []).map((row: any) => localizarCategoria(row, locale)), error: null }
}

/**
 * Obtiene una categoría activa por su slug exacto (página /categoria/[slug]).
 * Cliente público → SSG+ISR. Devuelve null si no existe o está inactiva.
 *
 * ⚡ `cache()` de React: metadata y página piden la MISMA categoría en el mismo
 * render → una sola consulta por render (y uno de los pasos hace 2 consultas).
 */
export const getCategoryBySlug = cache(async (slug: string, locale?: string) => {
  const supabase = createPublicClient()
  const BASE = 'id,name,slug,description,activa,seo_title,seo_intro,seo_faq,autor'

  // 1) Coincidencia por el slug BASE (URL histórica, ya indexada).
  const { data, error } = await selectCategoriesConFallback<any>(
    (columns) => supabase.from('categories').select(columns).eq('activa', true).eq('slug', slug).maybeSingle(),
    BASE,
  )
  if (error) return { category: null, error }
  if (data) return { category: localizarCategoria(data, locale), error: null }

  // 2) Fallback: slug LOCALIZADO (p. ej. /fr/categoria/souris-gamer).
  if (locale) {
    const { data: localized } = await selectCategoriesConFallback<any>(
      (columns) =>
        supabase
          .from('categories')
          .select(columns)
          .eq('activa', true)
          .contains('slug_i18n', { [baseLanguage(locale)]: slug })
          .maybeSingle(),
      BASE,
    )
    if (localized) return { category: localizarCategoria(localized, locale), error: null }
  }

  return { category: null, error: null }
})

/**
 * Lee el contenido SEO de un hub de categoría (seo_title/seo_intro/seo_faq).
 * Lo usa el pipeline para decidir si aún no tiene intro editorial y hay que
 * generarla. Cliente público → lectura barata.
 */
export async function getCategorySeo(categoryId: string) {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id,seo_title,seo_intro,seo_faq,autor')
    .eq('id', categoryId)
    .maybeSingle()
  if (error) return { data: null, error }
  return {
    data: data as
      | {
          id: string
          seo_title: string | null
          seo_intro: string | null
          seo_faq: SeoFaqItem[] | null
          autor: string | null
        }
      | null,
    error: null,
  }
}

/**
 * Obtiene los slugs de todas las categorías activas para generateStaticParams
 * de las páginas de categoría indexables (/categoria/[slug]).
 */
export async function getCategorySlugs() {
  const supabase = createPublicClient()
  const { data, error } = await selectCategoriesConFallback<any>(
    (columns) => supabase.from('categories').select(columns).eq('activa', true),
    'slug',
    'slug_i18n',
  )
  if (error) return { slugs: [] as string[], items: [] as CategorySlugItem[], error }
  const rows = ((data ?? []) as any[]).filter((row) => row?.slug)
  return {
    slugs: rows.map((row) => String(row.slug)) as string[],
    // Slugs BASE + traducciones: alimentan el generateStaticParams del pSEO,
    // que necesita la URL localizada de cada idioma publicado.
    items: rows.map((row) => ({
      slug: String(row.slug),
      slug_i18n: (row.slug_i18n ?? null) as Record<string, string> | null,
    })) as CategorySlugItem[],
    error: null,
  }
}

/**
 * Cuenta los productos VISIBLES por categoría (relación N:N product_categories).
 * Fuente única para: navegación cross-categoría + no indexar categorías vacías.
 * Cliente público → lectura ligera cacheada por ISR.
 */
async function contarProductosPorCategoria() {
  const supabase = createPublicClient()
  const [{ data: links }, { data: prods }] = await Promise.all([
    supabase.from('product_categories').select('category_id,product_id'),
    supabase.from('products').select('id').eq('is_available', true),
  ])
  // Solo cuentan los productos visibles (evita categorías "fantasma").
  const disponibles = new Set(((prods ?? []) as any[]).map((p) => p.id))
  const counts = new Map<string, number>()
  for (const link of (links ?? []) as any[]) {
    if (!disponibles.has(link.product_id)) continue
    counts.set(link.category_id, (counts.get(link.category_id) ?? 0) + 1)
  }
  return counts
}

/**
 * Navegación cross-categoría: categorías activas CON productos, ordenadas por
 * relevancia (más productos primero). Alimenta el módulo "Explora otras
 * categorías" de la ficha y del hub, evitando enlaces a páginas vacías.
 * Cliente público → SSG+ISR.
 *
 * ⚡ Memoizada ENTRE peticiones (unstable_cache): es idéntica en TODAS las
 * páginas del sitio y antes se pedía una vez por render (2 consultas cada vez).
 * Se invalida con revalidarCacheDeDatos(CATEGORY_NAV_CACHE_TAG) al editar
 * categorías, así los cambios no esperan al ciclo de revalidación.
 */
const readCategoryNav = unstable_cache(
  async (limit: number, locale: string) => {
    const supabase = createPublicClient()
    const [{ data: cats, error }, counts] = await Promise.all([
      selectCategoriesConFallback<any>(
        (columns) => supabase.from('categories').select(columns).eq('activa', true),
        'id,name,slug,description',
      ),
      contarProductosPorCategoria(),
    ])
    // El throw evita cachear un fallo transitorio (unstable_cache no cachea rechazos).
    if (error) throw new Error(error.message)

    return ((cats ?? []) as any[])
      .map((c) => {
        const localized = localizarCategoria(c, locale)
        return {
          id: String(c.id),
          name: String(localized.name ?? c.name),
          // Slug BASE: identidad de ruta estable e indexada.
          slug: String(c.slug),
          // Slug traducido disponible para enlaces localizados (Fase 3).
          slug_localizado: String(localized.slug_localizado ?? c.slug),
          description: (localized.description ?? null) as string | null,
          count: counts.get(c.id) ?? 0,
        }
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, limit)
  },
  ['category-nav'],
  { revalidate: PUBLIC_DATA_REVALIDATE_SECONDS, tags: [CATEGORY_NAV_CACHE_TAG] },
)

/** Tipo de los ítems de navegación (derivado de la lectura cacheada). */
type CategoryNavItems = Awaited<ReturnType<typeof readCategoryNav>>

/**
 * Devuelve la navegación de categorías del idioma pedido.
 * Manejo defensivo: si la lectura falla, el sitio sigue renderizando sin el
 * módulo de navegación (nunca rompe la página ni se cachea el fallo).
 */
export async function getCategoryNav(limit: number = CATEGORY_NAV_LIMIT, locale?: string) {
  const safeLimit = Math.max(Number(limit) || CATEGORY_NAV_LIMIT, 1)
  try {
    return { items: await readCategoryNav(safeLimit, locale ?? DEFAULT_LOCALE), error: null }
  } catch (err: unknown) {
    console.error('Error leyendo la navegación de categorías:', err instanceof Error ? err.message : err)
    return { items: [] as CategoryNavItems, error: null }
  }
}

/**
 * Entradas del sitemap para categorías activas (/categoria/[slug]).
 * Cliente público → SSG+ISR. Devuelve el lastmod REAL (updated_at) para que
 * Google revalide las landings de nicho solo cuando cambian de verdad.
 * SOLO incluye categorías CON productos visibles: indexar páginas vacías
 * (thin content) perjudica el pSEO.
 */
export async function getSitemapCategories(locale?: string) {
  const supabase = createPublicClient()
  const [{ data, error }, counts] = await Promise.all([
    selectCategoriesConFallback<any>(
      (columns) => supabase.from('categories').select(columns).eq('activa', true).order('name'),
      'id,slug,name,updated_at',
      'name_i18n,slug_i18n',
    ),
    contarProductosPorCategoria(),
  ])
  if (error) return { items: [] as SitemapCategoryItem[], error }
  const items: SitemapCategoryItem[] = ((data ?? []) as any[])
    .filter((row) => row?.slug && (counts.get(row.id) ?? 0) > 0)
    .map((row) => ({
      slug: String(row.slug),
      lastmod: (row.updated_at ?? new Date().toISOString()).slice(0, 10),
      // Datos i18n: alimentan el hreflang por idioma del sitemap (Fase 3).
      name_i18n: (row.name_i18n ?? null) as Record<string, string> | null,
      slug_i18n: (row.slug_i18n ?? null) as Record<string, string> | null,
      name_localizado: locale
        ? String(localizarCategoria(row, locale).name ?? row.name ?? row.slug)
        : String(row.name ?? row.slug),
    }))
  return { items, error: null }
}

/**
 * Devuelve una página de productos que pertenecen a una categoría por slug.
 * Cliente público → SSG+ISR. Reutiliza PRODUCT_SELECT + mapProduct.
 * Pensado para la página indexable /categoria/[slug] con paginación.
 */
export async function getProductsByCategorySlug(slug: string, from = 0, locale?: string) {
  const supabase = createPublicClient()

  // 1) Resolver la categoría activa por slug BASE (URL histórica, ya indexada).
  let categoryId: string | null = null
  const { data: cat } = await supabase
    .from('categories')
    .select('id')
    .eq('activa', true)
    .eq('slug', slug)
    .maybeSingle()
  categoryId = cat?.id ?? null

  // 2) Fallback: slug LOCALIZADO del idioma pedido (p. ej. /fr/categoria/...).
  if (!categoryId && locale) {
    const { data: localized } = await supabase
      .from('categories')
      .select('id')
      .eq('activa', true)
      .contains('slug_i18n', { [baseLanguage(locale)]: slug })
      .maybeSingle()
    categoryId = localized?.id ?? null
  }
  if (!categoryId) return { products: [], total: 0, hasMore: false, error: null }

  // 2) Traer los productos visibles de esa categoría (N:N vía product_categories).
  const { data, error, count } = await supabase
    .from('products')
    .select(PRODUCT_SELECT, { count: 'exact' })
    .eq('is_available', true)
    .in('id', await getProductIdsByCategories([categoryId]))
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range(from, from + CATALOG_PAGE_SIZE - 1)
  if (error) return { products: [], total: 0, hasMore: false, error }

  const products = (data ?? []).map((row) => localizarProducto(row, locale))
  const total = count ?? 0
  return { products, total, hasMore: from + products.length < total, error: null }
}


/**
 * Obtiene productos relacionados para el módulo de enlazado interno de la
 * ficha de producto. Devuelve como máximo `RELATED_PRODUCTS_LIMIT` productos
 * visibles de las MISMAS categorías, excluyendo el producto actual.
 * Cliente público → SSG+ISR (el HTML viaja a Google desde el servidor).
 */
export async function getRelatedProducts(input: {
  productId: string
  categoryIds: string[]
  limit?: number
  /** Idioma de los textos resueltos (nombre/título SEO). */
  locale?: string
}) {
  const limit = Math.min(
    Math.max(Number(input.limit) || RELATED_PRODUCTS_LIMIT, 1),
    RELATED_PRODUCTS_LIMIT,
  )
  const supabase = createPublicClient()
  const categoryIds = (input.categoryIds ?? []).filter(Boolean)
  if (categoryIds.length === 0) return { products: [] as Product[], error: null }

  // IDs de los productos de esas categorías, sin el producto actual.
  const ids = (await getProductIdsByCategories(categoryIds)).filter((id) => id !== input.productId)
  if (ids.length === 0) return { products: [] as Product[], error: null }

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_available', true)
    .in('id', ids)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { products: [] as Product[], error }
  return { products: (data ?? []).map((row) => localizarProducto(row, input.locale)), error: null }
}
/**
 * Crea una nueva categoría sembrando su traducción base.
 * El idioma raíz (español, el `name`/`slug` introducidos) queda SIEMPRE presente,
 * de modo que cualquier locale resuelve por fallback hasta que el pipeline o el
 * backfill rellenen el resto de traducciones.
 */
export async function createCategory(payload: CategoryInput) {
  const supabase = await createServerClient()
  const row = {
    ...payload,
    name_i18n: { [SOURCE_LOCALE]: payload.name, ...(payload.name_i18n ?? {}) },
    slug_i18n: { [SOURCE_LOCALE]: payload.slug, ...(payload.slug_i18n ?? {}) },
  }
  const result = await supabase.from('categories').insert(row).select('*').single()
  // La nueva landing de categoría debe entrar al sitemap al instante.
  if (!result.error) {
    revalidarSitemap({ categoriaSlug: payload.slug })
    // La navegación cross-categoría tiene que incluirla ya (no esperar 5 min).
    revalidarCacheDeDatos(CATEGORY_NAV_CACHE_TAG)
  }
  return result
}

/**
 * Actualiza una categoría existente.
 * Si cambia el nombre/slug BASE, sincroniza la clave del idioma raíz para no
 * dejar traducciones desincronizadas, conservando el resto de idiomas.
 */
export async function updateCategory(id: string, payload: CategoryInput) {
  const supabase = await createServerClient()
  const update: Record<string, unknown> = { ...payload, updated_at: new Date().toISOString() }

  if (payload.name || payload.slug) {
    const { data: current } = await supabase
      .from('categories')
      .select('name_i18n,slug_i18n')
      .eq('id', id)
      .maybeSingle()
    const names = {
      ...((current?.name_i18n as Record<string, string> | null) ?? {}),
      ...(payload.name_i18n ?? {}),
    }
    const slugs = {
      ...((current?.slug_i18n as Record<string, string> | null) ?? {}),
      ...(payload.slug_i18n ?? {}),
    }
    if (payload.name) names[SOURCE_LOCALE] = payload.name
    if (payload.slug) slugs[SOURCE_LOCALE] = payload.slug
    update.name_i18n = names
    update.slug_i18n = slugs
  }

  const result = await supabase.from('categories').update(update).eq('id', id).select('*').single()
  // La URL/meta de la categoría cambió: sitemap y landing al instante.
  if (!result.error) {
    revalidarSitemap({ categoriaSlug: payload.slug })
    // El nombre/slug traducido también alimenta la navegación cross-categoría.
    revalidarCacheDeDatos(CATEGORY_NAV_CACHE_TAG)
  }
  return result
}

/** Elimina una categoría (las relaciones N:N se borran en cascada, no los productos). */
export async function deleteCategory(id: string) {
  const supabase = await createServerClient()
  const result = await supabase.from('categories').delete().eq('id', id)
  // Al borrar, la URL deja de existir: se retira del sitemap al instante.
  if (!result.error) {
    revalidarSitemap()
    // La categoría borrada debe desaparecer de la navegación cross-categoría.
    revalidarCacheDeDatos(CATEGORY_NAV_CACHE_TAG)
  }
  return result
}

/**
 * Actualiza el contenido SEO editorial de un hub de categoría
 * (seo_title / seo_intro / seo_faq). Requiere admin — cliente servidor.
 * Se separa del CRUD básico para no exponer estos campos en el editor simple.
 */
export async function updateCategorySeo(
  id: string,
  payload: {
    seo_title?: string | null
    seo_intro?: string | null
    seo_faq?: SeoFaqItem[] | null
    /** Firma editorial del hub (migración 0057). `undefined` = no se toca. */
    autor?: string | null
  },
  options: { slug?: string } = {},
) {
  const supabase = await createServerClient()
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (payload.seo_title !== undefined) row.seo_title = payload.seo_title
  if (payload.seo_intro !== undefined) row.seo_intro = payload.seo_intro
  if (payload.seo_faq !== undefined) row.seo_faq = payload.seo_faq
  // Solo se escribe si viene la clave: así "undefined" (p. ej. una regeneración
  // que no habla del autor) NO pisa la firma ya guardada, y `null` sí la limpia.
  if (payload.autor !== undefined) row.autor = payload.autor
  const result = await supabase.from('categories').update(row).eq('id', id).select('*').single()
  // La landing del hub cambió: se revalida su página y el sitemap al instante.
  if (!result.error) revalidarSitemap({ categoriaSlug: options.slug })
  return result
}
