'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ilumax-dark-mode'
const DARK_CLASS = 'dark'

/**
 * Hook de modo oscuro global.
 * Aplica la clase `dark` directamente al elemento <html> para que TODOS
 * los componentes de la app (portada, catálogo, panel admin, dashboard,
 * perfil, popups, toasts y WhatsApp) reaccionen al tema.
 *
 * El estado inicial se lee desde el DOM (clase `dark` ya aplicada por el
 * script inline del layout) para que el icono del toggle coincida con el
 * tema real antes de la hidratación.
 *
 * Persiste la preferencia en localStorage para mantenerla al navegar.
 */
export function useDarkMode() {
  const [dark, setDark] = useState(() => false)

  // Al montar, sincroniza con el valor real del DOM y de localStorage.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const isDark = stored !== null
      ? stored === 'true'
      : document.documentElement.classList.contains(DARK_CLASS)

    setDark(isDark)
    document.documentElement.classList.toggle(DARK_CLASS, isDark)
  }, [])

  /** Cambia el tema, lo persiste y actualiza la clase en <html>. */
  function toggle() {
    setDark((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      document.documentElement.classList.toggle(DARK_CLASS, next)
      return next
    })
  }

  return { dark, toggle }
}