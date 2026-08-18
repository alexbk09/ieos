import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { RequestManager } from '@/components/request-manager'
import { getRequestsWithItems } from '@/services/requests'

/**
 * Página de administración de solicitudes.
 * Los datos se obtienen a través de /services/requests.
 */
export default async function RequestsPage() {
  await requireAdmin()
  const { data: requests } = await getRequestsWithItems()

  return (
    <AdminShell>
      <AdminPageHeader eyebrow="Operaciones" title="Solicitudes" description="Revisa qué pidió cada cliente y actualiza el estado." />
      <div className="p-5 sm:p-8">
        <RequestManager initialRequests={requests ?? []} />
      </div>
    </AdminShell>
  )
}