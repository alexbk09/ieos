import { NextResponse } from 'next/server'
import { getSiteSettings } from '@/services/site-settings'

/**
 * API pública de configuración del sitio.
 * Cacheada en CDN por 60s con stale-while-revalidate (300s).
 */
export async function GET() {
  const { settings, error } = await getSiteSettings()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ settings }, {
/*     headers: {
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
  })
}