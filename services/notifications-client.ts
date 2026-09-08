import { getBrowserUser } from '@/services/auth-client'
import { createClient } from '@/lib/supabase/client'

/** Estructura mínima del evento de realtime (evita tipos internos del paquete). */
type RealtimePayload = {
  new?: Record<string, unknown> | null
}

export type AppNotificationLike = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  href: string | null
  read_at: string | null
  created_at: string
}

export type RealtimeNotificationHandler = (notification: AppNotificationLike) => void

/**
 * Capa de suscripción realtime para el centro de notificaciones (SOLO cliente).
 * Provee un único punto de entrada al canal de Supabase para que los hooks
 * no importen supabase-js directamente (respetando /services).
 *
 * El cliente de Supabase del navegador es un singleton: usar un nombre de
 * canal fijo provoca "cannot add postgres_changes callbacks after subscribe()"
 * cuando el hook se re-monta en otra página. Por eso se agrega un sufijo
 * aleatorio al nombre del canal en cada suscripción.
 *
 * @returns función que cancela la suscripción.
 */
export async function subscribeToNotifications(handler: RealtimeNotificationHandler): Promise<() => void> {
  const user = await getBrowserUser()
  if (!user) return () => {}

  const supabase = createClient()

  // Nombre único por suscripción para evitar el error del singleton.
  const channelName = `app-notifications:${user.id}:${Math.random().toString(36).slice(2, 10)}`

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: `user_id=eq.${user.id}` },
      (payload: RealtimePayload) => {
        const row = payload.new
        if (row && row.user_id === user.id) {
          handler(row as unknown as AppNotificationLike)
        }
      },
    )
    .subscribe()

  // Devuelve la función de limpieza (cancelar suscripción y canal).
  return () => {
    void supabase.removeChannel(channel)
  }
}