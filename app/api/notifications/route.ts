import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getMyNotifications, getMyUnreadCount } from '@/services/notifications'

/**
 * API: Centro de notificaciones del usuario autenticado.
 * Devuelve la bandeja reciente y el total de no leídas (badge de la campana).
 * La lógica de datos vive en /services/notifications.
 */
export async function GET() {
  const { user } = await requireUser()
  const [notifications, unread] = await Promise.all([
    getMyNotifications(user.id, 30),
    getMyUnreadCount(user.id),
  ])
  return NextResponse.json({ notifications, unread })
}