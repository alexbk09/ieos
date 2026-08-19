import { CatalogView } from '@/components/catalog-view'
import { getCatalogPage, getCategories } from '@/services/catalog'
import { getOfficialExchangeRate } from '@/services/exchange-rate'

/** Página pública: Catálogo completo con filtros e infinite scroll. */
export default async function CatalogPage() {
  const [{ products, total }, { data: categoriesData }, { rate }] = await Promise.all([
    getCatalogPage({}, 0),
    getCategories(),
    getOfficialExchangeRate(),
  ])

  const categories = (categoriesData ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug }))

  return (
    <CatalogView
      initialProducts={(products ?? []).map((p) => ({ ...p, image_url: p.image_url ?? '', colors: p.colors ?? [], specifications: p.specifications ?? {} }))}
      total={total}
      categories={categories}
      exchangeRate={rate}
    />
  )
}
