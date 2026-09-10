import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { ReporteMargenManager } from '@/components/reporte-margen-manager'
import { REPORTE_MARGEN_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Reporte de Margen Neto".
 * Deduce automáticamente el costo inicial del producto para dar
 * la ganancia real del negocio.
 */
export default async function ReporteMargenPage() {
  await requireAdmin()

  const canRead = await hasPermission(REPORTE_MARGEN_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader eyebrow="Contabilidad" title="Reporte de Margen Neto" description="Ganancia real del negocio restando el costo inicial." />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  return (
<>
      <AdminPageHeader
        eyebrow="Contabilidad"
        title="Reporte de Margen Neto"
        description="Deduce el costo inicial del producto para darte la ganancia real del negocio."
      />
      <div className="p-5 sm:p-8">
        <ReporteMargenManager />
      </div>
  
</>)
}