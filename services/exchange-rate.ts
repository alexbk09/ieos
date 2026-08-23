import { EXCHANGE_RATE } from '@/lib/constants'

/**
 * Servicio de tipo de cambio USD → Bs.
 * Consume la API pública de dolarapi.com (https://ve.dolarapi.com/v1/dolares).
 * La API devuelve un arreglo con varias fuentes: "oficial" (BCV) y "paralelo".
 * Se usa el campo `promedio` como valor de referencia de cada fuente.
 */

export type ExchangeRateInfo = {
  rate: number
  source: 'oficial' | 'paralelo' | 'fallback'
  updatedAt: string | null
}

/** Tasas oficial y paralela juntas para el dashboard. */
export type ExchangeRatesInfo = {
  official: ExchangeRateInfo
  parallel: ExchangeRateInfo
}

const DOLAR_API_URL = 'https://ve.dolarapi.com/v1/dolares'
const OFFICIAL_SOURCE = 'oficial'
const PARALLEL_SOURCE = 'paralelo'
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

/** Caché compartida para ambas tasas (un solo fetch cada 5 min). */
let cache: { data: ExchangeRatesInfo; expiresAt: number } | null = null

/** Crea el objeto de respaldo cuando la API o una fuente no están disponibles. */
function fallbackRates(): ExchangeRatesInfo {
  return {
    official: { rate: EXCHANGE_RATE, source: 'fallback', updatedAt: null },
    parallel: { rate: EXCHANGE_RATE, source: 'fallback', updatedAt: null },
  }
}

/**
 * Obtiene las tasas oficial y paralela del dólar en una sola llamada.
 * Si una fuente no está disponible, usa la tasa constante de respaldo (EXCHANGE_RATE).
 * Si la API falla por completo, ambas fuentes caen al respaldo con source "fallback".
 */
export async function getExchangeRates(): Promise<ExchangeRatesInfo> {
  if (cache && cache.expiresAt > Date.now()) return cache.data

  try {
    const response = await fetch(DOLAR_API_URL, {
      next: { revalidate: 300 },
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`dolarapi respondió ${response.status}`)

    const data: DolarApiResponse = await response.json()

    /** Extrae una fuente del arreglo y valida su promedio. */
    function extractSource(sourceKey: string): ExchangeRateInfo {
      const found = data.find((item) => item.fuente === sourceKey)
      if (!found || typeof found.promedio !== 'number' || found.promedio <= 0) {
        return { rate: EXCHANGE_RATE, source: 'fallback', updatedAt: null }
      }
      return {
        rate: found.promedio,
        source: sourceKey === OFFICIAL_SOURCE ? 'oficial' : 'paralelo',
        updatedAt: found.fechaActualizacion,
      }
    }

    const result: ExchangeRatesInfo = {
      official: extractSource(OFFICIAL_SOURCE),
      parallel: extractSource(PARALLEL_SOURCE),
    }

    cache = { data: result, expiresAt: Date.now() + CACHE_TTL_MS }
    return result
  } catch {
    return fallbackRates()
  }
}

/**
 * Obtiene solo la tasa oficial del dólar.
 * Mantiene la firma original para compatibilidad con el resto del sistema.
 * Internamente usa la misma caché compartida de getExchangeRates().
 */
export async function getOfficialExchangeRate(): Promise<ExchangeRateInfo> {
  const { official } = await getExchangeRates()
  return official
}

/**
 * Formatea un monto en USD a bolívares usando la tasa proporcionada.
 */
export function formatBolivars(amountUsd: number, rate: number): string {
  return `Bs. ${(amountUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}