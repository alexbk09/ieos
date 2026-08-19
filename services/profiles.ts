import { createClient as createServerClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

/**
 * Servicio de perfiles de usuario (SOLO servidor).
 * Capa única de acceso a Supabase para la tabla profiles.
 */

export type Profile = {
  id: string
  name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  role: 'admin' | 'client'
  avatar_url: string | null
  created_at: string
  updated_at: string
}

/**
 * Convierte los metadatos del usuario autenticado en un pseudo-perfil.
 * Se usa como fallback cuando el trigger no creó la fila (clientes antiguos
 * o registrados con metadata 'name' en vez de 'full_name').
 */
export function profileFromAuthUser(user: User): Profile {
  const meta = user.user_metadata ?? {}
  return {
    id: user.id,
    name: (meta.name ?? meta.full_name) || null,
    full_name: (meta.name ?? meta.full_name) || null,
    email: user.email ?? null,
    phone: meta.phone ?? null,
    role: 'client',
    avatar_url: meta.avatar_url ?? null,
    created_at: user.created_at,
    updated_at: user.created_at,
  }
}

/**
 * Obtiene todos los perfiles ordenados por fecha de creación descendente.
 * SOLO servidor.
 */
export async function getProfiles() {
  const supabase = await createServerClient()
  return supabase.from('profiles').select('*').order('created_at', { ascending: false })
}

/**
 * Obtiene el perfil completo del usuario autenticado.
 * Si la fila no existe en profiles (por ejemplo cliente creado antes del
 * trigger o sin perfil), devuelve un perfil construido desde user_metadata.
 * SOLO servidor.
 * @param user El usuario autenticado.
 * @returns El perfil del usuario (real o fallback).
 */
export async function getProfile(user: User): Promise<Profile> {
  const supabase = await createServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (data) return data as Profile
  return profileFromAuthUser(user)
}

/**
 * Crea el perfil si no existe (UPSERT).
 * Se usa al actualizar cuando la fila no está en la tabla (por ejemplo,
 * clientes registrados antes de que el trigger estuviera activo).
 * SOLO servidor.
 * @param userId ID del usuario autenticado.
 * @param payload Campos de la tabla profiles.
 */
export async function upsertProfile(userId: string, payload: Record<string, unknown>) {
  const supabase = await createServerClient()
  return supabase
    .from('profiles')
    .upsert({ id: userId, ...payload }, { onConflict: 'id' })
    .select('*')
    .single()
}

/**
 * Actualiza el perfil del usuario autenticado (nombre, teléfono, avatar).
 * Si la fila no existe, la crea (UPSERT) para que el perfil siempre funcione.
 * SOLO servidor.
 * @param userId ID del usuario autenticado.
 * @param updates Campos a actualizar (name, phone, avatar_url, email).
 * @returns El perfil actualizado o un error controlado.
 */
export async function updateProfile(userId: string, updates: { name?: string | null; phone?: string | null; avatar_url?: string | null; email?: string | null }) {
  const payload: Record<string, unknown> = {}

  // Mapea los nombres de campos del cliente a los de la BD.
  if ('name' in updates) payload.full_name = updates.name ?? null
  if ('phone' in updates) payload.phone = updates.phone ?? null
  if ('avatar_url' in updates) payload.avatar_url = updates.avatar_url ?? null
  if ('email' in updates) payload.email = updates.email ?? null

  return upsertProfile(userId, payload)
}