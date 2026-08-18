'use client'

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/** Props compartidas por campos de formulario. */
type FieldBaseProps = {
  /** Etiqueta visible del campo. */
  label: string
  /** Texto opcional de ayuda. */
  hint?: string
  /** Clases extra para el contenedor. */
  className?: string
}

/** Campo de texto/input reutilizable. */
export function FormInput({
  label,
  hint,
  className,
  ...props
}: FieldBaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn('grid gap-2 text-sm', className)}>
      <span className="font-medium">{label}</span>
      <input
        {...props}
        className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

/** Área de texto reutilizable. */
export function FormTextarea({
  label,
  hint,
  className,
  ...props
}: FieldBaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={cn('grid gap-2 text-sm', className)}>
      <span className="font-medium">{label}</span>
      <textarea
        {...props}
        className="min-h-24 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

/** Botón de acción principal para formularios. */
export function FormSubmitButton({
  loading,
  children,
  loadingText = 'Guardando…',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading: boolean
  children: ReactNode
  loadingText?: string
}) {
  return (
    <button
      type="button"
      disabled={loading}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all',
        'hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {loading ? loadingText : children}
    </button>
  )
}
