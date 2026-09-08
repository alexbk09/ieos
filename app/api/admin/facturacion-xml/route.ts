import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { generarXML, getFacturasParaXML, getXMLFactura } from '@/services/facturacion-xml'
import { FACTURACION_XML_MODULE_SLUG } from '@/lib/constants'

/** GET: Lista facturas con XML o descarga el XML de una factura. */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission(FACTURACION_XML_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })

  const url = new URL(request.url)
  const xml = url.searchParams.get('xml')

  if (xml) {
    const result = await getXMLFactura(xml)
    return NextResponse.json(result.error ? { error: result.error.message } : { xml: result.data })
  }

  const result = await getFacturasParaXML()
  return NextResponse.json(result.error ? { error: result.error.message } : { facturas: result.data })
}

/** POST: Genera el XML de una factura. */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(FACTURACION_XML_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para generar XML.' }, { status: 403 })

  const body = await request.json()
  if (!body.invoice_id) return NextResponse.json({ error: 'Factura requerida.' }, { status: 400 })

  const result = await generarXML(String(body.invoice_id))
  return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
}