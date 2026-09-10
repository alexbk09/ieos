import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { SiteSettingsManager } from '@/components/site-settings-manager'
import { QuoteSettingsManager } from '@/components/quote-settings-manager'
import { getAdminSiteSettings } from '@/services/site-settings'
import { getQuoteSettings } from '@/services/quotes'

/**
 * Página de administración de la configuración del sitio.
 * Permite editar marca (nombre/logo/ícono), menú, portada, studio,
 * contacto, footer y redes sociales. También permite configurar el
 * módulo de cotizaciones (descuento efectivo divisas, validez, nota).
 * Los datos se obtienen a través de /services/site-settings y /services/quotes.
 */
export default async function SettingsPage() {
  await requireAdmin()
  const [{ settings }, { settings: quoteSettings }] = await Promise.all([
    getAdminSiteSettings(),
    getQuoteSettings(),
  ])

  return (
<>
      <AdminPageHeader
        eyebrow="Sitio"
        title="Configuración"
        description="Edita el nombre, logo, ícono, textos e imágenes de toda la tienda."
      />
      <div className="grid gap-6 p-5 sm:p-8">
        <SiteSettingsManager initialSettings={settings} />
        <section className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="border-b border-border px-6 py-5">
            <h2 className="font-semibold tracking-tight">Cotizaciones</h2>
            <p className="mt-1 text-sm text-muted-foreground">Configura el descuento por pago en efectivo en divisas y la validez de las cotizaciones.</p>
          </div>
          <div className="p-6">
            <QuoteSettingsManager initialSettings={quoteSettings} />
          </div>
        </section>
      </div>
  
</>)
}