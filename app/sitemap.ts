import type { MetadataRoute } from 'next'
import { getSitemapProducts } from '@/services/aliProducts'
import { getSitemapCategories } from '@/services/catalog'
import { getSitemapEntries } from '@/services/entries'
import { absoluteUrl, ownOriginAssetUrl } from '@/lib/seo-url'
import { buildLanguageAlternates } from '@/lib/seo'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { SITEMAP_MAX_IMAGES_PER_URL, SITEMAP_MAX_URLS } from '@/lib/constants'
import { LEGAL_DOCUMENT_ORDER, legalDocumentPath } from '@/lib/legal-content'

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
 *  3. Sitemap de IMÁGENES: cada ficha incluye su galería, pero SOLO con
 *     imágenes alojadas en el DOMINIO PROPIO (<image:loc>). Google solo admite
 *     imágenes de otro dominio si ese dominio está verificado en Search Console;
 *     por eso se descartan las del CDN de AliExpress (dominio ajeno) y el
 *     sitemap publica EXCLUSIVAMENTE URLs de este sitio.
 *  4. Toda la lectura de datos pasa por /services (regla de oro: los
 *     componentes/rutas no llaman a supabase.from() directamente).
 *  5. `revalidate` sirve el XML cacheado (ISR) y lo regenera cada hora:
 *     respeta el crawl budget y mantiene el archivo fresco.
 *  6. Guard defensivo del límite de 50,000 URLs por archivo.
 */
// ⚠️ Next.js exige un LITERAL estático en los segment configs: su análisis
// estático (extract-const-value) NO resuelve identificadores importados y
// aborta el build con "Invalid segment configuration export detected".
// Este valor DEBE coincidir con SITEMAP_REVALIDATE_SECONDS (lib/constants.ts).
export const revalidate = 86400

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const generatedAt = new Date()
  const locales = publishedLocales()
  const entries: MetadataRoute.Sitemap = []

  /**
   * Construye el `alternates.languages` (hreflang) de una página.
   * Next.js lo serializa como <xhtml:link rel="alternate" hreflang="..."> dentro
   * de cada <url>, que es la señal que evita el "contenido duplicado" entre
   * idiomas y le dice a Google qué versión servir a cada mercado.
   */
  const alternatesFor = (buildPath: (locale: string) => string) => ({
    languages: buildLanguageAlternates(
      Object.fromEntries(locales.map((locale) => [locale, buildPath(locale)])),
    ),
  })

  // 1) Rutas estáticas principales, una por cada idioma publicado.
  for (const locale of locales) {
    entries.push({
      url: absoluteUrl(buildLocalizedPath('/', locale, { prefixDefaultLocale: false })),
      lastModified: generatedAt,
      changeFrequency: 'daily',
      priority: 1,
      alternates: alternatesFor((l) => buildLocalizedPath('/', l, { prefixDefaultLocale: false })),
    })
    entries.push({
      url: absoluteUrl(buildLocalizedPath('/catalogo', locale, { prefixDefaultLocale: false })),
      lastModified: generatedAt,
      changeFrequency: 'daily',
      priority: 0.9,
      alternates: alternatesFor((l) => buildLocalizedPath('/catalogo', l, { prefixDefaultLocale: false })),
    })
    // Documentos legales (aviso de afiliado, términos y privacidad): cambian
    // poco. Las rutas salen de la fuente única `lib/legal-content.ts`.
    for (const key of LEGAL_DOCUMENT_ORDER) {
      const docPath = legalDocumentPath(key)
      entries.push({
        url: absoluteUrl(buildLocalizedPath(docPath, locale, { prefixDefaultLocale: false })),
        lastModified: generatedAt,
        changeFrequency: 'monthly',
        priority: 0.3,
        alternates: alternatesFor((l) => buildLocalizedPath(docPath, l, { prefixDefaultLocale: false })),
      })
    }
    // Hub legal (/politicas): índice de los documentos, mantiene viva la URL
    // histórica con sus anclas.
    entries.push({
      url: absoluteUrl(buildLocalizedPath('/politicas', locale, { prefixDefaultLocale: false })),
      lastModified: generatedAt,
      changeFrequency: 'monthly',
      priority: 0.3,
      alternates: alternatesFor((l) => buildLocalizedPath('/politicas', l, { prefixDefaultLocale: false })),
    })
    // Hub de contenido (guías y comparativas): SIEMPRE indexable, aunque aún no
    // tenga entradas publicadas, porque es la puerta del cluster temático.
    entries.push({
      url: absoluteUrl(buildLocalizedPath('/guias', locale, { prefixDefaultLocale: false })),
      lastModified: generatedAt,
      changeFrequency: 'weekly',
      priority: 0.7,
      alternates: alternatesFor((l) => buildLocalizedPath('/guias', l, { prefixDefaultLocale: false })),
    })
  }

  // 2) Landings de categoría (/categoria/[slug]) — pSEO con lastmod real y
  //    SLUG LOCALIZADO por idioma (la URL habla el idioma del público).
  const { items: categories } = await getSitemapCategories()
  for (const category of categories) {
    const slugFor = (locale: string) => category.slug_i18n?.[locale] ?? category.slug
    for (const locale of locales) {
      entries.push({
        url: absoluteUrl(buildLocalizedPath(`/categoria/${slugFor(locale)}`, locale, { prefixDefaultLocale: false })),
        lastModified: category.lastmod,
        changeFrequency: 'weekly',
        priority: 0.7,
        alternates: alternatesFor((l) =>
          buildLocalizedPath(`/categoria/${slugFor(l)}`, l, { prefixDefaultLocale: false }),
        ),
      })
    }
  }

  // 3) Fichas de producto indexables + su galería (sitemap de imágenes).
  //    El slug del producto aún no se localiza: solo cambia el prefijo de idioma.
  const products = await getSitemapProducts()
  if (products.success && products.data) {
    for (const item of products.data) {
      // Solo imágenes del propio dominio: `ownOriginAssetUrl` devuelve '' para
      // hosts ajenos (CDN de AliExpress…), que se descartan con el filter.
      const images = item.images
        .map(ownOriginAssetUrl)
        .filter(Boolean)
        .slice(0, SITEMAP_MAX_IMAGES_PER_URL)

      const alternates = alternatesFor((l) =>
        buildLocalizedPath(`/productos/${item.slug}`, l, { prefixDefaultLocale: false }),
      )
      for (const locale of locales) {
        entries.push({
          url: absoluteUrl(buildLocalizedPath(`/productos/${item.slug}`, locale, { prefixDefaultLocale: false })),
          lastModified: item.lastmod,
          changeFrequency: 'daily',
          priority: 0.8,
          alternates,
          ...(images.length > 0 ? { images } : {}),
        })
      }
    }
  }

  // 4) Entradas SEO (guías y comparativas): es la capa de contenido
  //    informacional. Solo entran las PUBLICADAS e INDEXABLES, con su
  //    lastmod real y su slug LOCALIZADO por idioma (hreflang correcto).
  const { items: entryItems } = await getSitemapEntries()
  for (const entry of entryItems) {
    const slugFor = (locale: string) => entry.slug_i18n?.[locale] ?? entry.slug
    for (const locale of locales) {
      entries.push({
        url: absoluteUrl(buildLocalizedPath(`/guias/${slugFor(locale)}`, locale, { prefixDefaultLocale: false })),
        lastModified: entry.lastmod,
        changeFrequency: 'monthly',
        priority: 0.6,
        alternates: alternatesFor((l) => buildLocalizedPath(`/guias/${slugFor(l)}`, l, { prefixDefaultLocale: false })),
      })
    }
  }

  // 5) Guard defensivo: Google rechaza archivos con más de 50,000 URLs.
  //    (Si el catálogo crece, dividir en un sitemap index.)
  if (entries.length > SITEMAP_MAX_URLS) {
    console.warn(
      `[sitemap] ${entries.length} URLs > límite de ${SITEMAP_MAX_URLS}; se recorta (dividir en sitemap index).`,
    )
    return entries.slice(0, SITEMAP_MAX_URLS)
  }

  return entries
}


