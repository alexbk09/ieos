import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import {
  asignarStockProducto,
  createAlmacen,
  deleteAlmacen,
  getAlmacenes,
  getProductosSimples,
  getStockAlmacen,
  transferirStock,
  updateAlmacen,
} from '@/services/almacenes'

/**
 * API del módulo "Almacenes" (multi-almacén).
 * Toda la lógica de datos vive en /services/almacenes.
 * Las transferencias entre almacenes usan la RPC transaccional.
 */

/**
 * GET: Obtiene almacenes, stock de un almacén o productos simples.
 * Requiere permiso de lectura del módulo 'almacenes'.
 * Query params:
 *   ?stock=<almacenId>      → stock de un almacén
 *   ?productos=1            → lista de productos simples
 *   (sin params)            → todos los almacenes
 */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission('almacenes', 'read')
  if (!canRead) {
    return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const stockId = url.searchParams.get('stock')
  const productos = url.searchParams.get('productos')

  if (productos === '1') {
    const result = await getProductosSimples()
    return NextResponse.json(result.error ? { error: result.error.message } : { productos: result.data })
  }

  if (stockId) {
    const result = await getStockAlmacen(stockId)
    return NextResponse.json(result.error ? { error: result.error.message } : { stock: result.data })
  }

  const result = await getAlmacenes()
  return NextResponse.json(result.error ? { error: result.error.message } : { almacenes: result.data })
}

/**
 * POST: Crea un almacén, asigna stock o transfiere stock.
 * Requiere permiso de escritura del módulo 'almacenes'.
 * Body con action='asignar_stock' → asigna stock a un producto.
 * Body con action='transferir'    → transfiere stock entre almacenes.
 * Body normal                     → crea almacén.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission('almacenes', 'write')
  if (!canWrite) {
    return NextResponse.json({ error: 'No tienes permiso para modificar almacenes.' }, { status: 403 })
  }

  const body = await request.json()

  // Acción: asignar stock a un producto en un almacén
  if (body.action === 'asignar_stock') {
    if (!body.almacen_id || !body.product_id) {
      return NextResponse.json({ error: 'Debes indicar almacén y producto.' }, { status: 400 })
    }
    const result = await asignarStockProducto(
      String(body.almacen_id),
      String(body.product_id),
      Number(body.stock ?? 0),
      Number(body.stock_grams ?? 0),
    )
    return NextResponse.json(result.error ? { error: result.error.message } : { stock: result.data }, { status: result.error ? 400 : 200 })
  }

  // Acción: transferir stock entre almacenes
  if (body.action === 'transferir') {
    if (!body.product_id || !body.origen || !body.destino) {
      return NextResponse.json({ error: 'Debes indicar producto, origen y destino.' }, { status: 400 })
    }
    const result = await transferirStock(
      String(body.product_id),
      String(body.origen),
      String(body.destino),
      Number(body.cantidad ?? 0),
      Number(body.cantidad_gramos ?? 0),
    )
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  // Creación de almacén
  const result = await createAlmacen({
    nombre: String(body.nombre ?? ''),
    codigo: String(body.codigo ?? ''),
    tipo: body.tipo ?? 'deposito',
    direccion: body.direccion ?? null,
    ciudad: body.ciudad ?? null,
    telefono: body.telefono ?? null,
    responsable: body.responsable ?? null,
    activo: body.activo ?? true,
  })
  return NextResponse.json(result.error ? { error: result.error.message } : { almacen: result.data }, { status: result.error ? 400 : 200 })
}

/**
 * PATCH: Actualiza un almacén existente.
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission('almacenes', 'write')
  if (!canWrite) {
    return NextResponse.json({ error: 'No tienes permiso para modificar almacenes.' }, { status: 403 })
  }

  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await updateAlmacen(String(body.id), {
    nombre: body.nombre !== undefined ? String(body.nombre) : undefined,
    codigo: body.codigo !== undefined ? String(body.codigo) : undefined,
    tipo: body.tipo,
    direccion: body.direccion,
    ciudad: body.ciudad,
    telefono: body.telefono,
    responsable: body.responsable,
    activo: body.activo !== undefined ? Boolean(body.activo) : undefined,
  })
  return NextResponse.json(result.error ? { error: result.error.message } : { almacen: result.data }, { status: result.error ? 400 : 200 })
}

/**
 * DELETE: Elimina un almacén (stock asociado en cascada).
 */
export async function DELETE(request: Request) {
  await requireAdmin()
  const canDelete = await hasPermission('almacenes', 'delete')
  if (!canDelete) {
    return NextResponse.json({ error: 'No tienes permiso para eliminar almacenes.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await deleteAlmacen(id)
  return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
}