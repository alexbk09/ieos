import { NextResponse } from 'next/server'
import { getCatalogPage } from '@/services/catalog'
import { CATALOG_PAGE_SIZE, CATALOG_TOP_RATED_MIN, isCatalogSortValue } from '@/lib/constants'
import { isPublishedLocale } from '@/lib/i18n-config'

/**
 * API pública del catálogo con paginación (infinite scroll).
 * Filtros: from, search, slug, minPrice, maxPrice, categories (csv), marcas (csv),
 * featured/onSale/topRated/inStock/bulk (booleanos), sort (ver CATALOG_SORT_OPTIONS), locale.
 * `locale` (validado contra los idiomas PUBLICADOS) resuelve los textos traducidos;
 * al viajar en la query, la caché de CDN se segmenta por idioma automáticamente.
 * Cacheada en CDN por 60s con stale-while-revalidate (300s).
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const from = Math.max(0, Number(url.searchParams.get('from') || 0) || 0)
  const search = url.searchParams.get('search')?.trim() || undefined
  const slug = url.searchParams.get('slug')?.trim() || undefined
  const minPriceRaw = url.searchParams.get('minPrice')
  const maxPriceRaw = url.searchParams.get('maxPrice')
  const categoriesRaw = url.searchParams.get('categories')
  const marcasRaw = url.searchParams.get('marcas')
  // Solo idiomas publicados: evita cache poisoning con valores arbitrarios.
  const localeRaw = url.searchParams.get('locale')?.trim() || ''
  const locale = isPublishedLocale(localeRaw) ? localeRaw : undefined
  // Orden validado contra la lista blanca: cualquier valor inválido cae al por defecto.
  const sortRaw = url.searchParams.get('sort')?.trim() || ''
  const sort = isCatalogSortValue(sortRaw) ? sortRaw : undefined
  const minPrice = minPriceRaw ? Number(minPriceRaw) : undefined
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined
  const categoryIds = categoriesRaw ? categoriesRaw.split(',').filter(Boolean) : undefined
  const marcaIds = marcasRaw ? marcasRaw.split(',').filter(Boolean) : undefined
  // Facetas de valor: se activan con `?clave=true` (ver CATALOG_QUICK_FILTERS).
  // `topRated` se traduce a una valoración mínima para no exponer el umbral en la URL.
  const topRated = url.searchParams.get('topRated') === 'true'

  const result = await getCatalogPage({
    search,
    slug,
    minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
    categoryIds,
    marcaIds,
    sort,
    featuredOnly: url.searchParams.get('featured') === 'true',
    onSaleOnly: url.searchParams.get('onSale') === 'true',
    minRating: topRated ? CATALOG_TOP_RATED_MIN : undefined,
    inStockOnly: url.searchParams.get('inStock') === 'true',
    bulkOnly: url.searchParams.get('bulk') === 'true',
  }, from, locale)

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 })
  }

  return NextResponse.json(
    {
      products: result.products,
      total: result.total,
      hasMore: result.hasMore,
      pageSize: CATALOG_PAGE_SIZE,
      from,
    },
    {
   /*    headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      }, */
      headers: {
      // Sube el tiempo fresco a 1 día (86400s) y el margen de espera a 1 día
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
      'CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
    },
    },
  )
}