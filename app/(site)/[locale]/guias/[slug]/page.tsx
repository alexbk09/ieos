import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EntryPageView, type EntryViewProduct } from '@/components/entry-page-view'
import type { EntryCardData } from '@/components/entry-card'
import { getCategoryNav } from '@/services/catalog'
import {
  getEntrySlugs,
  getPublishedEntryBySlug,
  getRelatedEntries,
  type Entry,
} from '@/services/entries'
import { getSiteSettings } from '@/services/site-settings'
import { MESSAGES, createTranslator } from '@/lib/i18n-messages'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { OG_IMAGE_PATH } from '@/lib/constants'
import { buildEntryJsonLd } from '@/lib/entry-rules'
import { clampText, htmlToPlainText } from '@/lib/schema/product-schema'

/**
 * Entrada SEO: /guias/[slug] (comparativa, guía de compra, top, caso de uso…).
 * ------------------------------------------------------------------
 * Estrategia pSEO:
 *  - SSG + ISR (300s) con el artículo, la tabla comparativa y la FAQ
 *    renderizados en servidor: Google recibe el contenido completo sin JS.
 *  - JSON-LD en el <head>: Article (+ datePublished/dateModified reales),
 *    ItemList de los productos comparados, FAQPage y BreadcrumbList.
 *  - La FAQ VISIBLE y el schema FAQPage son el mismo dato (Google exige que
 *    el marcado coincida con lo que ve el usuario).
 *  - 404 real si la entrada no está publicada: los borradores no existen para
 *    el público (la RLS ni siquiera los devuelve).
 *  - `indexado_google = false` ⇒ la página se sirve con noindex (útil para
 *    entradas antiguas que se conservan solo por enlaces).
 */

export const revalidate = 300

/**
 * Estructura estática de cada entrada publicada por cada idioma PUBLICADO,
 * usando el slug LOCALIZADO de ese idioma (URL en el idioma del público).
 */
export async function generateStaticParams() {
  const { items } = await getEntrySlugs()
  const params: { locale: string; slug: string }[] = []
  const vistos = new Set<string>()
  for (const locale of publishedLocales()) {
    for (const item of items) {
      const slug = item.slug_i18n?.[locale] ?? item.slug
      const clave = `${locale}:${slug}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      params.push({ locale, slug })
    }
  }
  return params
}

/** Serializa una entrada a la tarjeta (bloque "seguir leyendo"). */
function toCard(entry: Entry): EntryCardData {
  return {
    slug: entry.slug,
    slugLocalizado: entry.slug_localizado ?? entry.slug,
    titulo: entry.titulo,
    resumen: entry.resumen,
    heroImageUrl: entry.hero_image_url,
    angulo: entry.angulo,
    lecturaMinutos: entry.lectura_minutos,
  }
}

/** Metadata de la entrada: canonical propio, hreflang por idioma y OG. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const { entry } = await getPublishedEntryBySlug(slug, locale)
  if (!entry) return {}

  const slugLocal = entry.slug_localizado ?? entry.slug
  // La meta description cae al texto del artículo si la IA no dejó `resumen`.
  const descripcion =
    entry.resumen || clampText(htmlToPlainText(entry.cuerpo_html ?? ''), 155) || entry.titulo

  return buildPageMetadata({
    title: entry.titulo,
    description: descripcion,
    path: buildLocalizedPath(`/guias/${slugLocal}`, locale, { prefixDefaultLocale: false }),
    image: entry.hero_image_url ? absoluteUrl(entry.hero_image_url) : absoluteUrl(OG_IMAGE_PATH),
    robots: entry.indexado_google ? undefined : 'noindex, follow',
    alternatesByLocale: Object.fromEntries(
      publishedLocales().map((l) => [
        l,
        buildLocalizedPath(`/guias/${entry.slugI18n?.[l] ?? entry.slug}`, l, {
          prefixDefaultLocale: false,
        }),
      ]),
    ),
  })
}

export default async function EntryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  // Blindaje: solo idiomas PUBLICADOS (evita "doorway pages" en versiones a medias).
  if (!publishedLocales().includes(locale)) notFound()

  const { entry } = await getPublishedEntryBySlug(slug, locale)
  // 404 real: los borradores no son accesibles públicamente.
  if (!entry) notFound()

  const [{ entries: related }, { items: navCategories }, { settings }] = await Promise.all([
    getRelatedEntries({
      entryId: entry.id,
      categoryIds: entry.categories.map((categoria) => categoria.id),
      locale,
    }),
    getCategoryNav(undefined, locale),
    getSiteSettings(locale),
  ])

  const t = createTranslator(MESSAGES, locale)
  const brandName = settings.company_name || 'zonadehobbies'
  const slugLocal = entry.slug_localizado ?? entry.slug
  const pageUrl = absoluteUrl(
    buildLocalizedPath(`/guias/${slugLocal}`, locale, { prefixDefaultLocale: false }),
  )
  const origin = absoluteUrl('/').replace(/\/+$/, '')
  const hubUrl = absoluteUrl(buildLocalizedPath('/guias', locale, { prefixDefaultLocale: false }))

  // JSON-LD en servidor: un único @graph con artículo, productos, FAQ y migas.
  const jsonLd = buildEntryJsonLd({
    article: {
      url: pageUrl,
      headline: entry.titulo,
      description: entry.resumen ?? undefined,
      image: entry.hero_image_url ? absoluteUrl(entry.hero_image_url) : absoluteUrl(OG_IMAGE_PATH),
      datePublished: entry.publicado_en ?? undefined,
      dateModified: entry.updated_at,
      author: entry.autor ?? undefined,
      keywords: entry.keywords ?? [],
      section: t('entry.eyebrow'),
      inLanguage: locale,
      publisher: { name: brandName, logoUrl: settings.logo_url ?? undefined },
    },
    items: entry.products.map((producto) => ({
      name: producto.name,
      url: absoluteUrl(
        buildLocalizedPath(`/productos/${producto.slug}`, locale, { prefixDefaultLocale: false }),
      ),
    })),
    itemsName: entry.titulo,
    faq: entry.faq,
    breadcrumb: [
      { name: t('nav.home'), url: origin },
      { name: t('entry.indexTitle'), url: hubUrl },
      { name: entry.titulo, url: pageUrl },
    ],
  })

  const products: EntryViewProduct[] = entry.products.map((producto) => ({
    slug: producto.slug,
    nombre: producto.name,
    imagenUrl: producto.image_url,
    precioUsd: producto.price_usd,
    nota: producto.nota,
  }))

  const categories = entry.categories.map((categoria) => ({
    nombre: categoria.name,
    slugLocalizado: categoria.slug_localizado ?? categoria.slug,
  }))

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <EntryPageView
        entry={{
          slug: entry.slug,
          slugLocalizado: slugLocal,
          titulo: entry.titulo,
          resumen: entry.resumen,
          cuerpoHtml: entry.cuerpo_html,
          comparativa: entry.comparativa,
          faq: entry.faq,
          angulo: entry.angulo,
          heroImageUrl: entry.hero_image_url,
          lecturaMinutos: entry.lectura_minutos,
          autor: entry.autor,
          actualizadoEn: entry.updated_at,
        }}
        products={products}
        categories={categories}
        related={related.map(toCard)}
        navLinks={settings.nav_links}
        brand={{
          name: brandName,
          tagline: settings.tagline || '',
          logoUrl: settings.logo_url,
          iconUrl: settings.icon_url,
          whatsapp: settings.whatsapp_number,
        }}
        footer={settings.footer_texts}
        social={settings.social_links}
        brandAddress={settings.address}
        locale={locale}
      />
    </>
  )
}
