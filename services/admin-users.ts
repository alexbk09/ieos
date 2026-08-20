import { createClient } from '@supabase/supabase-js'
import { normalizeRole } from '@/lib/role-normalizer.mjs'

/**
 * Servicio de administración de usuarios (SOLO servidor).
 * Lista TODOS los usuarios de auth.users combinados con sus perfiles,
 * y crea usuarios nuevos con asignación de rol.
 */

export type AdminUser = {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  role: 'admin' | 'client'
  role_name: string | null
  role_id: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
  has_profile: boolean
}

export type NewAdminUserInput = {
  email: string
  password: string
  full_name?: string | null
  phone?: string | null
  role_id?: string | null
}

function createServiceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor.')
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function listAdminUsers(): Promise<{ data: AdminUser[] | null; error: string | null }> {
  try {
    const serviceClient = createServiceClient()

    const { data: authData, error: authError } = await serviceClient.auth.admin.listUsers()
    if (authError) return { data: null, error: authError.message }

    const { data: profiles } = await serviceClient.from('profiles').select('*')
    const profilesMap = new Map((profiles ?? []).map((p) => [p.id, p]))

    const { data: roles } = await serviceClient.from('roles').select('id, name')
    const rolesMap = new Map((roles ?? []).map((r) => [r.id, r.name]))

    const users: AdminUser[] = (authData.users ?? []).map((user) => {
      const profile = profilesMap.get(user.id)
      const meta = user.user_metadata ?? {}
      const roleId = profile?.role_id ?? null
      return {
        id: user.id,
        email: user.email ?? null,
        full_name: profile?.full_name ?? meta.name ?? meta.full_name ?? null,
        phone: profile?.phone ?? meta.phone ?? null,
        role: profile?.role === 'admin' || normalizeRole(meta.role) === 'admin' ? 'admin' : 'client',
        role_name: roleId ? (rolesMap.get(roleId) ?? null) : null,
        role_id: roleId,
        avatar_url: profile?.avatar_url ?? meta.avatar_url ?? null,
        created_at: profile?.created_at ?? user.created_at,
        updated_at: profile?.updated_at ?? user.created_at,
        has_profile: Boolean(profile),
      }
    })

    users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return { data: users, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error inesperado al listar usuarios.' }
  }
}

/**
 * Crea un usuario en auth.users y le asigna un rol.
 * 1) Crea el usuario con user_metadata.role = base (admin|client) para que el
 *    trigger handle_new_user cree el perfil sin violar el CHECK de profiles.role.
 * 2) Si hay role_id personalizado, actualiza el perfil para fijarlo en profiles.role_id.
 */
export async function createAdminUser(input: NewAdminUserInput): Promise<{ data: AdminUser | null; error: string | null }> {
  try {
    const serviceClient = createServiceClient()

    const email = input.email.trim().toLowerCase()
    if (!email) return { data: null, error: 'El email es obligatorio.' }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { data: null, error: 'El email no es válido.' }

    const password = input.password ?? ''
    if (password.length < 6) return { data: null, error: 'La contraseña debe tener al menos 6 caracteres.' }

    let roleId: string | null = input.role_id ?? null
    let baseRole: 'admin' | 'client' = 'client'
    if (roleId) {
      const { data: role } = await serviceClient.from('roles').select('id, name').eq('id', roleId).maybeSingle()
      if (!role) return { data: null, error: 'El rol seleccionado no existe.' }
      baseRole = role.name === 'admin' ? 'admin' : 'client'
    }

    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: baseRole,
        name: input.full_name?.trim() || null,
        full_name: input.full_name?.trim() || null,
        phone: input.phone?.trim() || null,
      },
    })
    if (createError || !created.user) {
      return { data: null, error: createError?.message ?? 'No se pudo crear el usuario.' }
    }

    const userId = created.user.id

    const { error: profileError } = await serviceClient.from('profiles').upsert(
      {
        id: userId,
        email,
        full_name: input.full_name?.trim() || null,
        phone: input.phone?.trim() || null,
        role: baseRole,
        role_id: roleId,
      },
      { onConflict: 'id' },
    )
    if (profileError) {
      console.error('Error al actualizar el perfil:', profileError.message)
    }

    const { data: freshProfiles } = await serviceClient.from('profiles').select('*').eq('id', userId).maybeSingle()
    const profile = freshProfiles ?? null

    const { data: roleData } = roleId
      ? await serviceClient.from('roles').select('name').eq('id', roleId).maybeSingle()
      : { data: null }

    const adminUser: AdminUser = {
      id: userId,
      email,
      full_name: profile?.full_name ?? input.full_name?.trim() ?? null,
      phone: profile?.phone ?? input.phone?.trim() ?? null,
      role: baseRole,
      role_name: roleData?.name ?? null,
      role_id: roleId,
      avatar_url: profile?.avatar_url ?? null,
      created_at: profile?.created_at ?? new Date().toISOString(),
      updated_at: profile?.updated_at ?? new Date().toISOString(),
      has_profile: Boolean(profile),
    }

    return { data: adminUser, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error inesperado al crear el usuario.' }
  }
}