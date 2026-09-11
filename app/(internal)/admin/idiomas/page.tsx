import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { CATEGORY_I18N_MODULE_SLUG } from '@/lib/constants'
import { getPendingTranslationsSummary } from '@/services/i18n-pending'
import { I18nPendingManager } from '@/components/i18n-pending-manager'

/**
 * Página admin "Idiomas y Traducciones".
 * ------------------------------------------------------------------
 * - requireAdmin() + RBAC del módulo 'categorias_idiomas' (read/write).
 * - Muestra los pendientes y permite traducir todo el contenido desde la UI,
 *   sin tocar la consola. La lógica de datos vive en /services/i18n-pending.
 * - Los productos y categorías NUEVOS ya se traducen solos al crearse; este panel
 *   sirve para poner al día lo existente y las cargas masivas.
 */
export default async function IdiomasPage() {
  await requireAdmin()

  const canRead = await hasPermission(CATEGORY_I18N_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
      <>
        <AdminPageHeader
          eyebrow="Catálogo · i18n"
          title="Idiomas y Traducciones"
          description="Traduce el contenido que falte del catálogo al resto de idiomas."
        />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
      </>
    )
  }

  const canWrite = await hasPermission(CATEGORY_I18N_MODULE_SLUG, 'write')
  const { data: pending } = await getPendingTranslationsSummary()

  return (
    <>
      <AdminPageHeader
        eyebrow="Catálogo · i18n"
        title="Idiomas y Traducciones"
        description="Traduce al resto de idiomas el contenido que falte de productos y categorías. El contenido nuevo ya se traduce solo al crearse; aquí pones al día lo existente y las cargas masivas."
      />
      <div className="p-5 sm:p-8">
        <I18nPendingManager
          initialPending={pending ?? { products: 0, categories: 0, total: 0 }}
          canWrite={canWrite}
        />
      </div>
    </>
  )
}
