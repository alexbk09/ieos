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
      theme={undefined}
      toastOptions={{
        duration: 3200,
        classNames: {
          toast:
            'group toast rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_18px_45px_rgba(15,23,42,0.16)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50',
          title: 'text-sm font-semibold text-slate-900 dark:text-slate-50',
          description: 'text-xs text-slate-600 dark:text-slate-300',
          closeButton: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
          actionButton: 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-blue-950',
          cancelButton: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
        }
      }}
    />
  )
}
