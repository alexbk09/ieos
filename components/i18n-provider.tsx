'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_LOCALE } from '@/lib/constants'

/**
 * Provider de idioma para los componentes cliente.
 * ------------------------------------------------------------------
 * POR QUÉ un contexto y no props: el idioma es el mismo en TODO el árbol de una
 * página. Con un contexto, el root layout lo fija UNA vez y cualquier átomo
 * (header, footer, tarjetas, carrito…) lo lee con `useLocale()` sin tener que
 * atravesar 5 niveles de props (menos ruido y menos riesgo de regresión).
 */

const LocaleContext = createContext<string>(DEFAULT_LOCALE)

export function I18nProvider({
  /** Idioma activo de la página (viene del segmento [locale] de la URL). */
  locale,
  children,
}: {
  locale: string
  children: React.ReactNode
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** Devuelve el idioma activo de la página. */
export function useLocale(): string {
  return useContext(LocaleContext)
}
