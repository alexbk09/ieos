import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { createTransportista, deleteTransportista, getTransportistas, getTransportistasActivos, updateTransportista } from '@/services/transportistas'
import { TRANSPORTISTAS_MODULE_SLUG } from '@/lib/constants'

/** GET: Lista transportistas (todos o activos con ?activos=1). */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission(TRANSPORTISTAS_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })

  const url = new URL(request.url)
  const activos = url.searchParams.get('activos')

  const result = activos === '1' ? await getTransportistasActivos() : await getTransportistas()
  return NextResponse.json(result.error ? { error: result.error.message } : { transportistas: result.data })
}

/** POST: Crea un transportista. */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(TRANSPORTISTAS_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para crear transportistas.' }, { status: 403 })

  const body = await request.json()
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
  const canWrite = await hasPermission(TRANSPORTISTAS_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para editar transportistas.' }, { status: 403 })

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
  const canDelete = await hasPermission(TRANSPORTISTAS_MODULE_SLUG, 'delete')
  if (!canDelete) return NextResponse.json({ error: 'No tienes permiso para eliminar transportistas.' }, { status: 403 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await deleteTransportista(id)
  return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
}