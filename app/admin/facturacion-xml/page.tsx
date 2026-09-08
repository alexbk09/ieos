import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { hasPermission } from '@/services/roles'
import { getFacturasParaXML } from '@/services/facturacion-xml'
import { FacturacionXmlManager } from '@/components/facturacion-xml-manager'
import { FACTURACION_XML_MODULE_SLUG } from '@/lib/constants'

/**
 * Página del módulo "Facturación XML SENIAT".
 * Genera y descarga el XML de las facturas electrónicas para cumplir
 * con las providencias de la Gaceta Oficial del SENIAT.
 */
export default async function FacturacionXmlPage() {
  await requireAdmin()

  const canRead = await hasPermission(FACTURACION_XML_MODULE_SLUG, 'read')
  if (!canRead) {
    return (
<>
        <AdminPageHeader eyebrow="Contabilidad" title="Facturación XML SENIAT" description="Facturas electrónicas en formato XML." />
        <div className="p-5 sm:p-8">
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No tienes permiso para ver este módulo.</p>
          </div>
        </div>
    
</>)
  }

  const { data: facturas } = await getFacturasParaXML()

  return (
<>
      <AdminPageHeader
        eyebrow="Contabilidad"
        title="Facturación XML SENIAT"
        description="Genera y descarga el XML de las facturas electrónicas directo para la Gaceta Oficial."
      />
      <div className="p-5 sm:p-8">
        <FacturacionXmlManager initialFacturas={facturas ?? []} />
      </div>
  
</>)
}