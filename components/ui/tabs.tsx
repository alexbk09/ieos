'use client'

import { useState, type ReactNode } from 'react'

/**
 * Tabs (molécula de UI) — pestañas accesibles y "SEO-safe".
 * ------------------------------------------------------------------
 * POR QUÉ existe (diseño atómico + SEO):
 *  - Es un componente de presentación PURO: no conoce Supabase ni datos; solo
 *    recibe etiquetas y contenido ya serializado por el Server Component.
 *  - Renderiza TODOS los paneles en el DOM y oculta los inactivos con el
 *    atributo `hidden`: Google sigue leyendo el contenido de las pestañas
 *    cerradas (si se desmontaran, se perdería contenido indexable).
 *  - Accesible: role=tablist/tab/tabpanel + aria-selected/aria-controls.
 */

export type TabItem = {
  /** Identificador estable (se usa para los ids de tab y panel). */
  id: string
  /** Etiqueta visible de la pestaña. */
  label: string
  /** Contador o etiqueta opcional a la derecha del label. */
  badge?: string | number
  /** Contenido del panel (JSX ya renderizado por el padre). */
  content: ReactNode
}

export function Tabs({ items, ariaLabel, className = '' }: {
  items: TabItem[]
  /** Texto para lectores de pantalla que describe el conjunto de pestañas. */
  ariaLabel?: string
  className?: string
}) {
  // La primera pestaña queda activa por defecto (patrón estándar de tabs).
  const [activo, setActivo] = useState(items[0]?.id ?? '')

  // Sin pestañas no hay nada que renderizar (evita un tablist vacío).
  if (items.length === 0) return null

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {items.map((item) => {
          const seleccionado = item.id === activo
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={seleccionado}
              aria-controls={`panel-${item.id}`}
              onClick={() => setActivo(item.id)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition ${
                seleccionado
                  ? 'border-brand text-brand-strong'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
              {item.badge != null && item.badge !== '' && (
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`panel-${item.id}`}
          aria-labelledby={`tab-${item.id}`}
          hidden={item.id !== activo}
          className="pt-5"
        >
          {item.content}
        </div>
      ))}
    </div>
  )
}
