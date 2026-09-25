import { NextResponse } from 'next/server'
import { getHomeProducts } from '@/services/catalog'
import { isPublishedLocale } from '@/lib/i18n-config'

/** Cabeceras de cache controlado para que el endpoint de la portada NO vuelva a
 * disparar la consulta en cada request del navegador o crawler, pero sí se
 * revalide de forma periódica para mantener la rotación del inicio. */
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
  'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
  'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800',
} as const

/** El endpoint sirve una selección aleatoria, pero con ventana de caché corta
 * para mantener la carga baja y evitar regenerar en cada request. */
export const revalidate = 300

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
    return NextResponse.json({ error: error.message }, { status: 500, headers: CACHE_HEADERS })
  }

  return NextResponse.json({ products: products ?? [] }, { headers: CACHE_HEADERS })
}
