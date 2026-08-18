'use client'

import { Toaster } from 'sonner'

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      expand
      visibleToasts={4}
      toastOptions={{
        duration: 3200,
        classNames: {
          toast:
            'group toast rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_18px_45px_rgba(15,23,42,0.16)]',
          title: 'text-sm font-semibold text-slate-900',
          description: 'text-xs text-slate-600',
          closeButton: 'border-slate-200 bg-slate-100 text-slate-600',
          actionButton: 'bg-slate-900 text-white',
          cancelButton: 'bg-slate-100 text-slate-700'
        }
      }}
    />
  )
}
