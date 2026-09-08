import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import {
  avanzarEstadoDespacho,
  asignarTransportista,
  createDespacho,
  createTransportista,
  deleteTransportista,
  getDespachos,
  getHistorialDespacho,
  getSolicitudesDespachables,
  getTransportistas,
  updateTransportista,
} from '@/services/despachos'
import { DESPACHOS_MODULE_SLUG } from '@/lib/constants'

/** GET: Lista despachos, transportistas, solicitudes despachables o historial. */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission(DESPACHOS_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })

  const url = new URL(request.url)
  const tipo = url.searchParams.get('tipo')
  const historial = url.searchParams.get('historial')

  if (tipo === 'transportistas') {
    const result = await getTransportistas()
    return NextResponse.json(result.error ? { error: result.error.message } : { transportistas: result.data })
  }
  if (tipo === 'solicitudes') {
    const result = await getSolicitudesDespachables()
    return NextResponse.json(result.error ? { error: result.error.message } : { solicitudes: result.data })
  }
  if (historial) {
    const result = await getHistorialDespacho(historial)
    return NextResponse.json(result.error ? { error: result.error.message } : { historial: result.data })
  }

  const result = await getDespachos()
  return NextResponse.json(result.error ? { error: result.error.message } : { despachos: result.data })
}

/** POST: Crea despacho o transportista (según action). */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(DESPACHOS_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar este módulo.' }, { status: 403 })

  const body = await request.json()

  if (body.action === 'crear_despacho') {
    const result = await createDespacho({
      solicitud_id: String(body.solicitud_id ?? ''),
      almacen_origen: body.almacen_origen ?? null,
      transportista_id: body.transportista_id ?? null,
      ruta: body.ruta ?? null,
      fecha_programada: body.fecha_programada || new Date().toISOString().slice(0, 10),
      notas: body.notas ?? null,
    })
    return NextResponse.json(result.error ? { error: result.error.message } : { despacho: result.data }, { status: result.error ? 400 : 200 })
  }

  if (body.action === 'avanzar_estado') {
    if (!body.despacho_id || !body.estado) return NextResponse.json({ error: 'Despacho y estado requeridos.' }, { status: 400 })
    const result = await avanzarEstadoDespacho(String(body.despacho_id), body.estado, body.ubicacion ?? null, body.observaciones ?? null)
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  if (body.action === 'asignar_transportista') {
    if (!body.despacho_id) return NextResponse.json({ error: 'Despacho requerido.' }, { status: 400 })
    const result = await asignarTransportista(String(body.despacho_id), body.transportista_id ? String(body.transportista_id) : null)
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  // Creación de transportista
  const result = await createTransportista({
    nombre: String(body.nombre ?? ''),
    tipo: body.tipo ?? 'externo',
    telefono: body.telefono ?? null,
    vehiculo: body.vehiculo ?? null,
    placa: body.placa ?? null,
    activo: body.activo ?? true,
  })
  return NextResponse.json(result.error ? { error: result.error.message } : { transportista: result.data }, { status: result.error ? 400 : 200 })
}

/** PATCH: Actualiza un transportista. */
export async function PATCH(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(DESPACHOS_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar este módulo.' }, { status: 403 })

  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await updateTransportista(String(body.id), {
    nombre: body.nombre !== undefined ? String(body.nombre) : undefined,
    tipo: body.tipo,
    telefono: body.telefono,
    vehiculo: body.vehiculo,
    placa: body.placa,
    activo: body.activo !== undefined ? Boolean(body.activo) : undefined,
  })
  return NextResponse.json(result.error ? { error: result.error.message } : { transportista: result.data }, { status: result.error ? 400 : 200 })
}

/** DELETE: Elimina un transportista. */
export async function DELETE(request: Request) {
  await requireAdmin()
  const canDelete = await hasPermission(DESPACHOS_MODULE_SLUG, 'delete')
  if (!canDelete) return NextResponse.json({ error: 'No tienes permiso para eliminar.' }, { status: 403 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await deleteTransportista(id)
  return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
}