import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminUser, listAdminUsers } from '@/services/admin-users'

/**
 * API: Obtener todos los usuarios (vista admin).
 * Se usa para refrescar la tabla después de cada mutación (crear usuario).
 */
export async function GET() {
  await requireAdmin()
  const { data: users, error } = await listAdminUsers()
  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ users })
}

/**
 * API: Crear un nuevo usuario con asignación de rol.
 * Toda la lógica de datos vive en /services/admin-users.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const body = await request.json()

  const result = await createAdminUser({
    email: String(body.email ?? ''),
    password: String(body.password ?? ''),
    full_name: body.full_name ? String(body.full_name) : null,
    phone: body.phone ? String(body.phone) : null,
    role_id: body.role_id ? String(body.role_id) : null,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ user: result.data })
}