import { createPublicClient } from '@/lib/supabase/public'
import { ENTRY_MAX_PAIRS, ENTRY_MAX_PRODUCTS } from '@/lib/constants'
import { seleccionarParesComparables } from '@/lib/entry-rules'
import { contextoAntiDuplicado } from '@/services/entry-dedupe'

/**
 * Brief de una entrada SEO: TODO lo que el modelo necesita saber, tomado del
 * catálogo REAL.
 * ------------------------------------------------------------------
 * POR QUÉ existe esta capa: sin ella la IA inventa productos, precios y marcas
 * (y Google castiga el contenido no contrastado). Aquí solo entran datos que
 * existen en `categories` y `products`; el modelo se limita a ELEGIR el ángulo,
 * los criterios y la redacción.
 *
 * No escribe nada: es una lectura agregada + selección determinista de pares.
 */

/** Producto del brief (solo lo que necesita el prompt). */
export type BriefProduct = {
  id: string
  slug: string
  nombre: string
  tituloSeo: string | null
  precioUsd: number
  /** Especificaciones físicas reales: alimentan la tabla comparativa. */
  especificaciones: Record<string, string>
  keywords: string[]
  categoryIds: string[]
}

/** Nicho del brief. */
export type BriefCategory = {
  id: string
  nombre: string
  slug: string
  descripcion: string | null
  /** Título largo del hub (indica la keyword del nicho). */
  seoTitle: string | null
}

/** Brief completo que se serializa al modelo. */
export type EntryBrief = {
  categorias: BriefCategory[]
  productos: BriefProduct[]
  /** Pares "X vs Y" propuestos (solo dentro del mismo nicho). */
  pares: { categoriaId: string; a: { slug: string; nombre: string }; b: { slug: string; nombre: string } }[]
  /** Contexto anti-duplicado: lo que YA existe y el modelo debe evitar. */
  evitar: { titulos: string[]; slugs: string[]; keywords: string[] }
}

/** Columnas mínimas de producto para el brief (specs + nichos). */
const PRODUCT_BRIEF_SELECT =
  'id,name,slug,titulo_seo,price_usd,stock,specifications,seo_keywords,product_categories(category_id)'

/** Convierte una fila de producto en el producto del brief. */
function mapBriefProduct(row: any): BriefProduct {
  return {
    id: row.id,
    slug: row.slug,
    nombre: row.name,
    tituloSeo: row.titulo_seo ?? null,
    precioUsd: Number(row.price_usd ?? 0),
    especificaciones:
      row.specifications && typeof row.specifications === 'object' ? row.specifications : {},
    keywords: Array.isArray(row.seo_keywords) ? row.seo_keywords.filter(Boolean) : [],
    categoryIds: ((row.product_categories ?? []) as any[])
      .map((link) => link?.category_id)
      .filter(Boolean),
  }
}

// ---------- Lecturas del brief ----------

/** Lee nichos por id (nombre, slug y contexto editorial del hub). */
async function fetchBriefCategories(categoryIds: string[]) {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id,name,slug,description,seo_title')
    .in('id', categoryIds)
  if (error) return { categories: [] as BriefCategory[], error }
  const categories = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    nombre: row.name,
    slug: row.slug,
    descripcion: row.description ?? null,
    seoTitle: row.seo_title ?? null,
  }))
  return { categories, error: null }
}

/** Lee productos concretos (los que el administrador ya eligió). */
async function fetchBriefProductsByIds(productIds: string[]) {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_BRIEF_SELECT)
    .in('id', productIds)
    .eq('is_available', true)
  if (error) return { products: [] as BriefProduct[], error }
  return { products: ((data ?? []) as any[]).map(mapBriefProduct), error: null }
}

/** Lee los mejores productos disponibles de un conjunto de nichos. */
async function fetchBriefProductsByCategories(categoryIds: string[], limit: number) {
  const supabase = createPublicClient()
  // 1) IDs de producto de esos nichos (tabla puente).
  const { data: links, error: linkError } = await supabase
    .from('product_categories')
    .select('product_id')
    .in('category_id', categoryIds)
  if (linkError) return { products: [] as BriefProduct[], error: linkError }

  const ids = [...new Set(((links ?? []) as any[]).map((link) => link.product_id))].filter(Boolean)
  if (ids.length === 0) return { products: [] as BriefProduct[], error: null }

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_BRIEF_SELECT)
    .in('id', ids)
    .eq('is_available', true)
    // Curaduría primero: los productos que la tienda ya destaca son los que
    // conviene comparar (mejor ficha y más clics reales).
    .order('sort_order', { ascending: true })
    .order('rating_average', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) return { products: [] as BriefProduct[], error }
  return { products: ((data ?? []) as any[]).map(mapBriefProduct), error: null }
}

/**
 * Elige el nicho cuando el administrador deja decidir a la IA:
 * el nicho ACTIVO con más productos disponibles (más material para comparar).
 */
async function fetchCategoriaAuto() {
  const supabase = createPublicClient()
  const { data: categories, error } = await supabase
    .from('categories')
    .select('id,name,slug,description,seo_title')
    .eq('activa', true)
    .order('name')
    .limit(50)
  if (error) return { categories: [] as BriefCategory[], error }

  const ids = ((categories ?? []) as any[]).map((row) => row.id)
  if (ids.length === 0) return { categories: [] as BriefCategory[], error: null }

  const { products } = await fetchBriefProductsByCategories(ids, ENTRY_MAX_PRODUCTS * 8)
  const conteo = new Map<string, number>()
  for (const producto of products) {
    for (const categoryId of producto.categoryIds) {
      conteo.set(categoryId, (conteo.get(categoryId) ?? 0) + 1)
    }
  }

  // Solo nichos con material suficiente para una comparación real (>= 2).
  const elegida = ((categories ?? []) as any[])
    .filter((row) => (conteo.get(row.id) ?? 0) >= 2)
    .sort((a, b) => (conteo.get(b.id) ?? 0) - (conteo.get(a.id) ?? 0))[0]
  if (!elegida) return { categories: [] as BriefCategory[], error: null }

  const detalle: BriefCategory[] = [
    {
      id: elegida.id,
      nombre: elegida.name,
      slug: elegida.slug,
      descripcion: elegida.description ?? null,
      seoTitle: elegida.seo_title ?? null,
    },
  ]
  return { categories: detalle, error: null }
}

// ---------- API pública ----------

/**
 * Construye el brief de una entrada. Prioridad de selección:
 *  1. `productIds` → esos productos (elección explícita del administrador).
 *  2. `categoryIds` → los mejores productos de esos nichos.
 *  3. Nada → el nicho activo con más productos ("deja que la IA decida").
 *
 * @returns { success, data: EntryBrief } o { success: false, error }.
 */
export async function buildEntryBrief(input: {
  tipo?: string
  categoryIds?: string[]
  productIds?: string[]
}): Promise<{ success: true; data: EntryBrief } | { success: false; error: string }> {
  try {
    const maxProductos = ENTRY_MAX_PRODUCTS
    const productIds = (input.productIds ?? []).filter(Boolean)
    let categoryIds = (input.categoryIds ?? []).filter(Boolean)
    let products: BriefProduct[] = []

    if (productIds.length > 0) {
      // 1) El administrador ya eligió: se respeta su selección.
      const result = await fetchBriefProductsByIds(productIds)
      if (result.error) return { success: false, error: result.error.message }
      products = result.products
    } else {
      // 2/3) Se eligen productos (por nicho pedido o por nicho automático).
      if (categoryIds.length === 0) {
        const auto = await fetchCategoriaAuto()
        if (auto.error) return { success: false, error: auto.error.message }
        categoryIds = auto.categories.map((categoria) => categoria.id)
      }
      if (categoryIds.length > 0) {
        const result = await fetchBriefProductsByCategories(categoryIds, maxProductos * 3)
        if (result.error) return { success: false, error: result.error.message }
        products = result.products
      }
    }

    products = products.slice(0, maxProductos)
    if (products.length < 2) {
      return {
        success: false,
        error:
          'No hay al menos 2 productos disponibles para comparar. Elige otro nicho o revisa el catálogo.',
      }
    }

    // Los nichos del brief son la unión de los elegidos y los de los productos:
    // así la entrada SIEMPRE queda enlazada a nichos reales (enlazado interno).
    const categoryIdsFinal = [
      ...new Set<string>([...categoryIds, ...products.flatMap((p) => p.categoryIds)]),
    ]
    const categoriesResult = await fetchBriefCategories(categoryIdsFinal)
    if (categoriesResult.error) return { success: false, error: categoriesResult.error.message }

    const pares = seleccionarParesComparables(
      products.map((producto) => ({ id: producto.id, categoryIds: producto.categoryIds })),
      { maxPares: ENTRY_MAX_PAIRS },
    )
      .map((par) => {
        const a = products.find((producto) => producto.id === par.a.id)
        const b = products.find((producto) => producto.id === par.b.id)
        if (!a || !b) return null
        return { categoriaId: par.categoriaId, a: { slug: a.slug, nombre: a.nombre }, b: { slug: b.slug, nombre: b.nombre } }
      })
      .filter(Boolean) as EntryBrief['pares']

    const evitar = await contextoAntiDuplicado()

    return {
      success: true,
      data: {
        categorias: categoriesResult.categories,
        productos: products,
        pares,
        evitar: { titulos: evitar.titulos, slugs: evitar.slugs, keywords: evitar.keywords },
      },
    }
  } catch (err: any) {
    console.error('[entry-brief] buildEntryBrief:', err?.message)
    return { success: false, error: err?.message ?? 'Error construyendo el brief de la entrada.' }
  }
}
