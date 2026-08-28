import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { SiteSettingsManager } from '@/components/site-settings-manager'
import { getAdminSiteSettings } from '@/services/site-settings'

/**
 * Página de administración de la configuración del sitio.
 * Permite editar marca (nombre/logo/ícono), menú, portada, studio,
 * contacto, footer y redes sociales.
 * Los datos se obtienen a través de /services/site-settings.
 *
 * NOTA: El card de "Cotizaciones" (QuoteSettingsManager) está oculto
 * temporalmente. Para volver a mostrarlo, descomenta el import de
 * QuoteSettingsManager, el getQuoteSettings y la sección de abajo.
 */
export default async function SettingsPage() {
  await requireAdmin()
  const [{ settings }] = await Promise.all([
    getAdminSiteSettings(),
    // OCULTO: getQuoteSettings()
  ])

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Sitio"
        title="Configuración"
        description="Edita el nombre, logo, ícono, textos e imágenes de toda la tienda."
      />
      <div className="grid gap-6 p-5 sm:p-8">
        <SiteSettingsManager initialSettings={settings} />

        {/* OCULTO: Card de Cotizaciones (no borrado, solo comentado).
        <section className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="border-b border-border px-6 py-5">
            <h2 className="font-semibold tracking-tight">Cotizaciones</h2>
            <p className="mt-1 text-sm text-muted-foreground">Configura el descuento por pago en efectivo en divisas y la validez de las cotizaciones.</p>
          </div>
          <div className="p-6">
            <QuoteSettingsManager initialSettings={quoteSettings} />
          </div>
        </section>
        */}
      </div>
    </AdminShell>
  )
}
