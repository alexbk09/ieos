import { NextResponse } from 'next/server'
import { getOfficialExchangeRate } from '@/services/exchange-rate'

/** API pública de tasa de cambio cacheada en CDN (5 min + stale-while-revalidate). */
export async function GET() {
  const { rate, source, updatedAt } = await getOfficialExchangeRate()

  return NextResponse.json(
    { rate, source, updatedAt },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  )
}