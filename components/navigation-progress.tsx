'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Barra de progreso superior durante navegaciones del App Router.
 *
 * Mecanismo compatible con la versión instalada de Next.js: intercepta
 * los clics sobre enlaces internos (`<a>`/`<Link>`) y muestra una línea
 * animada en el borde superior hasta que el pathname cambia. Así se cubren
 * todas las navegaciones (menú admin, header, móvil, perfil, catálogo)
 * sin depender de APIs experimentales.
 *
 * Se monta una sola vez en el RootLayout para cubrir toda la app.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const currentPath = useRef(pathname)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Oculta la barra apenas la ruta cambia (la navegación concluyó).
  useEffect(() => {
    if (currentPath.current !== pathname) {
      currentPath.current = pathname
      hideTimer.current = setTimeout(() => setVisible(false), 250)
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current) }
  }, [pathname])

  // Intercepta clics en enlaces internos para mostrar el progreso al instante.
  const handleClick = useCallback((event: MouseEvent) => {
    // Ignora clics con modificadores, botón derecho o target distinto.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = (event.target as HTMLElement | null)?.closest?.('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#') || href.startsWith('javascript:')) return
    if (anchor.target && anchor.target !== '_self') return
    if (anchor.hasAttribute('download')) return
    setVisible(true)
  }, [])

  useEffect(() => {
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [handleClick])

  if (!visible) return null

  return (
    <div aria-hidden="true" className="navigation-progress-bar">
      <span className="navigation-progress-track" />
    </div>
  )
}