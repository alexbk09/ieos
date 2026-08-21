import { NextResponse } from 'next/server'
import { getCatalogPage } from '@/services/catalog'
import { CATALOG_PAGE_SIZE } from '@/lib/constants'

/**
 * API pública del catálogo con paginación (infinite scroll).
 * Filtros: from, search, slug, minPrice, maxPrice, categories (csv), featured.
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
  const minPrice = minPriceRaw ? Number(minPriceRaw) : undefined
  const maxPrice = maxPriceRaw ? Number(maxPriceRaw) : undefined
  const categoryIds = categoriesRaw ? categoriesRaw.split(',').filter(Boolean) : undefined
  const marcaIds = marcasRaw ? marcasRaw.split(',').filter(Boolean) : undefined

  const result = await getCatalogPage({
    search,
    slug,
    minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
    categoryIds,
    marcaIds,
    featuredOnly: url.searchParams.get('featured') === 'true',
  }, from)

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
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  )
}