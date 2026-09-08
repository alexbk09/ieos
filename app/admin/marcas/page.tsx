import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { MarcaManager } from '@/components/marca-manager'
import { getMarcas } from '@/services/marcas'

/**
 * Página de administración de marcas.
 * Los datos se obtienen a través de /services/marcas.
 */
export default async function MarcasPage() {
  await requireAdmin()
  const { data: marcas, error } = await getMarcas()

  return (
<>
      <AdminPageHeader
        eyebrow="Catálogo"
        title="Marcas"
        description="Administra las marcas de los productos."
      />
      <div className="p-5 sm:p-8">
        {error && (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            No se pudieron cargar las marcas: {error.message}
          </div>
        )}
        <MarcaManager initialMarcas={marcas ?? []} />
      </div>
  
</>)
}