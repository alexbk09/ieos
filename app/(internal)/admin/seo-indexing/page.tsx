import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { SEO_INDEXING_BATCH_SIZE, SEO_INDEXING_MODULE_SLUG } from '@/lib/constants'
import { listarColaDeIndexacion, obtenerPanoramaDeIndexacion } from '@/services/seo-indexing'
import { SeoIndexingManager } from '@/components/seo-indexing-manager'

/**
 * Página del módulo "Indexación en Buscadores".
 * ------------------------------------------------------------------
 * - requireAdmin() protege la ruta (el layout /admin también lo hace).
 * - hasPermission('seo_indexing', ...) decide lectura, acciones y borrado.
 * - Los datos llegan YA calculados desde /services/seo-indexing: el componente
 *   es presentacional + acciones por API (nunca habla con Supabase ni Google).
 */
export default async function SeoIndexingPage() {
  await requireAdmin()

  const canRead = await hasPermission(SEO_INDEXING_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
      <>
        <AdminPageHeader
          eyebrow="Catálogo · SEO · Indexación"
          title="Indexación en Buscadores"
          description="Cola de URLs, envío a buscadores y auditoría de indexación."
        />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
      </>
    )
  }

  const [canWrite, canDelete, panorama, cola] = await Promise.all([
    hasPermission(SEO_INDEXING_MODULE_SLUG, 'write'),
    hasPermission(SEO_INDEXING_MODULE_SLUG, 'delete'),
    obtenerPanoramaDeIndexacion(),
    listarColaDeIndexacion({ limit: SEO_INDEXING_BATCH_SIZE }),
  ])

  return (
    <>
      <AdminPageHeader
        eyebrow="Catálogo · SEO · Indexación"
        title="Indexación en Buscadores"
        description="Muestra qué URLs del sitemap siguen sin indexar, las envía en lotes de 25 respetando el límite diario de 100 y audita su estado real en Google Search Console. Cada producto, categoría o guía publicada entra aquí automáticamente."
      />
      <div className="p-5 sm:p-8">
        <SeoIndexingManager
          panorama={panorama}
          colaInicial={cola.items}
          totalInicial={cola.total}
          canWrite={canWrite}
          canDelete={canDelete}
        />
      </div>
    </>
  )
}
