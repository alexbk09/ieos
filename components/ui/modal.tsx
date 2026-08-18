'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ModalProps = {
  /** Controla si el modal está abierto o cerrado. */
  open: boolean
  /** Callback al cerrar el modal (backdrop, botón X, o Escape). */
  onClose: () => void
  /** Título del modal. */
  title: string
  /** Subtítulo opcional mostrado debajo del título. */
  description?: string
  /** Icono opcional del encabezado. */
  icon?: ReactNode
  /** Contenido del cuerpo del modal. */
  children: ReactNode
  /** Contenido opcional del pie (acciones). */
  footer?: ReactNode
  /** Ancho máximo del modal. Por defecto usa max-w-lg. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Evita cerrar al hacer click en el backdrop. */
  preventBackdropClose?: boolean
  /** Clases extra para el panel del modal. */
  className?: string
}

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

/**
 * Modal premium reutilizable.
 * Responsive: ocupa pantalla completa en móvil y panel centrado en escritorio.
 * Cierra con Escape o click en backdrop (configurable).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  size = 'md',
  preventBackdropClose = false,
  className,
}: ModalProps) {
  // Bloquear scroll del body mientras el modal esté abierto
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Cerrar con tecla Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop con blur */}
      <button
        aria-label="Cerrar modal"
        onClick={() => !preventBackdropClose && onClose()}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      />

      {/* Panel del modal */}
      <div
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl shadow-black/20 sm:rounded-3xl',
          'animate-in zoom-in-95 fade-in duration-200',
          SIZE_CLASSES[size],
          className,
        )}
      >
        {/* Línea superior estilo sheet en móvil */}
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/20 sm:hidden" />

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl bg-accent/20 text-accent-foreground">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo con scroll interno */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>

        {/* Footer con acciones */}
        {footer && (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}