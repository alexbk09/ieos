'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ilumax-dark-mode'

/**
 * Hook de modo oscuro compartido entre la portada y el catálogo completo.
 * Persiste la preferencia en localStorage para mantenerla al navegar entre páginas.
 */
export function useDarkMode() {
  const [dark, setDark] = useState(false)

  // Carga la preferencia guardada al montar (solo navegador).
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setDark(stored === 'true')
  }, [])

  /** Cambia el tema y lo persiste en localStorage. */
  function toggle() {
    setDark((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  return { dark, toggle }
}