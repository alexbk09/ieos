import type { MetadataRoute } from 'next'
import { getSitemapProducts } from '@/services/aliProducts'
import { absoluteUrl } from '@/lib/seo-url'

/**
 * Sitemap dinámico en /sitemap.xml.
 * Proyección ligera vía /services (getSitemapProducts): solo slugs
 * indexables con su lastmod real; cacheable con Cache-Control para
 * respetar el crawl budget de Google.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const result = await getSitemapProducts()
  if (!result.success || !result.data) return []

  const entries: MetadataRoute.Sitemap = result.data.map((item) => ({
    url: absoluteUrl(`/productos/${item.slug}`),
    lastModified: item.lastmod,
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  // Rutas estáticas principales.
  entries.unshift(
    { url: absoluteUrl('/'), lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/catalogo'), lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
  )

  return entries
}