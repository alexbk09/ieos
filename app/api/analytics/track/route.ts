import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase/public'

/**
 * API pública de analítica de productos.
 *
 * Los componentes del frontend NUNCA llaman a Supabase directo; esta
 * ruta es el único punto de entrada para registrar eventos de producto
 * y términos de búsqueda. Usa el cliente público + funciones RPC
 * SECURITY DEFINER (track_product_event / track_search_log) creadas en
 * la migración 0044.
 *
 * Body esperado (POST):
 *   { type: 'product_event', productId, eventType, market? }
 *   { type: 'search_log', query, source, resultsCount? }
 *
 * La escritura es fire-and-forget: la UI no espera respuesta de datos,
 * solo el estado HTTP. Errores de tracking NUNCA rompen la experiencia.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    // Determina el tipo de registro (product_event o search_log).
    const kind = body.type as string | undefined
    if (kind === 'product_event') {
      const productId = body.productId
      const eventType = body.eventType
      if (typeof productId !== 'string' || !productId.trim() || typeof eventType !== 'string') {
        return NextResponse.json({ error: 'productId y eventType son requeridos' }, { status: 400 })
      }

      // Sanea el mercado de afiliado (ali → usa mapping en el cliente; aquí pueden llegar
      // 'aliexpress' | 'amazon' | 'store' | null).
      const market = typeof body.market === 'string' && body.market ? body.market.slice(0, 30) : null

      const supabase = createPublicClient()
      const { error } = await supabase.rpc('track_product_event', {
        p_product_id: productId,
        p_event_type: eventType,
        p_market: market,
        p_source: 'catalog',
      })
      if (error) {
        // Log silencioso: el tracking no debe afectar al usuario.
        console.error('[analytics:track] RPC product_event:', error.message)
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    if (kind === 'search_log') {
      const query = typeof body.query === 'string' ? body.query.trim() : ''
      const source = typeof body.source === 'string' ? body.source : 'catalog_filter'
      if (!query) {
        return NextResponse.json({ ok: true })
      }
      const resultsCount = Number.isFinite(Number(body.resultsCount)) ? Math.max(0, Number(body.resultsCount)) : 0

      const supabase = createPublicClient()
      const { error } = await supabase.rpc('track_search_log', {
        p_query: query,
        p_source: source === 'agent' ? 'agent' : 'catalog_filter',
        p_results_count: resultsCount,
      })
      if (error) {
        console.error('[analytics:track] RPC search_log:', error.message)
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Tipo de tracking no soportado' }, { status: 400 })
  } catch (err: any) {
    console.error('[analytics:track]', err?.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}