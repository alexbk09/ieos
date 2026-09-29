import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CategoryHubView } from '@/components/category-hub-view'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { OG_IMAGE_PATH } from '@/lib/constants'
import { clampText, htmlToPlainText } from '@/lib/schema/product-schema'
import { getPrimaryCategoryBySlug, getPrimaryCategorySlugs, getSubcategoriesByParent } from '@/services/catalog'
import { getSiteSettings } from '@/services/site-settings'

export const revalidate = false

export async function generateStaticParams() {
  const { items } = await getPrimaryCategorySlugs()
  return publishedLocales().flatMap((locale) =>
    items.map((item) => ({ locale, slug: item.slug_i18n?.[locale] ?? item.slug })),
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}): Promise<Metadata> {
  const { locale, slug } = await params
  const [{ category }, { settings }] = await Promise.all([
    getPrimaryCategoryBySlug(slug, locale),
    getSiteSettings(locale),
  ])
  if (!category) return { title: 'Hobby no encontrado' }

  const name = settings.company_name || 'Zona de Hobbies'
  const canonicalSlug = category.slug_localizado ?? category.slug
  const description = category.seo_intro
    ? clampText(htmlToPlainText(category.seo_intro), 300)
    : category.description ?? `Explora categorías y productos de ${category.name}.`
  const alternatesByLocale = Object.fromEntries(
    publishedLocales().map((itemLocale) => [
      itemLocale,
      buildLocalizedPath(
        `/${category.slug_i18n?.[itemLocale] ?? category.slug}`,
        itemLocale,
        { prefixDefaultLocale: false },
      ),
    ]),
  )

  return buildPageMetadata({
    title: `${category.seo_title?.trim() || category.name} | ${name}`,
    description,
    path: buildLocalizedPath(`/${canonicalSlug}`, locale, { prefixDefaultLocale: false }),
    image: absoluteUrl(OG_IMAGE_PATH),
    siteName: name,
    robots: 'index, follow',
    alternatesByLocale,
  })
}

export default async function CategoryHubPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  const [{ category }, { settings }] = await Promise.all([
    getPrimaryCategoryBySlug(slug, locale),
    getSiteSettings(locale),
  ])
  if (!category) notFound()

  const { items: subcategories } = await getSubcategoriesByParent(category.id, locale)
  if (subcategories.length === 0) notFound()

  const canonicalSlug = category.slug_localizado ?? category.slug
  const origin = absoluteUrl('/').replace(/\/+$/, '')
  const pageUrl = absoluteUrl(buildLocalizedPath(`/${canonicalSlug}`, locale, { prefixDefaultLocale: false }))
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: origin },
          { '@type': 'ListItem', position: 2, name: category.name, item: pageUrl },
        ],
      },
      {
        '@type': 'ItemList',
        name: category.name,
        itemListElement: subcategories.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          url: absoluteUrl(
            buildLocalizedPath(`/categoria/${item.slug_localizado ?? item.slug}`, locale, {
              prefixDefaultLocale: false,
            }),
          ),
        })),
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <CategoryHubView
        category={{ name: category.name, slug: category.slug, description: category.description }}
        subcategories={subcategories}
        navLinks={settings.nav_links}
        brand={{
          name: settings.company_name || 'Zona de Hobbies',
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