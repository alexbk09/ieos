'use client'

import { useMemo } from 'react'
import { MESSAGES, createTranslator, type Translator } from '@/lib/i18n-messages'
import { useLocale } from '@/components/i18n-provider'

/**
 * Hook de traducción de la interfaz.
 * Devuelve un traductor `t(clave, variables?)` ligado al idioma activo, con
 * memoización para no recrear la función en cada render (rendimiento).
 *
 * @example const t = useTranslations(); t('header.openCart')
 */
export function useTranslations(): Translator {
  const locale = useLocale()
  return useMemo(() => createTranslator(MESSAGES, locale), [locale])
}
