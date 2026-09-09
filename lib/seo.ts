import type { Metadata } from 'next'
import { absoluteUrl } from '@/lib/seo-url'

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
 * Construye el bloque openGraph + twitter estándar de una página pública.
 * @param title Título SEO de la página.
 * @param description Descripción meta.
 * @param path Ruta interna (ej: '/catalogo') para canonical/OG url.
 * @param image URL absoluta de imagen social (opcional).
 * @param type Tipo OG: 'website' (default) o 'product'.
 */
export function buildPageMetadata(input: {
  title: string
  description: string
  path: string
  image?: string | null
  type?: 'website' | 'product'
  siteName?: string
  robots?: string
}): Metadata {
  const { title, description, path, image, siteName, robots } = input
  const url = absoluteUrl(path)

  // Nota: Next.js valida OpenGraph.type en runtime y SOLO acepta 'website'.
  // El tipo 'product' (estándar OG) se emite como <meta> manual en la página
  // de producto (ver app/productos/[slug]/page.tsx), no vía esta API.
  return {
    title,
    description,
    alternates: { canonical: url },
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


