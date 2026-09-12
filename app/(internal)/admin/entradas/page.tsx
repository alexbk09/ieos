import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { EntryManager } from '@/components/entry-manager'

/**
 * Página admin del módulo "Guías y Comparativas" (entradas SEO).
 * ------------------------------------------------------------------
 * - requireAdmin() del layout /admin + verificación explícita aquí.
 * - El acceso RBAC real (módulo 'guias_comparativas') se valida en las rutas
 *   /api/admin/entradas* (regla de oro).
 * - El manager permite generar entradas con IA (una a una), editarlas,
 *   traducirlas y publicarlas.
 */
export default async function EntradasPage() {
  await requireAdmin()

  return (
    <>
      <AdminPageHeader
        eyebrow="Catálogo · SEO · Contenido"
        title="Guías y Comparativas"
        description="Crea entradas editoriales (comparativas, guías de compra, tops y casos de uso) con ayuda de la IA, revísalas, tradúcelas y publícalas. Cada entrada publicada enlaza tus hubs y tus productos, y entra automáticamente al sitemap."
      />
      <div className="p-5 sm:p-8">
        <EntryManager />
      </div>
    </>
  )
}
