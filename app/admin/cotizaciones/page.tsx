import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { QuoteManager } from '@/components/quote-manager'
import { getQuotesWithItems, getQuoteSettings } from '@/services/quotes'
import { getProductsWithCategories } from '@/services/catalog'
import { getAdminSiteSettings } from '@/services/site-settings'
import { getInvoiceSettings } from '@/services/invoicing'
import { getOfficialExchangeRate } from '@/services/exchange-rate'

/**
 * Página de administración de cotizaciones.
 * Los datos se obtienen a través de /services/quotes y /services/catalog.
 * La tasa oficial del día (dolarapi.com) se pasa al QuoteManager.
 * Los datos fiscales del emisor (RIF, razón social) se obtienen de invoice_settings.
 */
export default async function QuotesPage() {
  await requireAdmin()
  const [
    { data: quotes },
    { settings: quoteSettings },
    { products },
    { settings: siteSettings },
    { settings: invoiceManagerSettings },
    { rate },
  ] = await Promise.all([
    getQuotesWithItems(),
    getQuoteSettings(),
    getProductsWithCategories(),
    getAdminSiteSettings(),
    getInvoiceSettings(),
    getOfficialExchangeRate(),
  ])

  return (
<>
      <AdminPageHeader eyebrow="Comercial" title="Cotizaciones" description="Crea cotizaciones con descuentos, envía por correo y convierte a solicitudes." />
      <div className="p-5 sm:p-8">
        <QuoteManager
          initialQuotes={quotes ?? []}
          products={products ?? []}
          exchangeRate={rate}
          quoteSettings={quoteSettings}
          siteSettings={siteSettings}
          invoiceSettings={
            invoiceManagerSettings
              ? {
                  issuer_name: invoiceManagerSettings.issuer_name,
                  issuer_rif: invoiceManagerSettings.issuer_rif,
                  issuer_address: invoiceManagerSettings.issuer_address,
                }
              : null
          }
        />
      </div>
  
</>)
}