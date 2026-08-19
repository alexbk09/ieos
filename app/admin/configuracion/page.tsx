import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { SiteSettingsManager } from '@/components/site-settings-manager'
import { getAdminSiteSettings } from '@/services/site-settings'

/**
 * Página de administración de la configuración del sitio.
 * Permite editar marca (nombre/logo/ícono), menú, portada, studio,
 * contacto, footer y redes sociales. Los datos se obtienen a través
 * de /services/site-settings.
 */
export default async function SettingsPage() {
  await requireAdmin()
  const { settings } = await getAdminSiteSettings()

  return (
    <AdminShell>
      <AdminPageHeader
        eyebrow="Sitio"
        title="Configuración"
        description="Edita el nombre, logo, ícono, textos e imágenes de toda la tienda."
      />
      <div className="p-5 sm:p-8">
        <SiteSettingsManager initialSettings={settings} />
      </div>
    </AdminShell>
  )
}