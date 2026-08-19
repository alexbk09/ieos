import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { updateProfile } from '@/services/profiles'

/**
 * API: Actualizar el perfil del usuario autenticado.
 * La lógica de datos vive en /services/profiles.
 */
export async function PATCH(request: Request) {
  const { user } = await requireUser()
  const body = await request.json()

  // Solo se actualizan campos permitidos: nombre, teléfono, email, avatar.
  const updates: { name?: string | null; phone?: string | null; email?: string | null; avatar_url?: string | null } = {}
  if ('name' in body) updates.name = String(body.name ?? '').trim() || null
  if ('phone' in body) updates.phone = String(body.phone ?? '').trim() || null
  if ('email' in body) updates.email = String(body.email ?? '').trim() || null
  if ('avatar_url' in body) updates.avatar_url = String(body.avatar_url ?? '').trim() || null

  // Al menos un campo para actualizar.
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No hay campos para actualizar' }, { status: 400 })
  }

  const { data, error } = await updateProfile(user.id, updates)
  if (error) {
    console.error('Error actualizando perfil:', error.message)
    return NextResponse.json({ error: 'No se pudo actualizar el perfil' }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}