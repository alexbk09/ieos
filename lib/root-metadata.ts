import type { Metadata, Viewport } from 'next'
import { getSiteSettings } from '@/services/site-settings'
import { GOOGLE_SITE_VERIFICATION, OG_IMAGE_PATH } from '@/lib/constants'
import { absoluteUrl } from '@/lib/seo-url'

/**
 * Metadata y viewport RAÍZ compartidos por los root layouts.
 * Se centraliza aquí para que el sitio público y el panel interno emitan el
 * mismo <head> base (título de marca, verificación de Google, iconos y la
 * imagen social por defecto para compartir).
 */

/** Viewport/themeColor comunes a todo el proyecto. */
export const ROOT_VIEWPORT: Viewport = { colorScheme: 'light dark', themeColor: '#020617' }

/** Descripción de respaldo (cuando site_settings aún no tiene hero_texts). */
const DEFAULT_DESCRIPTION =
  'Curamos las mejores ofertas de AliExpress: precios verificados, reseñas reales y envío rastreable. Compra con confianza.'

/** Metadata base del sitio (título de marca + verificación + iconos + OG). */
export async function buildRootMetadata(): Promise<Metadata> {
  const { settings } = await getSiteSettings()
  const name = settings.company_name || 'zonadehobbies'
  const tagline = settings.tagline || 'Ofertas verificadas para tus hobbies'
  const description = settings.hero_texts?.description ?? DEFAULT_DESCRIPTION
  const title = `${name} — ${tagline}`
  const ogImage = absoluteUrl(OG_IMAGE_PATH)

  return {
    // metadataBase: Next exige una URL base para resolver rutas relativas de
    // metadata. Sin ella avisa en build y las URLs de OG quedan inconsistentes.
    metadataBase: new URL(absoluteUrl('/')),
    // Título por defecto + plantilla: las páginas hijas emiten "Su título | zonadehobbies".
    title: { default: title, template: `%s | ${name}` },
    description,
    generator: name,
    applicationName: name,
    // Verificación de Google Search Console (método meta tag).
    verification: { google: GOOGLE_SITE_VERIFICATION },
    icons: settings.icon_url
      ? { icon: settings.icon_url, apple: settings.icon_url }
      : undefined,
    // Imagen social por defecto: todas las páginas la heredan salvo override.
    openGraph: {
      type: 'website',
      siteName: name,
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}
