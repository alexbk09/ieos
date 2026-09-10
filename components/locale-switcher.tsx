'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Globe } from 'lucide-react'
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_COOKIE_NAME,
  SUPPORTED_LOCALES,
} from '@/lib/constants'
import { buildLocalizedPath, localeFromPathname, publishedLocales } from '@/lib/i18n-config'
import { useLocale } from '@/components/i18n-provider'
import { useTranslations } from '@/hooks/use-translations'

/** Nombre NATIVO de cada idioma (un selector siempre se muestra en su idioma). */
const LOCALE_LABELS: Record<string, string> = {
  es: 'Español',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
}

/**
 * Selector de idioma (átomo de interfaz).
 * ------------------------------------------------------------------
 * - Solo se muestra si hay MÁS DE UN idioma publicado: con un único idioma no
 *   hay nada que conmutar y no ensuciamos la UI.
 * - Al cambiar: persiste la preferencia en cookie (para futuras visitas) y
 *   navega a la URL EQUIVALENTE del idioma (respeta el prefijo "as-needed").
 * - No toca datos ni Supabase: solo navegación + cookie.
 */
export function LocaleSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const locale = useLocale()
  const t = useTranslations()
  const locales = publishedLocales()

  if (locales.length <= 1) return null

  /** Persiste el idioma elegido y navega a su URL equivalente. */
  function change(next: string) {
    document.cookie = `${LOCALE_COOKIE_NAME}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`
    // Ruta interna SIN prefijo de idioma (funciona igual estando en /fr o en /).
    const { path } = localeFromPathname(pathname, {
      locales: SUPPORTED_LOCALES,
      defaultLocale: DEFAULT_LOCALE,
    })
    router.push(buildLocalizedPath(path, next, { prefixDefaultLocale: false }))
  }

  return (
    <label className="relative inline-flex items-center gap-1.5" title={t('header.language')}>
      <Globe size={15} className="text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t('header.language')}</span>
      <select
        value={locale}
        onChange={(event) => change(event.target.value)}
        aria-label={t('header.language')}
        className="cursor-pointer rounded-full border border-border bg-background px-2 py-1 text-xs text-foreground outline-none transition hover:border-brand"
      >
        {locales.map((candidate) => (
          <option key={candidate} value={candidate}>
            {LOCALE_LABELS[candidate] ?? candidate}
          </option>
        ))}
      </select>
    </label>
  )
}
