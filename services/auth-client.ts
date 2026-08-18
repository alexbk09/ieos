import { createClient as createBrowserClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { normalizeRole } from '@/lib/role-normalizer.mjs'

/**
 * Servicio de autenticación (SOLO navegador).
 * Se importa únicamente desde componentes 'use client'.
 */

/**
 * Obtiene el usuario autenticado actual en el navegador.
 * @returns El usuario actual o null si no hay sesión activa.
 */
export async function getBrowserUser(): Promise<User | null> {
  const supabase = createBrowserClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}

/**
 * Inicia sesión con correo y contraseña.
 * @param email Correo del usuario.
 * @param password Contraseña del usuario.
 */
export async function signInWithEmail(email: string, password: string) {
  const supabase = createBrowserClient()
  return supabase.auth.signInWithPassword({ email, password })
}

/**
 * Registra un nuevo usuario con datos adicionales de perfil.
 * @param email Correo del usuario.
 * @param password Contraseña del usuario.
 * @param metadata Metadatos (nombre, teléfono).
 */
export async function signUpWithEmail(email: string, password: string, metadata: Record<string, unknown>) {
  const supabase = createBrowserClient()
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      data: metadata,
    },
  })
}

/**
 * Obtiene el rol del usuario autenticado.
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
export async function getBrowserUserRole(user: User): Promise<'admin' | 'user'> {
  // 1) Primero la metadata del usuario autenticado.
  //    Esto asegura que un admin creado con supabase/run.mjs
  //    (user_metadata.role = 'admin') sea detectado aunque su perfil en la
  //    base de datos no exista o tenga rol incorrecto.
  const metadataRole = normalizeRole(user.user_metadata?.role ?? user.app_metadata?.role)
  if (metadataRole === 'admin') return 'admin'

  // 2) Fallback a la tabla profiles cuando la metadata no determina admin.
  const supabase = createBrowserClient()
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (data?.role === 'admin') return 'admin'

  // 3) Cliente por defecto.
  return 'user'
}