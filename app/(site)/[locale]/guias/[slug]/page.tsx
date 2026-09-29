import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EntryPageView, type EntryViewProduct } from '@/components/entry-page-view'
import type { EntryCardData } from '@/components/entry-card'
import { getCategoryNav } from '@/services/catalog'
import {
  getEntrySlugs,
  getPublishedEntryBySlug,
  getRelatedEntries,
  entryHeroImage,
  type Entry,
} from '@/services/entries'
import { getSiteSettings } from '@/services/site-settings'
import { MESSAGES, createTranslator } from '@/lib/i18n-messages'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteAssetUrl, absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { storedPriceToUsd } from '@/lib/display-price'
// Resolución del enlace de salida (AliExpress → Amazon → tienda): una sola fuente.
import { preferAffiliateUrl } from '@/lib/affiliate'
import { OG_IMAGE_PATH, ENTRY_REQUIRED_SECTIONS } from '@/lib/constants'
import { buildEntryJsonLd, tieneSeccionEnCuerpo } from '@/lib/entry-rules'
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

export const revalidate = false

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
    heroImageUrl: entryHeroImage(entry),
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
  // Imagen social: la de la entrada o, si no hay, la del primer producto
  // comparado (mucho mejor que el logo genérico al compartir en redes).
  const heroImage = entryHeroImage(entry)

  return buildPageMetadata({
    title: entry.titulo,
    description: descripcion,
    path: buildLocalizedPath(`/guias/${slugLocal}`, locale, { prefixDefaultLocale: false }),
    image: absoluteAssetUrl(heroImage) || absoluteUrl(OG_IMAGE_PATH),
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

  // Imagen principal: la propia de la entrada o la del primer producto comparado.
  const heroImage = entryHeroImage(entry)

  // Si el artículo YA incluye su sección de "Preguntas Frecuentes" dentro del
  // cuerpo, el bloque estructurado del pie se oculta: mostrar ambos duplicaría
  // las mismas preguntas (mala UX y contenido repetido en la misma página).
  const faqEnCuerpo = tieneSeccionEnCuerpo(
    entry.cuerpo_html ?? '',
    ENTRY_REQUIRED_SECTIONS[ENTRY_REQUIRED_SECTIONS.length - 1],
  )

  // JSON-LD en servidor: un único @graph con artículo, productos, FAQ y migas.
  const jsonLd = buildEntryJsonLd({
    article: {
      url: pageUrl,
      headline: entry.titulo,
      description: entry.resumen ?? undefined,
      image: absoluteAssetUrl(heroImage) || absoluteUrl(OG_IMAGE_PATH),
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
    id: producto.id,
    slug: producto.slug,
    nombre: producto.name,
    imagenUrl: producto.image_url,
    // Precio de vitrina en dólares: los productos de afiliado se guardan en EUR
    // (AliExpress) y se convierten con la MISMA regla que el catálogo, para que
    // la guía y la ficha del producto nunca muestren cifras distintas.
    precioUsd: storedPriceToUsd(
      Number(producto.price_usd),
      Boolean(producto.url_afiliado_ali || producto.url_afiliado_amazon || producto.url_afiliado_store),
    ),
    nota: producto.nota,
    // CTA "Ver Oferta en …": la URL real de salida y el estado verificado del
    // marketplace viajan ya resueltos (la vista es presentacional).
    urlAfiliado: preferAffiliateUrl(producto),
    aliStatus: producto.ali_status ?? null,
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
          heroImageUrl: heroImage,
          lecturaMinutos: entry.lectura_minutos,
          autor: entry.autor,
          actualizadoEn: entry.updated_at,
        }}
        products={products}
        categories={categories}
        related={related.map(toCard)}
        faqEnCuerpo={faqEnCuerpo}
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
