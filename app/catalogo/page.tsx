import { CatalogView } from '@/components/catalog-view'
import { getCatalogPage, getCategories } from '@/services/catalog'
import { getSiteSettings } from '@/services/site-settings'

/** ISR: el catálogo se sirve desde CDN y se revalida cada 5 min. */
export const revalidate = 300

/** Página pública: Catálogo completo con filtros e infinite scroll. La tasa se obtiene en cliente. */
export default async function CatalogPage() {
  const [{ products, total }, { data: categoriesData }, { settings }] = await Promise.all([
    getCatalogPage({}, 0),
    getCategories(),
    getSiteSettings(),
  ])

  const categories = (categoriesData ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))

  return (
    <CatalogView
      initialProducts={(products ?? []).map((p) => ({ ...p, image_url: p.image_url ?? '', colors: p.colors ?? [], specifications: p.specifications ?? {} }))}
      total={total}
      categories={categories}
      navLinks={settings.nav_links}
      brand={{ name: settings.company_name, tagline: settings.tagline, logoUrl: settings.logo_url, iconUrl: settings.icon_url }}
    />
  )
}
