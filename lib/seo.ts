import type { Metadata } from 'next'
import { absoluteUrl } from '@/lib/seo-url'
import { DEFAULT_LOCALE, HREFLANG_X_DEFAULT, buildHreflangAlternates } from '@/lib/i18n-config'

/**
 * Helpers de metadata SEO reutilizables (Fase 1).
 *
 * POR QUÉ existe este módulo:
 *  - Evita duplicar la lógica de construcción de <title>/description/OG
 *    entre la portada, el catálogo y las páginas de categoría.
 *  - Centraliza el patrón de openGraph + twitter:card para que todas las
 *    páginas públicas indexables emitan el mismo marcado social.
 *  - Mantiene la arquitectura agnóstica: solo recibe strings, nunca toca
 *    Supabase ni componentes.
 */

/** Convierte una ruta interna en URL absoluta (delegado a seo-url). */
export { absoluteUrl }

/**
 * Construye el mapa `alternates.languages` (hreflang) de una página.
 * Next.js lo serializa como <link rel="alternate" hreflang="..."> y añade la
 * entrada x-default apuntando al idioma por defecto (la que Google sirve a los
 * países sin versión propia).
 *
 * ⚠️ SOLO deben incluirse idiomas PUBLICADOS y con URL viva: un hreflang hacia
 * una URL que devuelve 404 es un error que Google reporta y penaliza.
 *
 * @param pathByLocale Ruta interna por idioma. El idioma por defecto va SIN
 *   prefijo (criterio "as-needed"): { es: '/catalogo', fr: '/fr/catalogo' }.
 */
export function buildLanguageAlternates(pathByLocale: Record<string, string>): Record<string, string> {
  const absolute: Record<string, string> = {}
  for (const [locale, path] of Object.entries(pathByLocale ?? {})) {
    if (path) absolute[locale] = absoluteUrl(path)
  }
  return buildHreflangAlternates({
    pathsByLocale: absolute,
    defaultLocale: DEFAULT_LOCALE,
    xDefault: HREFLANG_X_DEFAULT,
  })
}

/**
 * Construye el bloque openGraph + twitter estándar de una página pública.
 * @param title Título SEO de la página.
 * @param description Descripción meta.
 * @param path Ruta interna (ej: '/catalogo') para canonical/OG url.
 * @param image URL absoluta de imagen social (opcional).
 * @param type Tipo OG: 'website' (default) o 'product'.
 * @param alternatesByLocale Rutas por idioma para emitir hreflang + x-default.
 */
export function buildPageMetadata(input: {
  title: string
  description: string
  path: string
  image?: string | null
  type?: 'website' | 'product'
  siteName?: string
  robots?: string
  /** Rutas por idioma (solo idiomas PUBLICADOS) para hreflang. */
  alternatesByLocale?: Record<string, string>
}): Metadata {
  const { title, description, path, image, siteName, robots, alternatesByLocale } = input
  const url = absoluteUrl(path)
  const languages = alternatesByLocale ? buildLanguageAlternates(alternatesByLocale) : null

  // Nota: Next.js valida OpenGraph.type en runtime y SOLO acepta 'website'.
  // El tipo 'product' (estándar OG) se emite como <meta> manual en la página
  // de producto (ver app/productos/[slug]/page.tsx), no vía esta API.
  return {
    title,
    description,
    alternates: {
      canonical: url,
      ...(languages && Object.keys(languages).length > 0 ? { languages } : {}),
    },
    ...(robots ? { robots } : {}),
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName,
      ...(image ? { images: [{ url: image }] } : {}),
    },

    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}


