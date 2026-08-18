import { createClient as createServerClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'
import { normalizeRole } from '@/lib/role-normalizer.mjs'

/**
 * Servicio de autenticación (SOLO servidor).
 * Usa next/headers — NUNCA importar desde componentes client.
 */

/**
 * Obtiene el usuario autenticado actual en el servidor.
 * @returns El usuario actual o null si no hay sesión activa.
 */
export async function getServerUser(): Promise<User | null> {
  const supabase = await createServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}

/**
 * Cierra la sesión del usuario actual en el servidor.
 */
export async function signOutServer() {
  const supabase = await createServerClient()
  return supabase.auth.signOut()
}

/**
 * Intercambia el código OAuth recibido en el callback por una sesión.
 * @param code Código de verificación enviado por Supabase.
 */
export async function exchangeCodeForSession(code: string) {
  const supabase = await createServerClient()
  return supabase.auth.exchangeCodeForSession(code)
}

/**
 * Obtiene el rol del usuario autenticado (usando cliente de servidor).
 *
 * Prioridad de fuentes:
 *   1. user_metadata.role — metadata del usuario autenticado (fuente más confiable).
 *      El admin creado vía supabase/run.mjs SIEMPRE trae role: 'admin' aquí.
 *   2. profiles.role — rol en la tabla de la BD (fuente canónica).
 *   3. app_metadata.role — metadata de la aplicación.
 *
 * @param user El usuario autenticado.
 * @returns 'admin' | 'user'
 */
export async function getUserRole(user: User): Promise<'admin' | 'user'> {
  // 1) Primero la metadata del usuario autenticado.
  const metadataRole = normalizeRole(user.user_metadata?.role ?? user.app_metadata?.role)
  if (metadataRole === 'admin') return 'admin'

  // 2) Fallback a la tabla profiles cuando la metadata no determina admin.
  const supabase = await createServerClient()
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (data?.role === 'admin') return 'admin'

  // 3) Cliente por defecto.
  return 'user'
}
