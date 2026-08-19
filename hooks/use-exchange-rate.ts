'use client'

import { useEffect, useState } from 'react'
import { EXCHANGE_RATE } from '@/lib/constants'

/** Hook de tasa de cambio para el cliente. Render inmediato con tasa constante y actualización desde /api/exchange-rate (cacheado). */
export function useExchangeRate() {
  const [rate, setRate] = useState(EXCHANGE_RATE)

  useEffect(() => {
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