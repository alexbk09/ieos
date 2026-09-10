import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { CATALOG_PAGE_SIZE, SITEMAP_MAX_IMAGES_PER_URL, SOURCE_LOCALE } from '@/lib/constants'
import { revalidarSitemap } from '@/lib/sitemap-revalidate'
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

/**
 * Verifica si un ID de producto AliExpress ya existe en el catálogo.
 * Usa la columna `asin` como clave única (varchar(50)) para no duplicar
 * productos ni gastar créditos del proxy/DeepSeek en re-procesos.
 */
export async function existeProductoAliExpress(aliProductId: string) {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .eq('asin', String(aliProductId).trim())
      .maybeSingle()
    if (error) return { success: false as const, error: error.message }
    return { success: true as const, existe: Boolean(data), productoId: data?.id ?? null }
  } catch (err: any) {
    console.error('[aliProducts] existeProductoAliExpress:', err?.message)
    return { success: false as const, error: err?.message ?? 'Error verificando duplicado.' }
  }
}

/**
 * Convierte una keyword semilla en un nombre de categoría legible.
 * Ej: "tira led rgb" -> "Tira Led RGB". Mantiene acrónimos comunes en mayúscula.
 */
function nombreCategoriaDesdeKeyword(keyword: string): string {
  const palabras = keyword.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return 'Importados AliExpress'
  const ACRONIMOS = new Set(['rgb', 'led', 'usb', 'hdmi', 'wifi', 'diy', '3d', '4k', '8k', 'ip', 'tv'])
  return palabras
    .map((palabra) => {
      const limpia = palabra.replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ]/g, '')
      if (!limpia) return ''
      const clave = limpia.toLowerCase()
      if (ACRONIMOS.has(clave)) return clave.toUpperCase()
      return limpia.charAt(0).toUpperCase() + limpia.slice(1)
    })
    .filter(Boolean)
    .join(' ')
}

/**
 * Crea (o reutiliza) la categoría del nicho derivada de la keyword semilla.
 * Así cada producto automatizado queda en una categoría real y filtrable
 * (ej: "tira led rgb" -> categoría "Tira Led RGB"), en lugar de amontonar
 * todo en una genérica. Si no hay keyword, usa "Importados AliExpress".
 *
 * El producto se relaciona luego por la tabla N:N `product_categories`
 * (igual que las marcas por FK), de modo que el filtro del catálogo público
 * por categoría lo encuentra.
 */
export async function obtenerCategoriaAliExpress(keyword?: string) {
  try {
    const supabase = await createServerClient()
    const nombre = nombreCategoriaDesdeKeyword(keyword ?? '')
    const slug = slugify(nombre)
    const { data: existente } = await supabase.from('categories').select('id,name_i18n').eq('slug', slug).maybeSingle()
    if (existente?.id) {
      // La categoría ya existe: se asegura su traducción base (idioma raíz) para
      // nichos creados antes de la migración 0049. Idempotente: solo si falta.
      const names = (existente.name_i18n ?? {}) as Record<string, string>
      if (!names[SOURCE_LOCALE]) {
        await supabase
          .from('categories')
          .update({ name_i18n: { ...names, [SOURCE_LOCALE]: nombre } })
          .eq('id', existente.id)
      }
      return { success: true as const, categoriaId: existente.id, nombre }
    }
    const { data: creada, error: errorCreacion } = await supabase
      .from('categories')
      .insert({
        name: nombre,
        slug,
        description: `Productos del nicho "${keyword ?? 'AliExpress'}" descubiertos y optimizados por el pipeline automatizado.`,
        // Traducción base (idioma raíz): el nicho nace internacionalizable.
        // El resto de idiomas los completa traducirCategoria() en el pipeline.
        name_i18n: { [SOURCE_LOCALE]: nombre },
        slug_i18n: { [SOURCE_LOCALE]: slug },
      })
      .select('id')
      .single()
    if (errorCreacion || !creada) return { success: false as const, error: errorCreacion?.message ?? 'No se pudo crear categoria.' }
    // Categoría nueva creada por el pipeline: se añade al sitemap al instante.
    revalidarSitemap({ categoriaSlug: slug })
    return { success: true as const, categoriaId: creada.id, nombre }
  } catch (err: any) {
    console.error('[aliProducts] obtenerCategoriaAliExpress:', err?.message)
    return { success: false as const, error: err?.message ?? 'Error obteniendo categoria.' }
  }
}

/**
 * Resuelve (o crea) la marca detectada en el scraper/API y devuelve su id.
 * Así cada producto automatizado queda vinculado a una marca real y filtrable
 * en el catálogo público (FK `products.marca_id` -> `marcas.id`), en lugar de
 * guardarse con marca NULL. Si el nombre es genérico o vacío, devuelve null
 * (el producto se guarda sin marca, sin romper el flujo).
 *
 * @param nombreMarca Nombre de marca detectado (ej: "Xiaomi", "Anker").
 * @returns { success, marcaId | null } — marcaId null si no hay marca útil.
 */
export async function obtenerMarcaAliExpress(nombreMarca?: string | null) {
  try {
    const nombre = (nombreMarca ?? '').trim()
    if (!nombre) return { success: true as const, marcaId: null }
    const supabase = await createServerClient()
    // Buscar por nombre exacto (case-insensitive) para reutilizar la marca.
    const { data: existente } = await supabase
      .from('marcas')
      .select('id')
      .ilike('nombre', nombre)
      .maybeSingle()
    if (existente?.id) return { success: true as const, marcaId: existente.id }
    // Crear la marca nueva (activa por defecto para que aparezca en filtros).
    const { data: creada, error: errorCreacion } = await supabase
      .from('marcas')
      .insert({ nombre, activa: true })
      .select('id')
      .single()
    if (errorCreacion || !creada) {
      console.error('[aliProducts] obtenerMarcaAliExpress crear:', errorCreacion?.message)
      return { success: false as const, error: errorCreacion?.message ?? 'No se pudo crear la marca.' }
    }
    return { success: true as const, marcaId: creada.id }
  } catch (err: any) {
    console.error('[aliProducts] obtenerMarcaAliExpress:', err?.message)
    return { success: false as const, error: err?.message ?? 'Error resolviendo marca.' }
  }
}

/**
 * Ordena y des-duplica las imágenes de un producto para el sitemap.
 * Prioriza la imagen principal (image_url) y luego la galería product_images
 * ordenada por sort_order. Devuelve URLs crudas (el sitemap las absolutiza).
 */
function buildSitemapImageUrls(row: any): string[] {
  const gallery = ((row?.product_images ?? []) as any[])
    .slice()
    .sort((a, b) => Number(a?.sort_order ?? 0) - Number(b?.sort_order ?? 0))
    .map((img) => img?.url)

  const candidates = [row?.image_url, ...gallery].filter(Boolean) as string[]
  const unique: string[] = []
  for (const candidate of candidates) {
    const clean = String(candidate).trim()
    if (clean && !unique.includes(clean)) unique.push(clean)
  }
  return unique.slice(0, SITEMAP_MAX_IMAGES_PER_URL)
}

/**
 * Entradas del sitemap (/sitemap.xml) para productos indexables.
 * Proyección LIGERA con cliente público → solo columnas necesarias:
 *  - slug + lastmod REAL (updated_at/created_at) para priorizar el crawl.
 *  - imágenes de la galería → habilita el sitemap de imágenes de Google
 *    (Google Imágenes / fichas de producto de afiliado).
 * Filtra is_available = true e indexado_google = true para que el sitemap
 * contenga EXACTAMENTE las URLs que la ficha marca como index (sin noindex).
 */
export async function getSitemapProducts() {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase.from('products')
      .select('slug,updated_at,created_at,image_url,product_images(url,sort_order)')
      .eq('is_available', true)
      .eq('indexado_google', true)
      .order('created_at', { ascending: false })
    if (error) return { success: false as const, error: error.message }
    const items = ((data ?? []) as any[])
      .filter((r) => r?.slug?.trim())
      .map((r) => ({
        slug: r.slug.trim(),
        lastmod: (r.updated_at ?? r.created_at ?? new Date().toISOString()).slice(0, 10),
        images: buildSitemapImageUrls(r),
      }))
    return { success: true as const, data: items }
  } catch (err: any) {
    return { success: false as const, error: err?.message ?? 'Error en sitemap.' }
  }
}
