import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { getTransportistas } from '@/services/transportistas'
import { TransportistasManager } from '@/components/transportistas-manager'
import { TRANSPORTISTAS_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Transportistas".
 * Lista, crea, edita y busca transportistas con permisos por rol.
 */
export default async function TransportistasPage() {
  await requireAdmin()

  const canRead = await hasPermission(TRANSPORTISTAS_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader eyebrow="Logística" title="Transportistas" description="Gestión de transportistas internos y externos." />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  const { data: transportistas } = await getTransportistas()

  return (
<>
      <AdminPageHeader
        eyebrow="Logística"
        title="Transportistas"
        description="Gestiona transportistas internos y externos con su vehículo, placa y estado."
      />
      <div className="p-5 sm:p-8">
        <TransportistasManager initialTransportistas={transportistas ?? []} />
      </div>
  
</>)
}