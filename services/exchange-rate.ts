import { EXCHANGE_RATE } from '@/lib/constants'

/**
 * Servicio de tipo de cambio USD → Bs.
 * Consume la API pública de dolarapi.com (https://ve.dolarapi.com/v1/dolares).
 * Usa la fuente "oficial" y el campo `promedio` como valor de referencia.
 */

export type ExchangeRateInfo = {
  rate: number
  source: 'oficial' | 'fallback'
  updatedAt: string | null
}

const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares'
const OFFICIAL_SOURCE = 'oficial'
const CACHE_TTL_MS = 5 * 60 * 1000

type DolarApiResponse = {
  moneda: string
  fuente: string
  nombre: string
  compra: number | null
  venta: number | null
  promedio: number
  fechaActualizacion: string
}[]

let cache: { data: ExchangeRateInfo; expiresAt: number } | null = null

/**
 * Obtiene la tasa oficial del dólar (fuente "oficial" → `promedio`).
 * Si la API falla, devuelve la tasa constante de respaldo (EXCHANGE_RATE).
 */
export async function getOfficialExchangeRate(): Promise<ExchangeRateInfo> {
  if (cache && cache.expiresAt > Date.now()) return cache.data

  try {
    const response = await fetch(DOLAR_API_URL, {
      next: { revalidate: 300 },
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`dolarapi respondió ${response.status}`)

    const data: DolarApiResponse = await response.json()
    const official = data.find((item) => item.fuente === OFFICIAL_SOURCE)
    if (!official || typeof official.promedio !== 'number' || official.promedio <= 0) {
      throw new Error('No se encontró la fuente oficial con promedio válido')
    }

    const result: ExchangeRateInfo = {
      rate: official.promedio,
      source: 'oficial',
      updatedAt: official.fechaActualizacion,
    }
    cache = { data: result, expiresAt: Date.now() + CACHE_TTL_MS }
    return result
  } catch {
    return { rate: EXCHANGE_RATE, source: 'fallback', updatedAt: null }
  }
}

/**
 * Formatea un monto en USD a bolívares usando la tasa proporcionada.
 */
export function formatBolivars(amountUsd: number, rate: number): string {
  return `Bs. ${(amountUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}