import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { RequestManager } from '@/components/request-manager'
import { getRequestsWithItems } from '@/services/requests'
import { getOfficialExchangeRate } from '@/services/exchange-rate'

/**
 * Página de administración de solicitudes.
 * Los datos se obtienen a través de /services/requests.
 * La tasa oficial del día (dolarapi.com) se pasa al RequestManager.
 */
export default async function RequestsPage() {
  await requireAdmin()
  const [{ data: requests }, { rate }] = await Promise.all([
    getRequestsWithItems(),
    getOfficialExchangeRate(),
  ])

  return (
<>
      <AdminPageHeader eyebrow="Operaciones" title="Solicitudes" description="Revisa qué pidió cada cliente y actualiza el estado." />
      <div className="p-5 sm:p-8">
        <RequestManager initialRequests={requests ?? []} exchangeRate={rate} />
      </div>
  
</>)
}