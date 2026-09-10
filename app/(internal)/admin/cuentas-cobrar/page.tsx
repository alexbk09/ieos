import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { getCuentasPorCobrar } from '@/services/cuentas-cobrar'
import { CuentasCobrarManager } from '@/components/cuentas-cobrar-manager'
import { CUENTAS_COBRAR_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Cuentas por Cobrar".
 * Registra abonos a facturas, plazos de pago y límites de crédito
 * aprobados para los clientes.
 */
export default async function CuentasCobrarPage() {
  await requireAdmin()

  const canRead = await hasPermission(CUENTAS_COBRAR_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader eyebrow="Finanzas" title="Cuentas por Cobrar" description="Abonos, plazos de pago y límites de crédito." />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  const { data: cuentas } = await getCuentasPorCobrar()

  return (
<>
      <AdminPageHeader
        eyebrow="Finanzas"
        title="Cuentas por Cobrar"
        description="Registra abonos a facturas, plazos de pago y límites de crédito aprobados."
      />
      <div className="p-5 sm:p-8">
        <CuentasCobrarManager initialCuentas={cuentas ?? []} />
      </div>
  
</>)
}