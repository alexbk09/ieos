'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { resetBodyScroll } from '@/lib/scroll-lock'

/**
 * Restaura el scroll del body en cada cambio de ruta.
 * Previene que un scroll lock residual (overflow:hidden pegado)
 * persista al navegar entre páginas (Next.js reutiliza el <body>).
 */
export function ScrollReset() {
  const pathname = usePathname()

  useEffect(() => {
    resetBodyScroll()
  }, [pathname])

  return null
}