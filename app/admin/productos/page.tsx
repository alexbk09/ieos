import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { ProductManager } from '@/components/product-manager'
import { getProductsWithCategories } from '@/services/catalog'
import { getMarcasActivas } from '@/services/marcas'
import { getProveedoresActivos } from '@/services/proveedores'

/**
 * Página de administración de productos.
 * Los datos se obtienen a través de /services/catalog.
 */
export default async function ProductsPage() {
  await requireAdmin()
  const [{ products, categories }, { data: marcas }, { data: proveedores }] = await Promise.all([
    getProductsWithCategories(),
    getMarcasActivas(),
    getProveedoresActivos(),
  ])

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Administra inventario, precios, marcas y proveedores."
      />
      <div className="p-5 sm:p-8">
        <ProductManager
          initialProducts={products ?? []}
          categories={categories ?? []}
          marcas={marcas ?? []}
          proveedores={proveedores ?? []}
        />
      </div>
    </AdminShell>
  )
}
