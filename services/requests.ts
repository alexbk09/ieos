import { createClient as createServerClient } from '@/lib/supabase/server'
import { EXCHANGE_RATE } from '@/lib/constants'
import { normalizeCartItems } from '@/lib/price-calculator'
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS } from '@/lib/request-status.mjs'

/**
 * Servicio de solicitudes (pedidos).
 * Capa única de acceso a Supabase para la gestión de solicitudes.
 */

// ---------- Tipos ----------
export type RequestItem = {
  id: string
  product_name: string
  quantity: number
  unit_price_usd: number
}

export type Request = {
  id: string
  user_id: string
  status: string
  total_usd: number
  created_at: string
  solicitud_items: RequestItem[]
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
 * Valida stock real de cada producto y calcula el total en USD.
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

  const { data: solicitud, error } = await supabase
    .from('solicitudes')
    .insert({ user_id: userId, total_usd: total, exchange_rate: EXCHANGE_RATE })
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
  return supabase.from('solicitudes').select('*').eq('user_id', userId).order('created_at', { ascending: false })
}

// ---------- Solicitudes del admin ----------

/**
 * Obtiene todas las solicitudes con sus ítems.
 */
export async function getRequestsWithItems() {
  const supabase = await createServerClient()
  return supabase.from('solicitudes').select('*, solicitud_items(*)').order('created_at', { ascending: false })
}

/**
 * Actualiza el estado de una solicitud.
 * @param id ID de la solicitud.
 * @param status Nuevo estado.
 */
export async function updateRequestStatus(id: string, status: string) {
  const supabase = await createServerClient()
  return supabase.from('solicitudes').update({ status }).eq('id', id).select('*').single()
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
