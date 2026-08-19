import { createClient as createBrowserClient } from '@/lib/supabase/client'

/**
 * Servicio de perfiles de usuario (SOLO navegador).
 * Se importa únicamente desde componentes 'use client'.
 * No usa next/headers — separado de services/profiles.ts (servidor).
 */

export type BrowserProfile = {
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
 * Obtiene el perfil completo del usuario autenticado desde el navegador.
 * Si la fila no existe en profiles, devuelve un perfil construido desde
 * user_metadata para que el nombre y avatar del usuario siempre aparezcan.
 * @returns El perfil del usuario o null si no hay sesión.
 */
export async function getBrowserProfile(): Promise<BrowserProfile | null> {
  const supabase = createBrowserClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (data) return data as BrowserProfile

  // Fallback: construye el perfil desde la metadata auth.
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