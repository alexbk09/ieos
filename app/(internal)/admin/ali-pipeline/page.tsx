import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { AliPipelineManager } from '@/components/ali-pipeline-manager'

/**
 * Pagina admin del Pipeline de Automatización AliExpress (Fase 2.2).
 * ------------------------------------------------------------------
 * - requireAdmin() del Layout /admin + requireAdmin() explicito aqui.
 * - El componente cliente AliPipelineManager consume el stream SSE de
 *   /api/admin/ali-pipeline y muestra el progreso en tiempo real.
 * - El acceso RBAC (módulo 'ali_pipeline') se valida en la API route.
 */
export default async function AliPipelinePage() {
  await requireAdmin()

  return (
    <>
      <AdminPageHeader
        eyebrow="Catalogo · AliExpress · Automatizacion"
        title="Pipeline AliExpress"
        description="Descubre los productos mas vendidos por keyword (API oficial), extrae su detalle fisico (scraper), genera enlace de afiliado y optimiza el SEO con DeepSeek antes de guardarlos en Supabase."
      />
      <div className="p-5 sm:p-8">
        <AliPipelineManager />
      </div>
    </>
  )
}
