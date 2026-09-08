import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { CategoryManager } from '@/components/category-manager'
import { getCategories } from '@/services/catalog'

/**
 * Página de administración de categorías.
 * Los datos se obtienen a través de /services/catalog.
 */
export default async function CategoriesPage() {
  await requireAdmin()
  const { data: categories } = await getCategories()

  return (
<>
      <AdminPageHeader eyebrow="Organización" title="Categorías" description="Agrupa el catálogo para que sea fácil de explorar." />
      <div className="p-5 sm:p-8">
        <CategoryManager initialCategories={categories ?? []} />
      </div>
  
</>)
}