import type { Metadata } from 'next'
import { CatalogView } from '@/components/catalog-view'
import { getCatalogPage, getCategoryNav } from '@/services/catalog'
import { getMarcasActivas } from '@/services/marcas'
import { getSiteSettings } from '@/services/site-settings'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { OG_IMAGE_PATH } from '@/lib/constants'

/** ISR: el catálogo se sirve desde CDN y se revalida cada 5 min. */
export const revalidate = false

/** Genera el HTML estático del catálogo por cada idioma publicado. */
export function generateStaticParams() {
  return publishedLocales().map((locale) => ({ locale }))
}

/**
 * Metadata SEO del catálogo: title/description/canonical/OG propios + hreflang
 * (alternates.languages) por cada idioma publicado.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const { settings } = await getSiteSettings(locale)
  const name = settings.company_name || 'zonadehobbies'
  const description =
    settings.hero_texts?.description ??
    `Explora el catálogo completo de ofertas de AliExpress curadas por ${name}: precios verificados, reseñas reales y envío internacional con compra segura.`

  const alternatesByLocale = Object.fromEntries(
    publishedLocales().map((l) => [l, buildLocalizedPath('/catalogo', l, { prefixDefaultLocale: false })]),
  )

  return buildPageMetadata({
    title: `Catálogo de ofertas y productos | ${name}`,
    description,
    path: buildLocalizedPath('/catalogo', locale, { prefixDefaultLocale: false }),
    // Imagen social por defecto (el catálogo hereda la OG de marca).
    image: absoluteUrl(OG_IMAGE_PATH),
    siteName: name,
    alternatesByLocale,
  })
}

/** Página pública: Catálogo completo con filtros e infinite scroll. La tasa se obtiene en cliente. */
export default async function CatalogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params

  const [{ products, total }, { items: categoriesData }, { data: marcas }, { settings }] =
    await Promise.all([
      getCatalogPage({}, 0, locale),
      // Solo categorías CON productos: filtrar por una categoría vacía da 0 resultados.
      getCategoryNav(100, locale),
      getMarcasActivas(),
      getSiteSettings(locale),
    ])

  const categories = (categoriesData ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))

  return (
    <CatalogView
      initialProducts={(products ?? []).map((p) => ({ ...p, image_url: p.image_url ?? '', colors: p.colors ?? [], specifications: p.specifications ?? {} }))}
      total={total}
      categories={categories}
      marcas={(marcas ?? []).map((m) => ({ id: m.id, nombre: m.nombre }))}
      navLinks={settings.nav_links}
      brand={{ name: settings.company_name, tagline: settings.tagline, logoUrl: settings.logo_url, iconUrl: settings.icon_url, whatsapp: settings.whatsapp_number }}
      footer={settings.footer_texts}
      social={settings.social_links}
      brandAddress={settings.address}
    />
  )
}
