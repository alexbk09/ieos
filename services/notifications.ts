import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Tipos compartidos del centro de notificaciones.
 * La única fuente de verdad está en Supabase (app_notifications.v_type).
 */
export type AppNotificationType =
  | 'system'
  | 'solicitud'
  | 'cotizacion'
  | 'factura'
  | 'despacho'
  | 'cuentas_cobrar'
  | 'pago'
  | 'producto'
  | 'usuario'
  | 'tasa'
  | 'mensaje'

export type AppNotification = {
  id: string
  user_id: string
  type: AppNotificationType
  title: string
  body: string | null
  href: string | null
  read_at: string | null
  created_at: string
}

export type CreateNotificationInput = {
  userId: string
  type: AppNotificationType
  title: string
  body?: string | null
  href?: string | null
}

/**
 * Servicio de notificaciones (SOLO servidor).
 * Toda lectura/escritura del centro de alertas pasa por aquí:
 *   - getMyNotifications: bandeja del usuario autenticado.
 *   - getMyUnreadCount: total de no leídas para el badge de la campana.
 *   - markAsRead / markAllAsRead: acciones del dueño.
 *   - create (service-role): usado por los flujos del sistema para
 *     notificar a otro usuario (admin o cliente) sin violar RLS.
 *
 * Regla de oro del proyecto: los componentes nunca consultan Supabase
 * directamente; acceden vía /services.
 */
export async function getMyNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('app_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as AppNotification[]
}

export async function getMyUnreadCount(userId: string): Promise<number> {
  const supabase = await createServerClient()
  const { count } = await supabase
    .from('app_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  return count ?? 0
}

export async function markNotificationAsRead(userId: string, notificationId: string): Promise<void> {
  const supabase = await createServerClient()
  await supabase
    .from('app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const supabase = await createServerClient()
  await supabase
    .from('app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)
}

/**
 * Crea una notificación dirigida a un usuario (usado por flujos del sistema).
 * Delega en la función SQL public.notify_user(...) con SECURITY DEFINER:
 * la inserción corre con permisos del owner, por lo que no depende de RLS
 * ni de claves service-role desde el navegador.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const supabase = await createServerClient()
  await supabase.rpc('notify_user', {
    p_user_id: input.userId,
    p_type: input.type,
    p_title: input.title,
    p_body: input.body ?? null,
    p_href: input.href ?? null,
  })
}

/**
 * Notifica a TODOS los administradores del sistema (feed del panel).
 * Útil para alertas de negocio: nueva solicitud, factura emitida,
 * pago registrado, CxC vencida, etc. No conoce un admin específico.
 */
export async function notifyAdmins(
  type: AppNotificationType,
  title: string,
  body?: string | null,
  href?: string | null,
): Promise<void> {
  const supabase = await createServerClient()
  await supabase.rpc('notify_admins', {
    p_type: type,
    p_title: title,
    p_body: body ?? null,
    p_href: href ?? null,
  })
}
