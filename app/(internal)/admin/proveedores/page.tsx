import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { ProveedorManager } from '@/components/proveedor-manager'
import { getProveedores } from '@/services/proveedores'

/**
 * Página de administración de proveedores.
 * Los datos se obtienen a través de /services/proveedores.
 */
export default async function ProveedoresPage() {
  await requireAdmin()
  const { data: proveedores, error } = await getProveedores()

  return (
<>
      <AdminPageHeader
        eyebrow="Catálogo"
        title="Proveedores"
        description="Administra los proveedores de los productos."
      />
      <div className="p-5 sm:p-8">
        {error && (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            No se pudieron cargar los proveedores: {error.message}
          </div>
        )}
        <ProveedorManager initialProveedores={proveedores ?? []} />
      </div>
  
</>)
}