import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { createZona, deleteZona, getZonasEnvio, updateZona } from '@/services/envios'
import { ENVIOS_MODULE_SLUG } from '@/lib/constants'

/** GET: Lista las zonas de envío con sus rangos. */
export async function GET() {
  await requireAdmin()
  const canRead = await hasPermission(ENVIOS_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })
  const result = await getZonasEnvio()
  return NextResponse.json(result.error ? { error: result.error.message } : { zonas: result.data })
}

/** POST: Crea una zona de envío. */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(ENVIOS_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar zonas.' }, { status: 403 })
  const body = await request.json()
  const result = await createZona({
    nombre: String(body.nombre ?? ''),
    descripcion: body.descripcion ?? null,
    estados: Array.isArray(body.estados) ? body.estados.map(String) : [],
    ciudades: Array.isArray(body.ciudades) ? body.ciudades.map(String) : [],
    tarifa_flat_usd: Number(body.tarifa_flat_usd) || 0,
    tarifa_por_kg_usd: Number(body.tarifa_por_kg_usd) || 0,
    tiempo_estimado: body.tiempo_estimado ?? null,
    activo: body.activo ?? true,
    rangos: Array.isArray(body.rangos) ? body.rangos.map((r: any) => ({ peso_min_kg: Number(r.peso_min_kg) || 0, peso_max_kg: Number(r.peso_max_kg) || 0, tarifa_usd: Number(r.tarifa_usd) || 0 })) : undefined,
  })
  return NextResponse.json(result.error ? { error: result.error.message } : { zona: result.data }, { status: result.error ? 400 : 200 })
}

/** PATCH: Actualiza una zona de envío (incluye rangos). */
export async function PATCH(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(ENVIOS_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar zonas.' }, { status: 403 })
  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const result = await updateZona(String(body.id), {
    nombre: body.nombre !== undefined ? String(body.nombre) : undefined,
    descripcion: body.descripcion,
    estados: Array.isArray(body.estados) ? body.estados.map(String) : undefined,
    ciudades: Array.isArray(body.ciudades) ? body.ciudades.map(String) : undefined,
    tarifa_flat_usd: body.tarifa_flat_usd !== undefined ? Number(body.tarifa_flat_usd) : undefined,
    tarifa_por_kg_usd: body.tarifa_por_kg_usd !== undefined ? Number(body.tarifa_por_kg_usd) : undefined,
    tiempo_estimado: body.tiempo_estimado,
    activo: body.activo !== undefined ? Boolean(body.activo) : undefined,
    rangos: Array.isArray(body.rangos) ? body.rangos.map((r: any) => ({ peso_min_kg: Number(r.peso_min_kg) || 0, peso_max_kg: Number(r.peso_max_kg) || 0, tarifa_usd: Number(r.tarifa_usd) || 0 })) : undefined,
  })
  return NextResponse.json(result.error ? { error: result.error.message } : { zona: result.data }, { status: result.error ? 400 : 200 })
}

/** DELETE: Elimina una zona (rangos en cascada). */
export async function DELETE(request: Request) {
  await requireAdmin()
  const canDelete = await hasPermission(ENVIOS_MODULE_SLUG, 'delete')
  if (!canDelete) return NextResponse.json({ error: 'No tienes permiso para eliminar zonas.' }, { status: 403 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  const result = await deleteZona(id)
  return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
}