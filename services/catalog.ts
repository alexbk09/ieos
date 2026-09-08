import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { CATALOG_PAGE_SIZE, FEATURED_PRODUCTS_LIMIT } from '@/lib/constants'

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
}

export type CategoryInput = {
  name: string
  slug: string
  description?: string | null
  activa?: boolean
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
}

const PRODUCT_SELECT =
  '*, product_categories(categories(id,name,slug,description)), product_images(id,url,alt_text,sort_order,color_name), marcas(id,nombre,activa), proveedores(id,nombre,rif,activo)'

/** Convierte una fila de Supabase en Product tipado. */
function mapProduct(row: any): Product {
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
    low_stock_threshold: Number(row.low_stock_threshold ?? 10),
    sku: row.sku ?? null,
    bar_code: row.bar_code ?? null,
    bulk_discount_percent: Number(row.bulk_discount_percent ?? 0),
    sort_order: Number(row.sort_order ?? 0),
    weight_grams: row.weight_grams != null ? Number(row.weight_grams) : null,
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
export async function getFeaturedProducts() {
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
    .eq('is_available', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .range(from, from + CATALOG_PAGE_SIZE - 1)

  if (filters.search) query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
  if (filters.slug) query = query.ilike('slug', `%${filters.slug}%`)
  if (filters.minPrice !== undefined && Number.isFinite(filters.minPrice)) query = query.gte('price_usd', filters.minPrice)
  if (filters.maxPrice !== undefined && Number.isFinite(filters.maxPrice)) query = query.lte('price_usd', filters.maxPrice)
  if (filters.featuredOnly) query = query.eq('featured', true)
  if (filters.categoryIds && filters.categoryIds.length > 0) query = query.in('id', await getProductIdsByCategories(filters.categoryIds))
  if (filters.marcaIds && filters.marcaIds.length > 0) query = query.in('marca_id', filters.marcaIds)

  const { data, error, count } = await query
  if (error) return { products: null, total: 0, hasMore: false, error }

  const products = (data ?? []).map(mapProduct)
  const total = count ?? 0
  return { products, total, hasMore: from + products.length < total, error: null }
}

/** Slug simple desde un texto (minúsculas, sin acentos, guiones). */
function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `item-${Date.now()}`
  )
}

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
  }
}

/**
 * Crea un producto con sus categorías (N:N), imágenes múltiples,
 * marca y proveedor. Requiere sesión de admin — usa cliente servidor.
 */
export async function createProduct(payload: ProductInput) {
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
  return { data: mapProduct(full ?? data) }
}

/** Elimina un producto (las relaciones N:N e imágenes se borran en cascada). */
export async function deleteProduct(id: string) {
  const supabase = await createServerClient()
  return supabase.from('products').delete().eq('id', id)
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
      const result = await createProduct(payload)
      if (result.error) {
        errors.push({ row: i + 2, error: result.error.message })
      } else if (result.data) {
        successful.push(result.data)
      }
    }
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

/** Obtiene todas las categorías ordenadas por nombre. Cliente público → SSG+ISR. */
export async function getCategories() {
  const supabase = createPublicClient()
  return supabase.from('categories').select('*').order('name')
}

/**
 * Obtiene solo las categorías activas (para el filtro del catálogo público).
 * Cliente público → SSG+ISR.
 */
export async function getCategoriesActivas() {
  const supabase = createPublicClient()
  return supabase.from('categories').select('id,name,slug').eq('activa', true).order('name')
}

/** Crea una nueva categoría. */
export async function createCategory(payload: CategoryInput) {
  const supabase = await createServerClient()
  return supabase.from('categories').insert(payload).select('*').single()
}

/** Actualiza una categoría existente. */
export async function updateCategory(id: string, payload: CategoryInput) {
  const supabase = await createServerClient()
  return supabase
    .from('categories')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
}

/** Elimina una categoría (las relaciones N:N se borran en cascada, no los productos). */
export async function deleteCategory(id: string) {
  const supabase = await createServerClient()
  return supabase.from('categories').delete().eq('id', id)
}