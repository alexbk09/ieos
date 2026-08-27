'use client'

import { Moon, Sun } from 'lucide-react'
import { useDarkMode } from '@/hooks/use-dark-mode'

/**
 * Botón de alternancia de tema (claro/oscuro).
 * Se reutiliza en el header de la tienda, el panel admin, el dashboard,
 * el perfil y el login para mantener una UX consistente.
 * Actualiza la clase `dark` en <html> y persiste en localStorage.
 */
export function ThemeToggle() {
  const { dark, toggle } = useDarkMode()

  return (
    <button
      aria-label="Cambiar tema"
      title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={toggle}
      className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand hover:text-brand"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}