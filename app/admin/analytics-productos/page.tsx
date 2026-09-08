import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { ProductAnalyticsManager } from '@/components/product-analytics-manager'
import { ANALYTICS_PRODUCTS_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Analítica de Productos".
 * Muestra qué productos son más vistos, clickeados, agregados al carrito,
 * con qué frecuencia se sale al marketplace de afiliado (AliExpress/Amazon)
 * y qué términos buscan los clientes (catálogo + asistente IA).
 */
export default async function AnalyticsProductosPage() {
  await requireAdmin()

  const canRead = await hasPermission(ANALYTICS_PRODUCTS_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
      <>
        <AdminPageHeader
          eyebrow="Analítica"
          title="Analítica de Productos"
          description="Productos más vistos y conversión hacia AliExpress/Amazon."
        />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Analítica"
        title="Analítica de Productos"
        description="Vistas, clics al carrito, salidas a AliExpress/Amazon y búsquedas de los clientes."
      />
      <div className="p-5 sm:p-8">
        <ProductAnalyticsManager />
      </div>
    </>
  )
}