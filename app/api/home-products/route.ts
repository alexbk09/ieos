import { NextResponse } from 'next/server'
import { getHomeProducts } from '@/services/catalog'
import { isPublishedLocale } from '@/lib/i18n-config'

/** Cabeceras para impedir que el CDN/navegador cachee la muestra aleatoria. */
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
} as const

/**
 * Fuerza el render dinámico del handler.
 * POR QUÉ: la respuesta debe ser DISTINTA en cada petición (rotación aleatoria
 * del inicio); sin esto, un CDN/proxy podría congelar la primera selección.
 */
export const dynamic = 'force-dynamic'

/**
 * API pública de la muestra ALEATORIA de productos del inicio.
 * ------------------------------------------------------------------
 * POR QUÉ existe: la portada se sirve por ISR (HTML cacheado en CDN durante 5
 * min), así que el barajado NO puede vivir en el render del servidor o todos
 * los visitantes verían la misma lista. El cliente pide aquí su propia muestra.
 * - La aleatoriedad y la persistencia viven en /services/catalog (nunca se
 *   consulta Supabase desde el componente).
 * - `locale` se valida contra los idiomas PUBLICADOS (evita respuestas con
 *   idiomas arbitrarios) y resuelve los textos traducidos de cada producto.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const localeRaw = url.searchParams.get('locale')?.trim() || ''
  const locale = isPublishedLocale(localeRaw) ? localeRaw : undefined

  const { products, error } = await getHomeProducts(locale, { randomize: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS })
  }

  return NextResponse.json({ products: products ?? [] }, { headers: NO_STORE_HEADERS })
}
