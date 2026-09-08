import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { getBancos, getMovimientos } from '@/services/conciliacion'
import { ConciliacionManager } from '@/components/conciliacion-manager'
import { CONCILIACION_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Conciliación Bancaria".
 * Valida pagos móviles y transferencias automáticamente mediante
 * lectura de notificaciones o APIs bancarias.
 */
export default async function ConciliacionPage() {
  await requireAdmin()

  const canRead = await hasPermission(CONCILIACION_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader eyebrow="Finanzas" title="Conciliación Bancaria" description="Validación de pagos móviles y transferencias." />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  const [{ data: movimientos }, { data: bancos }] = await Promise.all([
    getMovimientos(),
    getBancos(),
  ])

  return (
<>
      <AdminPageHeader
        eyebrow="Finanzas"
        title="Conciliación Bancaria"
        description="Valida pagos móviles y transferencias mediante APIs bancarias o carga manual."
      />
      <div className="p-5 sm:p-8">
        <ConciliacionManager initialMovimientos={movimientos ?? []} initialBancos={bancos ?? []} />
      </div>
  
</>)
}