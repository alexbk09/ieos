// Asistente puro para el flujo de afiliados (AliExpress/Amazon/store legada).
// Aislado de React para poder testear fácilmente la lógica de precios/enlaces.

/** Marketplaces de afiliado soportados por el catálogo híbrido. */
export type AffiliateMarket = 'ali' | 'amazon' | 'store'

/** Detalle de mercado con etiqueta legible y marca visual. */
export type AffiliateMarketInfo = {
  id: AffiliateMarket
  label: string
  shortLabel: string
  /** Clase de color Tailwind para chips/botones (modo claro y oscuro). */
  chipClassName: string
}

/** Catálogo de mercados conocidos. */
export const AFFILIATE_MARKETS: Record<AffiliateMarket, AffiliateMarketInfo> = {
  ali: {
    id: 'ali',
    label: 'AliExpress',
    shortLabel: 'AliExpress',
    chipClassName: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
  amazon: {
    id: 'amazon',
    label: 'Amazon',
    shortLabel: 'Amazon',
    chipClassName: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  store: {
    id: 'store',
    label: 'Tienda oficial',
    shortLabel: 'Tienda',
    chipClassName: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  },
}

/**
 * Detecta el marketplace de afiliado por el hostname de la URL.
 * AliExpress y Amazon se reconocen por su dominio; cualquier otra URL
 * (tienda propia, WooCommerce, etc.) se trata como "Tienda oficial".
 *
 * @param url URL de afiliado completa.
 * @returns Info legible del marketplace detectado.
 */
export function marketplaceForUrl(url: string | null | undefined): AffiliateMarketInfo {
  if (!url) return AFFILIATE_MARKETS.store
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('aliexpress')) return AFFILIATE_MARKETS.ali
    if (host.includes('amazon')) return AFFILIATE_MARKETS.amazon
  } catch {
    // URL inválida: se muestra como store genérica y el botón de copia/usuario lo detecta.
  }
  return AFFILIATE_MARKETS.store
}

/** Prioridad de resolución sin dependencias: AliExpress → Amazon → store. */
export function preferAffiliateUrl(payload: {
  url_afiliado_ali?: string | null
  url_afiliado_amazon?: string | null
  url_afiliado_store?: string | null
}): string | null {
  return payload.url_afiliado_ali ?? payload.url_afiliado_amazon ?? payload.url_afiliado_store ?? null
}