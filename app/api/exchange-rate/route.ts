import { NextResponse } from 'next/server'
import { getExchangeRates } from '@/services/exchange-rate'

/** API pública de tasa de cambio cacheada en CDN (5 min + stale-while-revalidate). */
export async function GET() {
  const { official, parallel } = await getExchangeRates()

  return NextResponse.json(
    { rate: official.rate, official, parallel },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  )
}