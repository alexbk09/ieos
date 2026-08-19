import { CatalogView } from '@/components/catalog-view'
import { getCatalogPage, getCategories } from '@/services/catalog'

/** ISR: el catálogo se sirve desde CDN y se revalida cada 5 min. */
export const revalidate = 300

/** Página pública: Catálogo completo con filtros e infinite scroll. La tasa se obtiene en cliente. */
export default async function CatalogPage() {
  const [{ products, total }, { data: categoriesData }] = await Promise.all([
    getCatalogPage({}, 0),
    getCategories(),
  ])

  const categories = (categoriesData ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))

  return (
    <CatalogView
      initialProducts={(products ?? []).map((p) => ({ ...p, image_url: p.image_url ?? '', colors: p.colors ?? [], specifications: p.specifications ?? {} }))}
      total={total}
      categories={categories}
    />
  )
}