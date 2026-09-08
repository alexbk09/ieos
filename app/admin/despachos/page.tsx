import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { getDespachos, getSolicitudesDespachables, getTransportistas } from '@/services/despachos'
import { getAlmacenes } from '@/services/almacenes'
import { DespachosManager } from '@/components/despachos-manager'
import { DESPACHOS_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Despacho y Rutas".
 * Organiza las entregas diarias, asigna transportistas y actualiza
 * estados de envío en tiempo real (programado → en_ruta → entregado).
 */
export default async function DespachosPage() {
  await requireAdmin()

  const canRead = await hasPermission(DESPACHOS_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader eyebrow="Logística" title="Despacho y Rutas" description="Organiza las entregas diarias y asigna transportistas." />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  const [{ data: despachos }, { data: solicitudes }, { data: transportistas }, { data: almacenes }] = await Promise.all([
    getDespachos(),
    getSolicitudesDespachables(),
    getTransportistas(),
    getAlmacenes(),
  ])

  return (
<>
      <AdminPageHeader
        eyebrow="Logística"
        title="Despacho y Rutas"
        description="Organiza entregas, asigna transportistas y actualiza estados de envío en tiempo real."
      />
      <div className="p-5 sm:p-8">
        <DespachosManager
          initialDespachos={despachos ?? []}
          initialSolicitudes={solicitudes ?? []}
          initialTransportistas={transportistas ?? []}
          initialAlmacenes={almacenes ?? []}
        />
      </div>
  
</>)
}