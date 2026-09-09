import type { Metadata } from 'next'
import { CatalogView } from '@/components/catalog-view'
import { getCatalogPage, getCategoriesActivas } from '@/services/catalog'
import { getMarcasActivas } from '@/services/marcas'
import { getSiteSettings } from '@/services/site-settings'
import { buildPageMetadata } from '@/lib/seo'

/** ISR: el catálogo se sirve desde CDN y se revalida cada 5 min. */
export const revalidate = 300

/**
 * Metadata SEO del catálogo (Fase 1).
 * Antes esta página no exportaba generateMetadata y Google veía el
 * <title> genérico del layout raíz. Ahora emite title/description/
 * canonical/OG/twitter propios para rankear por keywords de catálogo.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSiteSettings()
  const name = settings.company_name || 'ilumaX'
  const tagline = settings.tagline || 'Arquitectura de luz'
  const description =
    settings.hero_texts?.description ??
    `Explora el catálogo completo de ${name}: productos seleccionados con envío internacional y compra segura.`

  return buildPageMetadata({
    title: `Catálogo de productos — ${name} | ${tagline}`,
    description,
    path: '/catalogo',
    siteName: name,
  })
}

/** Página pública: Catálogo completo con filtros e infinite scroll. La tasa se obtiene en cliente. */
export default async function CatalogPage() {

  const [{ products, total }, { data: categoriesData }, { data: marcas }, { settings }] =
    await Promise.all([
      getCatalogPage({}, 0),
      getCategoriesActivas(),
      getMarcasActivas(),
      getSiteSettings(),
    ])

  const categories = (categoriesData ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))

  return (
    <CatalogView
      initialProducts={(products ?? []).map((p) => ({ ...p, image_url: p.image_url ?? '', colors: p.colors ?? [], specifications: p.specifications ?? {} }))}
      total={total}
      categories={categories}
      marcas={(marcas ?? []).map((m) => ({ id: m.id, nombre: m.nombre }))}
      navLinks={settings.nav_links}
      brand={{ name: settings.company_name, tagline: settings.tagline, logoUrl: settings.logo_url, iconUrl: settings.icon_url }}
      footer={settings.footer_texts}
      social={settings.social_links}
      brandAddress={settings.address}
    />
  )
}
