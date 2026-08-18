import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de perfiles de usuario.
 * Capa única de acceso a Supabase para la tabla profiles.
 */

export type Profile = {
  id: string
  name: string | null
  phone: string | null
  role: 'admin' | 'client'
  created_at: string
}

/** Obtiene todos los perfiles ordenados por fecha de creación descendente. */
export async function getProfiles() {
  const supabase = await createServerClient()
  return supabase.from('profiles').select('*').order('created_at', { ascending: false })
}