import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createRole, deleteRole, updateRole } from '@/services/roles'

/**
 * API: Crear un nuevo rol con sus permisos por módulo.
 * Toda la lógica de datos vive en /services/roles.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const body = await request.json()

  const payload = {
    name: String(body.name ?? '').trim(),
    description: body.description ?? null,
    permissions: body.permissions ?? {},
  }

  const result = await createRole(payload)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ role: result.data })
}

/**
 * API: Actualizar un rol existente (nombre, descripción y permisos).
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const body = await request.json()

  if (!body.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await updateRole(body.id, {
    name: String(body.name ?? '').trim(),
    description: body.description ?? null,
    permissions: body.permissions ?? {},
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ role: result.data })
}

/**
 * API: Eliminar un rol.
 */
export async function DELETE(request: Request) {
  await requireAdmin()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await deleteRole(id)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}