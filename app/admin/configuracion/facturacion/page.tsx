import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { InvoiceSettingsManager } from '@/components/invoice-settings-manager'
import { getInvoiceSettings, getInvoicesWithDetails, getInvoiceableRequests } from '@/services/invoicing'

/**
 * Página de administración de facturación venezolana (SENIAT).
 * Permite configurar el emisor (RIF, razón social), IVA y régimen,
 * los correlativos de factura y número de control, y gestionar las
 * facturas emitidas (emitir desde una solicitud, ver detalle, anular).
 * Los datos se obtienen a través de /services/invoicing.
 */
export default async function InvoicingPage() {
  await requireAdmin()
  const [{ settings }, { data: invoices }, { data: availableRequests }] = await Promise.all([
    getInvoiceSettings(),
    getInvoicesWithDetails(),
    getInvoiceableRequests(),
  ])

  return (
<>
      <AdminPageHeader
        eyebrow="Sitio"
        title="Facturación"
        description="Configura RIF, IVA, correlativos y facturas según las normas del SENIAT."
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