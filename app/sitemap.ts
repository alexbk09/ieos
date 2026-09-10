import type { MetadataRoute } from 'next'
import { getSitemapProducts } from '@/services/aliProducts'
import { getSitemapCategories } from '@/services/catalog'
import { absoluteUrl, absoluteAssetUrl } from '@/lib/seo-url'
import {
  SITEMAP_MAX_IMAGES_PER_URL,
  SITEMAP_MAX_URLS,
  SITEMAP_REVALIDATE_SECONDS,
} from '@/lib/constants'

/**
 * Sitemap dinámico accesible en /sitemap.xml (para entregar a Google Search
 * Console, además de declararlo en /robots.txt).
 *
 * POR QUÉ está diseñado así (qué valora Google):
 *  1. Solo incluye URLs CANÓNICAS, indexables y con HTTP 200: rutas estáticas
 *     públicas, landings de categoría (pSEO) y fichas /productos/[slug] que
 *     están marcadas `indexado_google = true` (las noindex quedan fuera).
 *  2. `<lastmod>` REAL por URL (updated_at/created_at de la fila) para que
 *     Google priorice el re-crawl de lo que realmente cambió.
 *  3. Sitemap de IMÁGENES: cada ficha incluye su galería absoluta
 *     (<image:image><image:loc>), clave para e-commerce/afiliados
 *     (Google Imágenes y fichas de producto).
 *  4. Toda la lectura de datos pasa por /services (regla de oro: los
 *     componentes/rutas no llaman a supabase.from() directamente).
 *  5. `revalidate` sirve el XML cacheado (ISR) y lo regenera cada hora:
 *     respeta el crawl budget y mantiene el archivo fresco.
 *  6. Guard defensivo del límite de 50,000 URLs por archivo.
 */
export const revalidate = SITEMAP_REVALIDATE_SECONDS

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const generatedAt = new Date()

  // 1) Rutas estáticas principales (siempre indexables, máxima prioridad).
  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/'), lastModified: generatedAt, changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/catalogo'), lastModified: generatedAt, changeFrequency: 'daily', priority: 0.9 },
  ]

  // 2) Landings de categoría (/categoria/[slug]) — pSEO con lastmod real.
  //    Reparte autoridad hacia las fichas de cada nicho.
  const { items: categories } = await getSitemapCategories()
  for (const category of categories) {
    entries.push({
      url: absoluteUrl(`/categoria/${category.slug}`),
      lastModified: category.lastmod,
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  // 3) Fichas de producto indexables + su galería (sitemap de imágenes).
  const products = await getSitemapProducts()
  if (products.success && products.data) {
    for (const item of products.data) {
      const images = item.images
        .map(absoluteAssetUrl)
        .filter(Boolean)
        .slice(0, SITEMAP_MAX_IMAGES_PER_URL)

      entries.push({
        url: absoluteUrl(`/productos/${item.slug}`),
        lastModified: item.lastmod,
        changeFrequency: 'daily',
        priority: 0.8,
        ...(images.length > 0 ? { images } : {}),
      })
    }
  }

  // 4) Guard defensivo: Google rechaza archivos con más de 50,000 URLs.
  //    (Si el catálogo crece, dividir en un sitemap index.)
  if (entries.length > SITEMAP_MAX_URLS) {
    console.warn(
      `[sitemap] ${entries.length} URLs > límite de ${SITEMAP_MAX_URLS}; se recorta (dividir en sitemap index).`,
    )
    return entries.slice(0, SITEMAP_MAX_URLS)
  }

  return entries
}


