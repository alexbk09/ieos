import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { getZonasEnvio } from '@/services/envios'
import { ZonasEnvioManager } from '@/components/zonas-envio-manager'
import { ENVIOS_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Zonas de Envío".
 * Configura costos dinámicos de delivery según el peso volumétrico
 * y el destino de la mercancía (zonas con tarifa plana y por kg).
 */
export default async function EnviosPage() {
  await requireAdmin()

  const canRead = await hasPermission(ENVIOS_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader eyebrow="Logística" title="Zonas de Envío" description="Cálculo de envío por zonas y peso volumétrico." />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  const { data: zonas } = await getZonasEnvio()

  return (
<>
      <AdminPageHeader
        eyebrow="Logística"
        title="Zonas de Envío"
        description="Configura costos dinámicos de delivery según el peso volumétrico y el destino."
      />
      <div className="p-5 sm:p-8">
        <ZonasEnvioManager initialZonas={zonas ?? []} />
      </div>
  
</>)
}