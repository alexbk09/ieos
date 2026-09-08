import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { crearFacturaProveedor, getExportaciones, getLibroCompras, getLibroVentas, registrarExportacion } from '@/services/libros-fiscales'
import { LIBROS_FISCALES_MODULE_SLUG } from '@/lib/constants'

/** GET: Genera el libro fiscal (ventas/compras) o consulta exportaciones. */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission(LIBROS_FISCALES_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })

  const url = new URL(request.url)
  const tipo = url.searchParams.get('tipo')
  const inicio = url.searchParams.get('inicio')
  const fin = url.searchParams.get('fin')
  const exportaciones = url.searchParams.get('exportaciones')

  if (exportaciones === '1') {
    const result = await getExportaciones()
    return NextResponse.json(result.error ? { error: result.error.message } : { exportaciones: result.data })
  }

  if (tipo && inicio && fin) {
    const result = tipo === 'compras'
      ? await getLibroCompras(inicio, fin)
      : await getLibroVentas(inicio, fin)
    return NextResponse.json(result.error ? { error: result.error.message } : result.data, { status: result.error ? 400 : 200 })
  }

  return NextResponse.json({ error: 'Parámetros incompletos: tipo, inicio y fin requeridos.' }, { status: 400 })
}

/** POST: Crea factura de proveedor o registra exportación. */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(LIBROS_FISCALES_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar este módulo.' }, { status: 403 })

  const body = await request.json()

  if (body.action === 'registrar_exportacion') {
    const result = await registrarExportacion(body.tipo ?? 'venta', String(body.inicio ?? ''), String(body.fin ?? ''), body.formato ?? 'excel')
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  const result = await crearFacturaProveedor({
    proveedor_id: body.proveedor_id ?? null,
    numero_factura: String(body.numero_factura ?? ''),
    emisor_rif: String(body.emisor_rif ?? ''),
    emisor_nombre: body.emisor_nombre ?? null,
    base_imponible: Number(body.base_imponible ?? 0),
    iva_amount: Number(body.iva_amount ?? 0),
    exento_amount: Number(body.exento_amount ?? 0),
    total: Number(body.total ?? 0),
    fecha_emision: String(body.fecha_emision ?? new Date().toISOString().slice(0, 10)),
  })
  return NextResponse.json(result.error ? { error: result.error.message } : { factura: result.data }, { status: result.error ? 400 : 200 })
}