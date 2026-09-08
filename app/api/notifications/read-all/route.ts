import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { markAllNotificationsAsRead } from '@/services/notifications'

/**
 * API: Marca todas las notificaciones del usuario como leídas.
 * La lógica vive en /services/notifications y el RLS limita por user_id.
 */
export async function POST() {
  const { user } = await requireUser()
  await markAllNotificationsAsRead(user.id)
  return NextResponse.json({ ok: true })
}