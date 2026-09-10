import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { ScraperAliExpressManager } from '@/components/scraper-aliexpress-manager'
import { obtenerHistorialScraper } from '@/services/aliScraperLogs'

/**
 * Pagina admin del Scraper AliExpress (Fase 2.1).
 * ------------------------------------------------------------------
 * - requireAdmin() del Layout /admin + requireAdmin() explicito aqui.
 * - El historial inicial se precarga en servidor (SSR) y el componente
 *   cliente lo refresca en vivo tras cada extraccion.
 * - La tabla scraper_logs solo es accesible mediante el servicio
 *   /services/aliScraperLogs (nunca desde la UI directo a Supabase).
 */
export default async function ScraperAliExpressPage() {
  await requireAdmin()
  const historial = await obtenerHistorialScraper(100)

  return (
    <>
      <AdminPageHeader
        eyebrow="Catalogo · AliExpress"
        title="Scraper AliExpress"
        description="Extrae titulos, precios, especificaciones e imagenes de productos AliExpress con renderizado JS y monitorea cada intento."
      />
      <div className="p-5 sm:p-8">
        <ScraperAliExpressManager
          logsIniciales={
            historial.success && historial.data
              ? historial.data.map((log) => ({
                id: log.id,
                url_producto: log.url_producto,
                estado: log.estado,
                mensaje: log.mensaje,
                datos_json: log.datos_json,
                error_json: log.error_json,
                usuario_email: log.usuario_email,
                duracion_ms: log.duracion_ms,
                created_at: log.created_at,
              }))
              : []
          }
        />
      </div>
    </>
  )
}