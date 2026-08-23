'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Opción mostrada en el select con buscador. */
export type SelectOption = {
  value: string
  label: string
  /** Texto secundario opcional (por ejemplo el RIF del proveedor). */
  sublabel?: string
}

type BaseProps = {
  /** Lista de opciones. */
  options: SelectOption[]
  /** Texto mostrado cuando no hay selección. */
  placeholder?: string
  /** Placeholder del campo de búsqueda. */
  searchPlaceholder?: string
  /** Texto cuando la búsqueda no encuentra opciones. */
  emptyText?: string
  /** Clases extra para el contenedor. */
  className?: string
  /** Altura máxima del dropdown. */
  maxHeight?: string
  /** Deshabilita el componente. */
  disabled?: boolean
}

/** Posición calculada del dropdown (viewport coordinates, no se corta dentro de modales con overflow). */
type DropPosition = { top: number; left: number; width: number }

/**
 * Calcula la posición del dropdown usando getBoundingClientRect.
 * Usa position:fixed para que el dropdown no se corte dentro de
 * contenedores con overflow (modales, tablas con scroll).
 *
 * IMPORTANTE (fix mobile): antes el dropdown se CERRABA al hacer scroll
 * o resize de la ventana. En teléfonos el teclado virtual dispara esos
 * eventos apenas se toca el campo de búsqueda, cerrando el dropdown
 * al instante y sin permitir escribir ni seleccionar.
 * Ahora el dropdown solo se REPOSICIONA (nunca se cierra) y se ignoran
 * los scrolls generados dentro de la propia lista de opciones.
 * Además se usa visualViewport para que en móvil el dropdown quede
 * por encima del teclado virtual.
 */
function useDropdownPosition(
  open: boolean,
  disabled?: boolean,
  dropdownRef?: RefObject<HTMLDivElement | null>,
) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<DropPosition | null>(null)

  useEffect(() => {
    if (!open) return

    function update() {
      const el = buttonRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      // visualViewport representa el área visible real (teclado virtual en móvil)
      const vv = window.visualViewport
      const viewportWidth = vv?.width ?? window.innerWidth
      const viewportHeight = vv?.height ?? window.innerHeight
      const width = Math.max(rect.width, 240)
      const left = Math.min(rect.left, viewportWidth - width - 8)
      const spaceBelow = viewportHeight - rect.bottom
      const estimatedHeight = 280
      // Si no hay espacio abajo (p. ej. teclado abierto), abrir hacia arriba
      const top = spaceBelow >= estimatedHeight ? rect.bottom + 6 : Math.max(8, rect.top - 6 - estimatedHeight)
      setPosition({ top, left, width })
    }

    update()

    /** Reposiciona el dropdown al hacer scroll/resize en vez de cerrarlo. */
    function reposition(e: Event) {
      const target = e.target as Node | null
      // Ignorar scrolls que ocurren DENTRO del dropdown (lista de opciones)
      if (target && dropdownRef?.current?.contains(target)) return
      update()
    }

    /** El teclado virtual de móvil resiza visualViewport: reposicionar. */
    function onVisualViewportChange() {
      setTimeout(update, 0)
    }

    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('resize', onVisualViewportChange)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      window.visualViewport?.removeEventListener('resize', onVisualViewportChange)
    }
  }, [open, disabled, dropdownRef])

  return { buttonRef, position }
}

/**
 * Select con buscador reutilizable (selección simple).
 * Permite escribir para filtrar la lista y seleccionar con un clic.
 * El dropdown usa position:fixed para funcionar dentro de modales.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados',
  className,
  maxHeight = 'max-h-60',
  disabled,
}: BaseProps & {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { buttonRef, position } = useDropdownPosition(open, disabled, dropdownRef)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, buttonRef])

  // Enfocar el buscador al abrir
  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return options
    return options.filter((o) => `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(term))
  }, [options, query])

  const selected = options.find((o) => o.value === value)

  /** Alterna el dropdown y calcula su posición. */
  function toggle() {
    if (disabled) return
    setOpen((o) => !o)
  }

  return (
    <div className={cn('relative', className)}>
      {/* Botón que muestra la selección actual */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors',
          'focus:border-ring focus:ring-2 focus:ring-ring/30',
          disabled && 'pointer-events-none opacity-50',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown con buscador (position:fixed para no cortarse en modales) */}
      {open && position && (
        <div
          ref={dropdownRef}
          role="listbox"
          className="fixed z-[200] overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-slate-950/10 dark:shadow-black/40"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <div className="border-b border-border/70 p-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
          </div>

          <ul className={cn('overflow-y-auto p-1', maxHeight)}>
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</li>}
            {filtered.map((option) => {
              const isSelected = option.value === value
              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted',
                      isSelected && 'font-medium text-primary',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{option.label}</span>
                      {option.sublabel && <span className="block truncate text-xs text-muted-foreground">{option.sublabel}</span>}
                    </span>
                    {isSelected && <Check size={15} className="shrink-0 text-primary" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Select múltiple con buscador reutilizable.
 * Permite escribir para filtrar y marcar/desmarcar opciones con checkboxes.
 * El dropdown usa position:fixed para funcionar dentro de modales.
 */
export function SearchableMultiSelect({
  values,
  onChange,
  options,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin resultados',
  className,
  maxHeight = 'max-h-60',
  disabled,
}: BaseProps & {
  values: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { buttonRef, position } = useDropdownPosition(open, disabled, dropdownRef)

  // Cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, buttonRef])

  // Enfocar el buscador al abrir
  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return options
    return options.filter((o) => `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(term))
  }, [options, query])

  const selectedOptions = options.filter((o) => values.includes(o.value))

  /** Alterna una opción en la selección. */
  function toggle(optionValue: string) {
    onChange(values.includes(optionValue) ? values.filter((v) => v !== optionValue) : [...values, optionValue])
  }

  /** Quita una opción seleccionada del chip. */
  function removeChip(optionValue: string) {
    onChange(values.filter((v) => v !== optionValue))
  }

  /** Alterna el dropdown y calcula su posición. */
  function toggleOpen() {
    if (disabled) return
    setOpen((o) => !o)
  }

  return (
    <div className={cn('relative', className)}>
      {/* Botón que muestra los chips seleccionados */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={cn(
          'flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-xl border border-input bg-background px-2.5 py-1.5 text-sm outline-none transition-colors',
          'focus:border-ring focus:ring-2 focus:ring-ring/30',
          disabled && 'pointer-events-none opacity-50',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedOptions.length === 0 && <span className="px-1.5 text-muted-foreground">{placeholder}</span>}
        {selectedOptions.map((option) => (
          <span
            key={option.value}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
          >
            <span className="truncate">{option.label}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeChip(option.value)
              }}
              aria-label={`Quitar ${option.label}`}
              className="grid size-4 shrink-0 place-items-center rounded-full transition-colors hover:bg-primary/20"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <ChevronDown size={16} className={cn('ml-auto shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown con buscador */}
      {open && position && (
        <div
          ref={dropdownRef}
          role="listbox"
          aria-multiselectable="true"
          className="fixed z-[200] overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-slate-950/10 dark:shadow-black/40"
          style={{ top: position.top, left: position.left, width: position.width }}
        >
          <div className="border-b border-border/70 p-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
          </div>

          <ul className={cn('overflow-y-auto p-1', maxHeight)}>
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</li>}
            {filtered.map((option) => {
              const isSelected = values.includes(option.value)
              return (
                <li key={option.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => toggle(option.value)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                      isSelected && 'font-medium',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded border transition-colors',
                        isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                    >
                      {isSelected && <Check size={11} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{option.label}</span>
                      {option.sublabel && <span className="block truncate text-xs text-muted-foreground">{option.sublabel}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}