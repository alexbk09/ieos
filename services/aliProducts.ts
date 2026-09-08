import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { CATALOG_PAGE_SIZE } from '@/lib/constants'
import { PRODUCT_SELECT, mapProduct, slugify } from '@/services/catalog'
import type { Product, ProductInput } from '@/services/catalog'

/**
 * Capa de acceso a productos de afiliados (AliExpress/Amazon).
 * Aísla toda lectura/escritura de la tabla `products` fuera de los
 * componentes (regla de oro). Devuelve SIEMPRE el contrato controlado
 * { success: true, data } | { success: false, error } con try-catch.
 */

export type { Product, ProductInput }

const DEFAULT_PAGE_SIZE = CATALOG_PAGE_SIZE

export const MAX_CATALOG_PAGE_SIZE = 100

/** Sanea la paginación recibida desde UI/API. */
function parsePagination({ limit, offset }: { limit?: number; offset?: number }) {
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), MAX_CATALOG_PAGE_SIZE)
  const safeOffset = Math.max(Number(offset) || 0, 0)
  return { safeLimit, safeOffset }
}

/** Página del catálogo afiliado (visibles) con paginación limpia. */
export async function getProductsCatalog(
  options: { category?: string; limit?: number; offset?: number } = {},
) {
  try {
    const supabase = createPublicClient()
    const { safeLimit, safeOffset } = parsePagination(options)
    let query = supabase
      .from('products')
      .select(PRODUCT_SELECT, { count: 'exact' })
      .eq('is_available', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit - 1)
    if (options.category?.trim()) {
      const { data: cat } = await supabase.from('categories').select('id').eq('slug', options.category.trim()).maybeSingle()
      if (cat?.id) {
        const { data: links } = await supabase.from('product_categories').select('product_id').eq('category_id', cat.id)
        const ids = [...new Set((links ?? []).map((r: any) => r.product_id))]
        query = ids.length > 0 ? query.in('id', ids) : query.in('id', ['00000000-0000-0000-0000-000000000000'])
      }
    }
    const { data, error, count } = await query
    if (error) return { success: false as const, error: error.message }
    return {
      success: true as const,
      data: {
        products: (data ?? []).map((row: any) => mapProduct(row)),
        total: count ?? 0,
        hasMore: safeOffset + (data?.length ?? 0) < (count ?? 0),
        limit: safeLimit,
        offset: safeOffset,
      },
    }
  } catch (err: any) {
    console.error('[aliProducts] getProductsCatalog:', err?.message)
    return { success: false as const, error: err?.message ?? 'Error obteniendo el catálogo.' }
  }
}

export async function insertAutomatedProduct(data: ProductInput) {
  try {
    const { createProduct } = await import('@/services/catalog')
    const r = await createProduct(data)
    if (r.error || !r.data) return { success: false as const, error: r.error?.message ?? 'No insertado.' }
    return { success: true as const, data: r.data }
  } catch (e: any) {
    return { success: false as const, error: e?.message ?? 'Error insertando.' }
  }
}

/** Producto afiliado visible por slug exacto (vista /productos/[slug]). */
export async function getProductBySlug(slug: string) {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_available', true)
      .eq('slug', slug.trim())
      .maybeSingle()
    if (error) return { success: false as const, error: error.message }
    return { success: true as const, data: data ? mapProduct(data) : null }
  } catch (err: any) {
    console.error('[aliProducts] getProductBySlug:', err?.message)
    return { success: false as const, error: err?.message ?? 'Error buscando producto.' }
  }
}

/** Slugs indexables + lastmod para /sitemap.xml (proyección ligera). */
export async function getSitemapProducts() {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase.from('products')
      .select('slug,updated_at,created_at')
      .eq('is_available', true)
      .eq('indexado_google', true)
      .order('created_at', { ascending: false })
    if (error) return { success: false as const, error: error.message }
    const items = ((data ?? []) as any[])
      .filter((r) => r?.slug?.trim())
      .map((r) => ({ slug: r.slug.trim(), lastmod: (r.updated_at ?? r.created_at ?? new Date().toISOString()).slice(0, 10) }))
    return { success: true as const, data: items }
  } catch (err: any) {
    return { success: false as const, error: err?.message ?? 'Error en sitemap.' }
  }
}
