import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { InvoiceSettingsManager } from '@/components/invoice-settings-manager'
import { getInvoiceSettings, getInvoicesWithDetails, getInvoiceableRequests } from '@/services/invoicing'

/**
 * Módulo de Facturación (independiente, ya no vive dentro de Configuración).
 * Permite configurar el emisor (RIF, razón social), IVA, correlativos y
 * gestionar las facturas electrónicas SENIAT (emitir desde solicitud,
 * ver detalle y anular).
 */
export default async function FacturacionPage() {
  await requireAdmin()
  const [{ settings }, { data: invoices }, { data: availableRequests }] = await Promise.all([
    getInvoiceSettings(),
    getInvoicesWithDetails(),
    getInvoiceableRequests(),
  ])

  return (
<>
      <AdminPageHeader
        eyebrow="Finanzas"
        title="Facturación"
        description="Emite y gestiona facturas electrónicas conforme a las normas del SENIAT."
      />
      <div className="p-5 sm:p-8">
        <InvoiceSettingsManager
          initialSettings={settings}
          initialInvoices={invoices ?? []}
          availableRequests={availableRequests ?? []}
        />
      </div>
  
</>)
}