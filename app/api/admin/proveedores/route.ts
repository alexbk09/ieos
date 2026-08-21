import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createProveedor, deleteProveedor, getProveedores, updateProveedor } from '@/services/proveedores'

/**
 * API: Obtener todos los proveedores (vista admin).
 * Se usa para refrescar la tabla después de cada mutación (crear/editar/eliminar).
 */
export async function GET() {
  await requireAdmin()
  const { data: proveedores } = await getProveedores()
  return NextResponse.json({ proveedores })
}

/**
 * API: Crear un nuevo proveedor.
 * Solo el nombre es obligatorio; el RIF es opcional (se puede completar después).
 * Toda la lógica de datos vive en /services/proveedores.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const body = await request.json()

  const result = await createProveedor({
    rif: body.rif ? String(body.rif).trim() : null,
    nombre: String(body.nombre ?? '').trim(),
    direccion: body.direccion ?? null,
    contacto_nombre: body.contacto_nombre ?? null,
    telefono: body.telefono ?? null,
    email: body.email ?? null,
    activo: body.activo !== false,
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ proveedor: result.data })
}

/**
 * API: Actualizar un proveedor existente (también alterna activo/inactivo).
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const body = await request.json()
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await updateProveedor(id, {
    rif: body.rif ? String(body.rif).trim() : null,
    nombre: String(body.nombre ?? '').trim(),
    direccion: body.direccion ?? null,
    contacto_nombre: body.contacto_nombre ?? null,
    telefono: body.telefono ?? null,
    email: body.email ?? null,
    activo: body.activo !== false,
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ proveedor: result.data })
}

/**
 * API: Eliminar un proveedor.
 */
export async function DELETE(request: Request) {
  await requireAdmin()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await deleteProveedor(id)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}