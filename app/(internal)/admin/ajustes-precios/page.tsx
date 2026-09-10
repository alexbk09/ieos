import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { getExchangeRates } from '@/services/exchange-rate'
import { getAdjustmentHistory, getLastAppliedRate, getProductsForAdjustment } from '@/services/margin-adjustment'
import { hasPermission } from '@/services/roles'
import { MarginAdjustmentManager } from '@/components/margin-adjustment-manager'
import { MARGIN_ADJUSTMENT_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Ajuste de Margen y Control de Pérdidas".
 * Permite calcular pérdidas por fluctuación de la tasa oficial, simular un
 * incremento porcentual del costo base (Precio Inicial), previsualizar los
 * cambios y aplicar una actualización masiva registrando el historial.
 * El acceso a datos se realiza a través de /services/margin-adjustment.
 */
export default async function AjustesPreciosPage() {
  await requireAdmin()

  const canRead = await hasPermission(MARGIN_ADJUSTMENT_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader
          eyebrow="Finanzas"
          title="Ajuste de Margen y Control de Pérdidas"
          description="Módulo de ajuste de precios por fluctuación de la tasa oficial."
        />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  const [{ data: products }, { data: history }, { data: lastRate }, { official, parallel }] = await Promise.all([
    getProductsForAdjustment(),
    getAdjustmentHistory(),
    getLastAppliedRate(),
    getExchangeRates(),
  ])

  return (
<>
      <AdminPageHeader
        eyebrow="Finanzas"
        title="Ajuste de Margen y Control de Pérdidas"
        description="Calcula pérdidas, simula incrementos del costo base y aplica actualizaciones masivas con historial."
      />
      <div className="p-5 sm:p-8">
        <MarginAdjustmentManager
          initialProducts={products ?? []}
          initialHistory={history ?? []}
          initialLastRate={lastRate}
          officialRate={official.rate}
          parallelRate={parallel.rate}
        />
      </div>
  
</>)
}