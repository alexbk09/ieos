/**
 * Cliente de analítica de productos (SOLO navegador).
 *
 * Encapsula el envío de eventos de interacción con productos y búsquedas
 * al endpoint /api/analytics/track. Los componentes de UI consumen estas
 * funciones puras en lugar de llamar a Supabase directo (regla de oro).
 *
 * Todos los envíos son fire-and-forget: usan keepalive y nunca lanzan
 * errores que puedan romper la experiencia del usuario.
 */

import { SEARCH_LOG_SOURCES } from '@/lib/constants'
import { marketplaceForUrl } from '@/lib/affiliate'

/** Período de deduplicación (ms) para vistas repetidas del MISMO producto. */
const VIEW_DEDUPE_WINDOW_MS = 1500

/** Últimos productos con vista reciente para evitar doble conteo en re-renders. */
const recentViewMap = new Map<string, number>()

/**
 * Envía un evento de producto al backend (sin bloquear la UI).
 * @param productId ID UUID del producto.
 * @param eventType Tipo de evento (PRODUCT_EVENT_TYPES).
 * @param market Mercado de afiliado solo para affiliate_click.
 */
export function trackProductEvent(productId: string, eventType: string, market?: string | null) {
  if (!productId || !eventType) return
  try {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'product_event',
        productId,
        eventType,
        market: market ?? null,
      }),
      keepalive: true,
    }).catch(() => {
      // El tracking jamás debe interferir con la navegación del usuario.
    })
  } catch {
    // Errores de red/localStorage se ignoran silenciosamente.
  }
}

/**
 * Registra una vista del detalle de producto con deduplicación corta.
 * Evita que re-renders o aperturas rápidas del mismo modal cuenten doble.
 */
export function trackProductView(productId: string) {
  if (!productId) return
  const now = Date.now()
  const last = recentViewMap.get(productId) ?? 0
  if (now - last < VIEW_DEDUPE_WINDOW_MS) return
  recentViewMap.set(productId, now)
  trackProductEvent(productId, 'product_view')
}

/**
 * Registra la salida del usuario hacia el marketplace de afiliado.
 * Detecta el mercado real desde la URL usando lib/affiliate (ali/amazon/store).
 */
export function trackAffiliateClick(productId: string | undefined | null, url: string | null | undefined) {
  if (!productId) return
  const market = marketplaceForUrl(url ?? undefined).id
  // lib/affiliate usa ids 'ali' | 'amazon' | 'store'; la DB espera nombres.
  const dbMarket = market === 'ali' ? 'aliexpress' : market
  trackProductEvent(productId, 'affiliate_click', dbMarket)
}

/**
 * Registra un término de búsqueda (filtro del catálogo o asistente IA).
 * @param query Término buscado.
 * @param source Origen: SEARCH_LOG_SOURCES.CATALOG_FILTER o SEARCH_LOG_SOURCES.AGENT.
 * @param resultsCount Cantidad de resultados devueltos (0 si no aplica).
 */
export function trackSearchLog(query: string, source: string = SEARCH_LOG_SOURCES.CATALOG_FILTER, resultsCount = 0) {
  const trimmed = query?.trim()
  if (!trimmed || trimmed.length < 2) return
  try {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'search_log',
        query: trimmed.slice(0, 200),
        source,
        resultsCount,
      }),
      keepalive: true,
    }).catch(() => {
      // Silencioso.
    })
  } catch {
    // Silencioso.
  }
}