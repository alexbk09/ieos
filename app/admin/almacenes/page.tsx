import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { getAlmacenes, getProductosSimples } from '@/services/almacenes'
import { AlmacenesManager } from '@/components/almacenes-manager'
import { ALMACENES_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Almacenes" (multi-almacén).
 * Permite gestionar sucursales, depósitos o bodegas, asignar stock
 * por producto a cada almacén y transferir stock entre almacenes.
 * El acceso a datos se realiza a través de /services/almacenes.
 */
export default async function AlmacenesPage() {
  await requireAdmin()

  const canRead = await hasPermission(ALMACENES_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader
          eyebrow="Logística"
          title="Almacenes"
          description="Gestión de stock separado por sucursales, depósitos o bodegas."
        />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  const [{ data: almacenes }, { data: productos }] = await Promise.all([
    getAlmacenes(),
    getProductosSimples(),
  ])

  return (
<>
      <AdminPageHeader
        eyebrow="Logística"
        title="Almacenes"
        description="Gestiona el stock de forma separada por sucursales, depósitos físicos o bodegas."
      />
      <div className="p-5 sm:p-8">
        <AlmacenesManager initialAlmacenes={almacenes ?? []} initialProductos={productos ?? []} />
      </div>
  
</>)
}