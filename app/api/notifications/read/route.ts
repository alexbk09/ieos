import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { markNotificationAsRead } from '@/services/notifications'

/**
 * API: Marca una notificación como leída (solo el dueño).
 * La lógica vive en /services/notifications y el RLS limita por user_id.
 */
export async function POST(request: Request) {
  const { user } = await requireUser()
  const body = (await request.json().catch(() => ({}))) as { id?: unknown }
  const id = typeof body.id === 'string' ? body.id : ''

  if (!id) {
    return NextResponse.json({ error: 'Falta el id de la notificación' }, { status: 400 })
  }

  await markNotificationAsRead(user.id, id)
  return NextResponse.json({ ok: true })
}