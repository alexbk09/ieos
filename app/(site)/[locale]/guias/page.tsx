import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EntryIndexView } from '@/components/entry-index-view'
import type { EntryCardData } from '@/components/entry-card'
import { getCategoryNav } from '@/services/catalog'
import { listPublishedEntries, type Entry } from '@/services/entries'
import { getSiteSettings } from '@/services/site-settings'
import { MESSAGES, createTranslator } from '@/lib/i18n-messages'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { OG_IMAGE_PATH } from '@/lib/constants'
import { buildBreadcrumbSchema, buildItemListSchema } from '@/lib/entry-rules'

/**
 * Hub de contenido: /guias (guías, comparativas y consejos de compra).
 * ------------------------------------------------------------------
 * Estrategia pSEO:
 *  - SSG + ISR (300s): el HTML con el H1, la introducción y TODAS las tarjetas
 *    se sirve estático desde CDN, así que Google lo rastrea sin ejecutar JS.
 *  - Es el nodo que enlaza los clusters: hub → entradas → productos y nichos.
 *  - Solo muestra entradas PUBLICADAS (la RLS pública no expone borradores).
 *  - No fabrica contenido: título y descripción salen del diccionario i18n.
 */

export const revalidate = 300

/** El hub existe en CADA idioma publicado (aunque aún no tenga entradas). */
export function generateStaticParams() {
  return publishedLocales().map((locale) => ({ locale }))
}

/** Serializa una entrada a la forma mínima de la tarjeta. */
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

/** Metadata del hub: canonical + hreflang en todos los idiomas publicados. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!publishedLocales().includes(locale)) return {}

  const t = createTranslator(MESSAGES, locale)
  const { settings } = await getSiteSettings(locale)
  const titulo = settings.company_name
    ? t('entry.indexTitle') + ' | ' + settings.company_name
    : t('entry.indexTitle')

  return buildPageMetadata({
    title: titulo,
    description: t('entry.indexSubtitle'),
    path: buildLocalizedPath('/guias', locale, { prefixDefaultLocale: false }),
    image: absoluteUrl(OG_IMAGE_PATH),
    siteName: settings.company_name || undefined,
    alternatesByLocale: Object.fromEntries(
      publishedLocales().map((l) => [
        l,
        buildLocalizedPath('/guias', l, { prefixDefaultLocale: false }),
      ]),
    ),
  })
}

export default async function GuiasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Blindaje: solo idiomas PUBLICADOS (evita exponer versiones a medias).
  if (!publishedLocales().includes(locale)) notFound()

  const [{ entries }, { items: navCategories }, { settings }] = await Promise.all([
    listPublishedEntries({ locale }),
    getCategoryNav(undefined, locale),
    getSiteSettings(locale),
  ])

  const t = createTranslator(MESSAGES, locale)
  const origin = absoluteUrl('/').replace(/\/+$/, '')
  const hubUrl = absoluteUrl(buildLocalizedPath('/guias', locale, { prefixDefaultLocale: false }))

  // JSON-LD del hub: migas + lista ordenada de las guías (Rich Results).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      buildBreadcrumbSchema([
        { name: t('nav.home'), url: origin },
        { name: t('entry.indexTitle'), url: hubUrl },
      ]),
      buildItemListSchema(
        entries.map((entry) => ({
          name: entry.titulo,
          url: absoluteUrl(
            buildLocalizedPath(
              '/guias/' + (entry.slug_localizado ?? entry.slug),
              locale,
              { prefixDefaultLocale: false },
            ),
          ),
        })),
        t('entry.indexTitle'),
      ),
    ].filter(Boolean),
  }

  const brandName = settings.company_name || 'zonadehobbies'

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <EntryIndexView
        entries={entries.map(toCard)}
        categories={navCategories}
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
      />
    </>
  )
}
