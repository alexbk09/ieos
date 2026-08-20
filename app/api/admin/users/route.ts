import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminUser } from '@/services/admin-users'

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