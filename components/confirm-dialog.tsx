'use client'

import { toast } from 'sonner'
import { AlertTriangle, Check, X } from 'lucide-react'

/** Opciones del diálogo de confirmación. */
type ConfirmOptions = {
  /** Título principal de la confirmación. */
  title: string
  /** Descripción que explica el riesgo o detalle de la acción. */
  description?: string
  /** Texto del botón de aceptar. Por defecto "Confirmar". */
  confirmText?: string
  /** Texto del botón de cancelar. Por defecto "Cancelar". */
  cancelText?: string
  /** Clases extra para el botón de confirmar (permite estilos destructivos). */
  confirmClassName?: string
  /** Clases extra para el botón de cancelar. */
  cancelClassName?: string
}

/**
 * Muestra un diálogo de confirmación con el sistema de toasts de sonner.
 * Devuelve una Promise<boolean> que se resuelve con `true` si el usuario
 * confirma o `false` si cancela.
 *
 * Diseño premium: tarjeta glass con borde, icono de alerta, sombra suave,
 * animación de entrada y botones bien diferenciados.
 *
 * @example
 * const ok = await confirmAction({
 *   title: '¿Eliminar producto?',
 *   description: 'Esta acción no se puede deshacer.',
 *   confirmText: 'Sí, eliminar',
 *   confirmClassName: 'bg-destructive text-white hover:bg-destructive/90',
 * })
 * if (!ok) return
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const toastId = toast.custom(
      () => (
        <div
          className="pointer-events-auto w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur-xl animate-in fade-in-0 zoom-in-95 dark:border-slate-700/80 dark:bg-slate-900/95"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-description"
        >
          {/* Barra superior de color según el contexto */}
          <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-rose-500 dark:from-amber-500 dark:to-rose-600" />

          <div className="p-5">
            <div className="flex items-start gap-3.5">
              {/* Icono de alerta con anillo */}
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 dark:bg-rose-500/15 dark:text-rose-400 dark:ring-rose-500/30">
                <AlertTriangle size={22} strokeWidth={2} />
              </div>

              <div className="min-w-0 flex-1">
                <p id="confirm-title" className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50">
                  {options.title}
                </p>
                {options.description && (
                  <p id="confirm-description" className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {options.description}
                  </p>
                )}
              </div>
            </div>

            {/* Acciones */}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  toast.dismiss(toastId)
                  resolve(false)
                }}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/70 ${
                  options.cancelClassName ?? ''
                }`}
              >
                <X size={15} strokeWidth={2.5} />
                {options.cancelText ?? 'Cancelar'}
              </button>
              <button
                onClick={() => {
                  toast.dismiss(toastId)
                  resolve(true)
                }}
                className={`inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-[0.98] dark:bg-cyan-500 dark:text-blue-950 dark:hover:bg-cyan-400 ${
                  options.confirmClassName ?? ''
                }`}
              >
                <Check size={15} strokeWidth={2.5} />
                {options.confirmText ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ),
      { duration: Infinity, position: 'top-center' },
    )
  })
}

/** Atajo para confirmaciones de borrado con estilo destructivo. */
export function confirmDelete(options: Omit<ConfirmOptions, 'confirmClassName'> & { confirmText?: string }): Promise<boolean> {
  return confirmAction({
    ...options,
    confirmText: options.confirmText ?? 'Sí, eliminar',
    confirmClassName: 'bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-600 dark:text-white dark:hover:bg-rose-500',
  })
}