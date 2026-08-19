import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { CATALOG_PAGE_SIZE, FEATURED_PRODUCTS_LIMIT } from '@/lib/constants'

/**
 * Servicio de catálogo.
 * Capa única de acceso a Supabase para productos y categorías.
 * Los componentes NUNCA deben llamar a supabase.from() directamente.
 * Las consultas públicas (portada, catálogo, categorías) usan el cliente público (SSG+ISR).
 */

// ---------- Tipos ----------
export type ProductImage = {
  id: string
  url: string
  alt_text: string | null
  sort_order: number
}

export type Product = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  image_url: string | null
  category_id: string | null
  featured: boolean
  categories?: Category[]
  images?: ProductImage[]
  colors?: string[]
  specifications?: Record<string, string>
}

export type Category = {
  id: string
  name: string
  slug: string
  description: string | null
}

export type ProductInput = {
  name: string
  slug: string
  description?: string | null
  price_usd: number
  stock: number
  image_url?: string | null
  featured?: boolean
  category_ids?: string[]
  images?: string[]
  colors?: string[]
  specifications?: Record<string, string>
}

/** Filtros del catálogo público. */
export type CatalogFilters = {
  search?: string
  slug?: string
  minPrice?: number
  maxPrice?: number
  categoryIds?: string[]
  featuredOnly?: boolean
}

const PRODUCT_SELECT = '*, product_categories(categories(id,name,slug,description)), product_images(id,url,alt_text,sort_order)'

/** Convierte una fila de Supabase en Product tipado. */
function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price_usd: Number(row.price_usd),
    stock: row.stock,
    image_url: row.image_url,
    category_id: row.category_id,
    featured: row.featured,
    colors: row.colors ?? [],
    specifications: row.specifications ?? {},
    categories: row.product_categories?.map((pc: any) => pc.categories).filter(Boolean) ?? row.categories ?? [],
    images: row.product_images?.map((pi: any) => ({ id: pi.id, url: pi.url, alt_text: pi.alt_text, sort_order: pi.sort_order })).sort((a: any, b: any) => a.sort_order - b.sort_order) ?? [],
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
export async function getFeaturedProducts() {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('featured', true)
    .order('created_at', { ascending: false })
    .limit(FEATURED_PRODUCTS_LIMIT)
  if (error) return { products: null, error }
  return { products: (data ?? []).map(mapProduct), error: null }
}

/** Obtiene los IDs de productos que pertenecen a las categorías dadas. */
async function getProductIdsByCategories(categoryIds: string[]) {
  const supabase = createPublicClient()
  const { data } = await supabase.from('product_categories').select('product_id').in('category_id', categoryIds)
  return [...new Set((data ?? []).map((row: any) => row.product_id))]
}

/**
 * Devuelve una página del catálogo con filtros aplicados.
 * Pensado para infinite scroll: entrega 10 productos por llamada.
 * Cliente público → SSG+ISR.
 */
export async function getCatalogPage(filters: CatalogFilters = {}, from = 0) {
  const supabase = createPublicClient()

  let query = supabase
    .from('products')
    .select(PRODUCT_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + CATALOG_PAGE_SIZE - 1)

  if (filters.search) query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
  if (filters.slug) query = query.ilike('slug', `%${filters.slug}%`)
  if (filters.minPrice !== undefined && Number.isFinite(filters.minPrice)) query = query.gte('price_usd', filters.minPrice)
  if (filters.maxPrice !== undefined && Number.isFinite(filters.maxPrice)) query = query.lte('price_usd', filters.maxPrice)
  if (filters.featuredOnly) query = query.eq('featured', true)
  if (filters.categoryIds && filters.categoryIds.length > 0) query = query.in('id', await getProductIdsByCategories(filters.categoryIds))

  const { data, error, count } = await query
  if (error) return { products: null, total: 0, hasMore: false, error }

  const products = (data ?? []).map(mapProduct)
  const total = count ?? 0
  return { products, total, hasMore: from + products.length < total, error: null }
}

/**
 * Crea un producto con sus categorías (N:N) e imágenes múltiples.
 * Requiere sesión de admin — usa cliente servidor.
 */
export async function createProduct(payload: ProductInput) {
  const supabase = await createServerClient()

  const categoryIds = payload.category_ids?.filter(Boolean) ?? []
  if (categoryIds.length === 0) {
    return { error: { message: 'Selecciona al menos una categoría para el producto.' } }
  }

  const images = payload.images?.filter(Boolean) ?? []
  const firstImage = images[0] ?? payload.image_url ?? null

  const { data, error } = await supabase
    .from('products')
    .insert({
      name: payload.name,
      slug: payload.slug,
      description: payload.description ?? null,
      price_usd: payload.price_usd,
      stock: payload.stock,
      image_url: firstImage,
      category_id: categoryIds[0],
      featured: payload.featured ?? false,
      colors: payload.colors ?? [],
      specifications: payload.specifications ?? {},
    })
    .select(PRODUCT_SELECT)
    .single()
  if (error || !data) return { error: error ?? { message: 'No se pudo crear el producto.' } }

  const { error: relError } = await supabase
    .from('product_categories')
    .insert(categoryIds.map((category_id) => ({ product_id: data.id, category_id })))
  if (relError) return { error: relError }

  if (images.length > 0) {
    const { error: imgError } = await supabase
      .from('product_images')
      .insert(images.map((url, index) => ({ product_id: data.id, url, sort_order: index })))
    if (imgError) return { error: imgError }
  }

  const { data: full } = await supabase.from('products').select(PRODUCT_SELECT).eq('id', data.id).single()
  return { data: mapProduct(full ?? data) }
}

/**
 * Actualiza un producto incluyendo sus categorías (N:N) e imágenes.
 * Requiere sesión de admin — usa cliente servidor.
 */
export async function updateProduct(id: string, payload: ProductInput) {
  const supabase = await createServerClient()

  const categoryIds = payload.category_ids?.filter(Boolean) ?? []
  if (categoryIds.length === 0) {
    return { error: { message: 'Selecciona al menos una categoría para el producto.' } }
  }

  const images = payload.images?.filter(Boolean) ?? []
  const firstImage = images[0] ?? payload.image_url ?? null

  const { data, error } = await supabase
    .from('products')
    .update({
      name: payload.name,
      slug: payload.slug,
      description: payload.description ?? null,
      price_usd: payload.price_usd,
      stock: payload.stock,
      image_url: firstImage,
      category_id: categoryIds[0],
      featured: payload.featured ?? false,
      colors: payload.colors ?? [],
      specifications: payload.specifications ?? {},
    })
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
  if (images.length > 0) {
    const { error: imgError } = await supabase
      .from('product_images')
      .insert(images.map((url, index) => ({ product_id: id, url, sort_order: index })))
    if (imgError) return { error: imgError }
  }

  const { data: full } = await supabase.from('products').select(PRODUCT_SELECT).eq('id', id).single()
  return { data: mapProduct(full ?? data) }
}

/** Elimina un producto (las relaciones N:N e imágenes se borran en cascada). */
export async function deleteProduct(id: string) {
  const supabase = await createServerClient()
  return supabase.from('products').delete().eq('id', id)
}

/** Obtiene el resumen del inventario. */
export async function getInventorySummary() {
  const supabase = await createServerClient()
  return supabase.from('products').select('id,stock')
}

// ---------- Categorías ----------

/** Obtiene todas las categorías ordenadas por nombre. Cliente público → SSG+ISR. */
export async function getCategories() {
  const supabase = createPublicClient()
  return supabase.from('categories').select('*').order('name')
}

/** Crea una nueva categoría. */
export async function createCategory(payload: Pick<Category, 'name' | 'slug' | 'description'>) {
  const supabase = await createServerClient()
  return supabase.from('categories').insert(payload).select('*').single()
}

/** Actualiza una categoría existente. */
export async function updateCategory(id: string, payload: Pick<Category, 'name' | 'slug' | 'description'>) {
  const supabase = await createServerClient()
  return supabase.from('categories').update(payload).eq('id', id).select('*').single()
}

/** Elimina una categoría (las relaciones N:N se borran en cascada, no los productos). */
export async function deleteCategory(id: string) {
  const supabase = await createServerClient()
  return supabase.from('categories').delete().eq('id', id)
}