'use client'

import { useEffect, useState } from 'react'
import { EXCHANGE_RATE, SHOW_BOLIVAR_PRICES } from '@/lib/constants'

/**
 * Hook de tasa de cambio para el cliente.
 *
 * Render inmediato con la tasa constante y actualización desde
 * /api/exchange-rate (cacheado). Si la vitrina NO publica precios en bolívares
 * (SHOW_BOLIVAR_PRICES = false) no se hace ninguna petición: no hay consumidor
 * de esa cifra, así que consultar la API de moneda solo gastaría red y tiempo
 * de hidratación.
 */
export function useExchangeRate() {
  const [rate, setRate] = useState(EXCHANGE_RATE)

  useEffect(() => {
    // Sin vitrina en Bs no se consulta la API de moneda (cero peticiones).
    if (!SHOW_BOLIVAR_PRICES) return
    let cancelled = false

    fetch('/api/exchange-rate')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.rate && typeof data.rate === 'number') setRate(data.rate)
      })
      .catch(() => {
        // Si falla, se queda con la tasa constante de respaldo.
      })

    return () => { cancelled = true }
  }, [])

  return rate
}