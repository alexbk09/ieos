import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { ProductManager } from '@/components/product-manager'
import { getProductsWithCategories } from '@/services/catalog'

/**
 * Página de administración de productos.
 * Los datos se obtienen a través de /services/catalog.
 */
export default async function ProductsPage() {
  await requireAdmin()
  const { products, categories } = await getProductsWithCategories()

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Administra inventario, precios e imágenes."
      />
      <div className="p-5 sm:p-8">
        <ProductManager initialProducts={products ?? []} categories={categories ?? []} />
      </div>
    </AdminShell>
  )
}