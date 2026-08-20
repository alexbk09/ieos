import { createClient as createServerClient } from '@/lib/supabase/server'
import { normalizeCartItems } from '@/lib/price-calculator'
import { getOfficialExchangeRate } from '@/services/exchange-rate'
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS } from '@/lib/request-status.mjs'

/**
 * Servicio de solicitudes (pedidos).
 * Capa única de acceso a Supabase para la gestión de solicitudes.
 * Usa la tasa oficial del día (dolarapi.com) al crear solicitudes.
 */

// ---------- Tipos ----------
export type RequestItem = {
  id: string
  product_name: string
  quantity: number
  unit_price_usd: number
}

export type RequestStatusHistory = {
  id: string
  solicitud_id: string
  previous_status: string | null
  new_status: string
  changed_by: string | null
  created_at: string
  changed_by_name?: { full_name?: string | null; email?: string | null } | null
}

export type RequestClient = {
  id?: string
  full_name: string | null
  email: string | null
  phone: string | null
}

export type Request = {
  id: string
  user_id: string
  status: string
  total_usd: number
  exchange_rate: number
  created_at: string
  updated_at: string
  solicitud_items: RequestItem[]
  solicitud_status_history?: RequestStatusHistory[]
  profiles?: RequestClient | RequestClient[] | null
}

export type NewRequestItem = {
  product_id: string
  quantity: number
}

// ---------- Solicitudes del cliente ----------

// Resultado de la creación de una solicitud.
export type CreateRequestResult =
  | { id: string; total: number }
  | { error: 'products_unavailable' | 'stock_or_quantity_invalid' | 'solicitud_failed' | 'items_failed' }

/**
 * Crea una nueva solicitud desde el carrito del cliente.
 * Valida stock real de cada producto, calcula el total en USD
 * y guarda la tasa oficial del día (dolarapi.com).
 * @param userId ID del usuario autenticado.
 * @param items Ítems del carrito.
 * @returns { id, total } de la solicitud creada.
 */
export async function createRequest(userId: string, items: NewRequestItem[]): Promise<CreateRequestResult> {
  const supabase = await createServerClient()
  const ids = items.map((item) => item.product_id).filter(Boolean)
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id,name,price_usd,stock')
    .in('id', ids)
  if (productsError) return { error: 'products_unavailable' }

  // Lógica pura de validación y cálculo de total (sin acoplamiento a Supabase).
  const result = normalizeCartItems(items, products ?? [])
  if (result.items === null) return { error: 'stock_or_quantity_invalid' }

  const { items: validItems, total } = result

  // Obtiene la tasa oficial del día para guardarla en la solicitud.
  const { rate } = await getOfficialExchangeRate()

  const { data: solicitud, error } = await supabase
    .from('solicitudes')
    .insert({ user_id: userId, total_usd: total, exchange_rate: rate })
    .select('id')
    .single()
  if (error || !solicitud) return { error: 'solicitud_failed' }

  const { error: itemsError } = await supabase
    .from('solicitud_items')
    .insert(validItems.map((item) => ({ ...item, solicitud_id: solicitud.id })))
  if (itemsError) return { error: 'items_failed' }

  return { id: solicitud.id, total }
}

/**
 * Obtiene el historial de solicitudes de un usuario.
 * @param userId ID del usuario.
 */
export async function getRequestsByUser(userId: string) {
  const supabase = await createServerClient()
  return supabase.from('solicitudes').select('*, solicitud_items(*)').eq('user_id', userId).order('created_at', { ascending: false })
}

// ---------- Solicitudes del admin ----------

/**
 * Obtiene todas las solicitudes con sus ítems, datos del cliente e historial.
 * Hace dos consultas y combina los perfiles manualmente para no depender de
 * hints de FK de PostgREST. Incluye el perfil del cliente y el nombre de
 * quién cambió cada estado.
 */
export async function getRequestsWithItems() {
  const supabase = await createServerClient()

  // 1) Solicitudes con ítems e historial.
  const { data, error } = await supabase
    .from('solicitudes')
    .select('*, solicitud_items(*), solicitud_status_history(*)')
    .order('created_at', { ascending: false })
  if (error) return { data: [], error }

  // 2) Recolecta IDs de clientes y de quienes cambiaron estado.
  const userIds = (data ?? []).map((r) => r.user_id).filter(Boolean)
  const changeIds = (data ?? [])
    .flatMap((r) => r.solicitud_status_history ?? [])
    .map((h) => h.changed_by)
    .filter(Boolean)
  const allIds = [...new Set([...userIds, ...changeIds])]

  // 3) Consulta perfiles en una sola pasada.
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone')
    .in('id', allIds)

  const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]))

  // 4) Enriquece cada solicitud con su cliente y el nombre del cambiador.
  const enriched = ((data ?? []) as Request[]).map((r) => ({
    ...r,
    profiles: r.user_id ? (profileMap.get(r.user_id) ?? null) : null,
    solicitud_status_history: (r.solicitud_status_history ?? []).map((h) => ({
      ...h,
      changed_by_name: h.changed_by ? (profileMap.get(h.changed_by) ?? null) : null,
    })),
  }))

  return { data: enriched, error: null }
}

/**
 * Obtiene el historial de estados de una solicitud específica con el nombre de quién lo cambió.
 * @param solicitudId ID de la solicitud.
 */
export async function getRequestStatusHistory(solicitudId: string) {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('solicitud_status_history')
    .select('*')
    .eq('solicitud_id', solicitudId)
    .order('created_at', { ascending: false })
  if (error) return { data: [], error }

  const changeIds = (data ?? []).map((h) => h.changed_by).filter(Boolean)
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', changeIds)

  const profileMap = new Map((profilesData ?? []).map((p) => [p.id, p]))

  const enriched = (data ?? []).map((h) => ({
    ...h,
    changed_by_name: h.changed_by ? (profileMap.get(h.changed_by) ?? null) : null,
  }))

  return { data: enriched, error: null }
}

/**
 * Actualiza el estado de una solicitud.
 * El trigger en BD registra automáticamente el cambio en solicitud_status_history.
 * @param id ID de la solicitud.
 * @param status Nuevo estado.
 */
export async function updateRequestStatus(id: string, status: string) {
  const supabase = await createServerClient()
  return supabase.from('solicitudes').update({ status }).eq('id', id).select('id, status, updated_at').single()
}

/**
 * Obtiene solicitudes recientes y métricas para el dashboard admin.
 */
export async function getAdminDashboardData() {
  const supabase = await createServerClient()
  return Promise.all([
    supabase.from('products').select('id,stock'),
    supabase.from('solicitudes').select('id,total_usd,status,created_at').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id'),
  ])
}

// ---------- Constantes re-exportadas ----------
// Las constantes viven en lib/request-status.mjs (módulo puro, seguro para client).
export { REQUEST_STATUSES, REQUEST_STATUS_LABELS }