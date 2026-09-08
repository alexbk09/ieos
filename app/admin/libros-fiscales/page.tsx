import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { LibrosFiscalesManager } from '@/components/libros-fiscales-manager'
import { LIBROS_FISCALES_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Libros Fiscales".
 * Exporta los libros de compra y venta en formatos PDF o Excel
 * listos para declarar ante el organismo tributario.
 */
export default async function LibrosFiscalesPage() {
  await requireAdmin()

  const canRead = await hasPermission(LIBROS_FISCALES_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader eyebrow="Contabilidad" title="Libros Fiscales" description="Exportación de libros de compra y venta SENIAT." />
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
        title="Libros Fiscales"
        description="Exporta los libros de compra y venta en PDF o Excel listos para declarar."
      />
      <div className="p-5 sm:p-8">
        <LibrosFiscalesManager />
      </div>
  
</>)
}