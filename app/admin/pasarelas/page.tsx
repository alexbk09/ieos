import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { getPagos, getPasarelas } from '@/services/pasarelas'
import { PasarelasManager } from '@/components/pasarelas-manager'
import { PASARELAS_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Pasarelas de Pago".
 * Integra botones de pago directo para tarjetas de crédito, PayPal
 * y billeteras digitales.
 */
export default async function PasarelasPage() {
  await requireAdmin()

  const canRead = await hasPermission(PASARELAS_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader eyebrow="Finanzas" title="Pasarelas de Pago" description="Pagos directos con tarjetas, PayPal y billeteras." />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  const [{ data: pasarelas }, { data: pagos }] = await Promise.all([
    getPasarelas(),
    getPagos(),
  ])

  return (
<>
      <AdminPageHeader
        eyebrow="Finanzas"
        title="Pasarelas de Pago"
        description="Integra botones de pago directo para tarjetas, PayPal y billeteras digitales."
      />
      <div className="p-5 sm:p-8">
        <PasarelasManager initialPasarelas={pasarelas ?? []} initialPagos={pagos ?? []} />
      </div>
  
</>)
}