import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de analítica de productos (solo servidor).
 *
 * Da al panel administrativo la lectura agregada de las interacciones
 * registradas por los clientes (vistas, clics de card, agregados al
 * carrito, salidas a AliExpress/Amazon/store, impresiones IA y términos
 * de búsqueda). Toda escritura de eventos ocurre en las capas públicas
 * (/api/analytics/track y RPC seguras); este módulo solo LEE.
 *
 * NUNCA se consulta Supabase desde componentes; las páginas usan este
 * servicio (regla de oro /services).
 */

export type MetricRow = {
  product_id: string
  name: string
  slug: string
  image_url: string | null
  views_count: number
  card_clicks_count: number
  add_to_cart_count: number
  aliexpress_clicks_count: number
  amazon_clicks_count: number
  store_clicks_count: number
  ai_impressions_count: number
  total_interactions: number
}

export type SearchRow = {
  query: string
  source: string
  total_queries: number
}

export type DailyTrend = {
  day: string
  views_count: number
  card_clicks_count: number
  add_to_cart_count: number
  affiliate_clicks_count: number
  ai_impressions_count: number
}

export type ProductAnalyticsResult = {
  desde: string
  hasta: string
  summary: {
    total_views: number
    total_card_clicks: number
    total_add_to_cart: number
    total_ali_clicks: number
    total_amazon_clicks: number
    total_store_clicks: number
    total_affiliate_clicks: number
    total_ai_impressions: number
    total_searches: number
  }
  topProducts: MetricRow[]
  topSearches: SearchRow[]
  trend: DailyTrend[]
}

/**
 * Obtiene el reporte completo de analítica de productos para un período.
 * @param desde Fecha ISO (YYYY-MM-DD) de inicio (inclusive).
 * @param hasta Fecha ISO (YYYY-MM-DD) de fin (inclusive).
 */
export async function getProductAnalytics({ desde, hasta }: { desde: string; hasta: string }): Promise<{ data: ProductAnalyticsResult | null; error: { message: string } | null }> {
  try {
    const supabase = await createServerClient()

    // 1) Métricas por producto en el período (suma diaria → total).
    const { data: metrics, error: metricsError } = await supabase
      .from('product_daily_analytics')
      .select(`
        product_id,
        views_count,
        product_card_clicks_count,
        add_to_cart_count,
        aliexpress_clicks_count,
        amazon_clicks_count,
        store_clicks_count,
        ai_impressions_count,
        products!inner (
          id, name, slug, image_url
        )
      `)
      .gte('day', desde)
      .lte('day', hasta)
      .order('views_count', { ascending: false })

    if (metricsError) return { data: null, error: { message: metricsError.message } }

    // 2) Términos de búsqueda (top 50 por volumen en el período).
    const { data: searches, error: searchesError } = await supabase
      .from('product_search_logs')
      .select('query, source, id')
      .gte('search_day', desde)
      .lte('search_day', hasta)

    if (searchesError) return { data: null, error: { message: searchesError.message } }

    // 3) Tendencia diaria (últimos 14 días dentro del rango).
    const { data: daily, error: dailyError } = await supabase
      .from('product_daily_analytics')
      .select('day, views_count, product_card_clicks_count, add_to_cart_count, aliexpress_clicks_count, amazon_clicks_count, store_clicks_count, ai_impressions_count')
      .gte('day', desde)
      .lte('day', hasta)
      .order('day', { ascending: true })

    if (dailyError) return { data: null, error: { message: dailyError.message } }

    // --- Agrupa métricas por producto (una fila por día por producto) ---
    const productMap = new Map<string, MetricRow>()
    for (const row of (metrics ?? []) as any[]) {
      const prod = row.products
      const pid = row.product_id
      const existing = productMap.get(pid)
      const partial: MetricRow = {
        product_id: pid,
        name: prod?.name ?? 'Producto',
        slug: prod?.slug ?? '',
        image_url: prod?.image_url ?? null,
        views_count: Number(row.views_count ?? 0),
        card_clicks_count: Number(row.product_card_clicks_count ?? 0),
        add_to_cart_count: Number(row.add_to_cart_count ?? 0),
        aliexpress_clicks_count: Number(row.aliexpress_clicks_count ?? 0),
        amazon_clicks_count: Number(row.amazon_clicks_count ?? 0),
        store_clicks_count: Number(row.store_clicks_count ?? 0),
        ai_impressions_count: Number(row.ai_impressions_count ?? 0),
        total_interactions: 0,
      }
      if (existing) {
        partial.views_count += existing.views_count
        partial.card_clicks_count += existing.card_clicks_count
        partial.add_to_cart_count += existing.add_to_cart_count
        partial.aliexpress_clicks_count += existing.aliexpress_clicks_count
        partial.amazon_clicks_count += existing.amazon_clicks_count
        partial.store_clicks_count += existing.store_clicks_count
        partial.ai_impressions_count += existing.ai_impressions_count
        productMap.set(pid, { ...partial, total_interactions: 0 })
      } else {
        productMap.set(pid, partial)
      }
    }

    const topProducts = [...productMap.values()].map((p) => ({
      ...p,
      total_interactions:
        p.views_count + p.card_clicks_count + p.add_to_cart_count +
        p.aliexpress_clicks_count + p.amazon_clicks_count + p.store_clicks_count +
        p.ai_impressions_count,
    })).sort((a, b) => b.total_interactions - a.total_interactions).slice(0, 50)

    // --- Agrupa búsquedas ---
    const searchCounts = new Map<string, SearchRow>()
    for (const row of (searches ?? []) as any[]) {
      const key = `${row.source}::${String(row.query).toLowerCase()}`
      const existing = searchCounts.get(key)
      if (existing) {
        existing.total_queries += 1
      } else {
        searchCounts.set(key, { query: row.query, source: row.source, total_queries: 1 })
      }
    }
    const topSearches = [...searchCounts.values()].sort((a, b) => b.total_queries - a.total_queries).slice(0, 50)

    // --- Tendencia diaria agregada ---
    const trendMap = new Map<string, DailyTrend>()
    for (const row of (daily ?? []) as any[]) {
      const key = String(row.day ?? '').slice(0, 10)
      const existing = trendMap.get(key)
      const value: DailyTrend = {
        day: key,
        views_count: Number(row.views_count ?? 0),
        card_clicks_count: Number(row.product_card_clicks_count ?? 0),
        add_to_cart_count: Number(row.add_to_cart_count ?? 0),
        affiliate_clicks_count: Number(row.aliexpress_clicks_count ?? 0) + Number(row.amazon_clicks_count ?? 0) + Number(row.store_clicks_count ?? 0),
        ai_impressions_count: Number(row.ai_impressions_count ?? 0),
      }
      if (existing) {
        trendMap.set(key, {
          day: key,
          views_count: existing.views_count + value.views_count,
          card_clicks_count: existing.card_clicks_count + value.card_clicks_count,
          add_to_cart_count: existing.add_to_cart_count + value.add_to_cart_count,
          affiliate_clicks_count: existing.affiliate_clicks_count + value.affiliate_clicks_count,
          ai_impressions_count: existing.ai_impressions_count + value.ai_impressions_count,
        })
      } else {
        trendMap.set(key, value)
      }
    }
    const trend = [...trendMap.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-14)

    // --- Resumen global ---
    const sums = topProducts.reduce(
      (acc, p) => ({
        total_views: acc.total_views + p.views_count,
        total_card_clicks: acc.total_card_clicks + p.card_clicks_count,
        total_add_to_cart: acc.total_add_to_cart + p.add_to_cart_count,
        total_ali_clicks: acc.total_ali_clicks + p.aliexpress_clicks_count,
        total_amazon_clicks: acc.total_amazon_clicks + p.amazon_clicks_count,
        total_store_clicks: acc.total_store_clicks + p.store_clicks_count,
        total_affiliate_clicks: acc.total_affiliate_clicks + p.aliexpress_clicks_count + p.amazon_clicks_count + p.store_clicks_count,
        total_ai_impressions: acc.total_ai_impressions + p.ai_impressions_count,
        total_searches: 0,
      }),
      {
        total_views: 0,
        total_card_clicks: 0,
        total_add_to_cart: 0,
        total_ali_clicks: 0,
        total_amazon_clicks: 0,
        total_store_clicks: 0,
        total_affiliate_clicks: 0,
        total_ai_impressions: 0,
        total_searches: 0,
      },
    )
    sums.total_searches = (searches ?? []).length

    return {
      data: {
        desde,
        hasta,
        summary: sums,
        topProducts,
        topSearches,
        trend,
      },
      error: null,
    }
  } catch (err: any) {
    console.error('[analytics] getProductAnalytics:', err?.message)
    return { data: null, error: { message: err?.message ?? 'Error obteniendo la analítica.' } }
  }
}