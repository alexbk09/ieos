import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { CategorySeoManager } from '@/components/category-seo-manager'

/**
 * Página admin del módulo "SEO de Categorías" (hubs pSEO).
 * ------------------------------------------------------------------
 * - requireAdmin() del layout /admin + verificación explícita aquí.
 * - El acceso RBAC real (módulo 'categorias_seo') se valida en la API
 *   route /api/admin/categorias/seo (regla de oro).
 * - El manager cliente permite editar o regenerar con IA el contenido
 *   de nicho de cada categoría (título largo, guía de compra y FAQ).
 */
export default async function CategorySeoPage() {
  await requireAdmin()

  return (
    <>
      <AdminPageHeader
        eyebrow="Catálogo · SEO · Hub de nicho"
        title="SEO de Categorías"
        description="Edita el título largo, la guía de compra y las preguntas frecuentes visibles de cada categoría."
      />
      <div className="p-5 sm:p-8">
        <CategorySeoManager />
      </div>
    </>
  )
}
