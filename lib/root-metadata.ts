import type { Metadata, Viewport } from 'next'
import { getSiteSettings } from '@/services/site-settings'
import { GOOGLE_SITE_VERIFICATION } from '@/lib/constants'

/**
 * Metadata y viewport RAÍZ compartidos por los root layouts.
 * Se centraliza aquí para que el sitio público y el panel interno emitan el
 * mismo <head> base (título de marca, verificación de Google, iconos).
 */

/** Viewport/themeColor comunes a todo el proyecto. */
export const ROOT_VIEWPORT: Viewport = { colorScheme: 'light dark', themeColor: '#020617' }

/** Metadata base del sitio (título de marca + verificación + iconos). */
export async function buildRootMetadata(): Promise<Metadata> {
  const { settings } = await getSiteSettings()
  const name = settings.company_name || 'ilumaX'
  const tagline = settings.tagline || 'Arquitectura de luz'

  return {
    title: `${name} — ${tagline}`,
    description:
      settings.hero_texts?.description ??
      'Soluciones LED y revestimientos que convierten espacios en experiencias memorables.',
    generator: name,
    // Verificación de Google Search Console (método meta tag).
    verification: { google: GOOGLE_SITE_VERIFICATION },
    icons: settings.icon_url
      ? { icon: settings.icon_url, apple: settings.icon_url }
      : undefined,
  }
}
