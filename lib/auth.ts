import { redirect } from 'next/navigation'
import { getServerUser, getUserRole } from '@/services/auth-server'
import type { User } from '@supabase/supabase-js'

/**
 * Utilidades de autenticación para el servidor.
 * Todo el acceso a Supabase se realiza a través de /services/auth.
 */

/**
 * Obtiene el usuario autenticado actual en el servidor.
 * @returns El usuario actual o null si no hay sesión activa.
 */
export async function getCurrentUser() {
  const user = await getServerUser()
  return { user }
}

/**
 * Exige que exista un usuario autenticado; si no, redirige a /login.
 * @returns El usuario autenticado.
 */
export async function requireUser() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  return { user: user as NonNullable<User> }
}

/**
 * Exige que el usuario tenga rol administrador; si no, redirige a /dashboard.
 * @returns El usuario autenticado con rol admin.
 */
export async function requireAdmin() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  const role = await getUserRole(user)
  if (role !== 'admin') redirect('/dashboard')
  return { user, role: 'admin' as const }
}