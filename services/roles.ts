import { createClient as createServerClient } from '@/lib/supabase/server'
import { isModuleHidden } from '@/lib/constants'

/**
 * Servicio de roles y permisos.
 * Capa única de acceso a Supabase para roles, módulos y permisos.
 * Los componentes NUNCA deben llamar a supabase.from() directamente.
 */

// ---------- Tipos ----------
export type Module = {
  id: string
  name: string
  slug: string
  description: string | null
}

export type RolePermission = {
  role_id: string
  module_id: string
  can_read: boolean
  can_write: boolean
  can_delete: boolean
}

export type Role = {
  id: string
  name: string
  description: string | null
  created_at: string
  /** Permisos del rol por módulo (vacío si no se solicitaron). */
  permissions?: RolePermission[]
}

export type RoleInput = {
  name: string
  description?: string | null
  /** Permisos a asignar: mapa de module_id → { read, write, delete }. */
  permissions: Record<string, { can_read: boolean; can_write: boolean; can_delete: boolean }>
}

/** Permiso de un usuario autenticado sobre un módulo. */
export type UserModulePermission = {
  module_slug: string
  can_read: boolean
  can_write: boolean
  can_delete: boolean
}

// ---------- Consultas ----------

/**
 * Obtiene todos los módulos del sistema ordenados por nombre.
 * Excluye los módulos legado ocultos (HIDDEN_MODULE_SLUGS) para que no
 * aparezcan en la matriz de permisos del RoleManager.
 * @returns Lista de módulos visibles o null si hay error.
 */
export async function getModules(): Promise<{ data: Module[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('modules').select('*').order('name')
  if (error) return { data: null, error: { message: error.message } }
  const visibleModules = (data as Module[]).filter((module) => !isModuleHidden(module.slug))
  return { data: visibleModules, error: null }
}

/**
 * Obtiene todos los roles con sus permisos asociados.
 * @returns Lista de roles enriquecidos con permisos.
 */
export async function getRolesWithPermissions(): Promise<{ data: (Role & { permissions: RolePermission[] })[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const [{ data: roles }, { data: permissions }] = await Promise.all([
    supabase.from('roles').select('*').order('created_at', { ascending: false }),
    supabase.from('role_permissions').select('*'),
  ])

  if (!roles) return { data: null, error: { message: 'No se pudieron cargar los roles.' } }

  const byRole = new Map<string, RolePermission[]>()
  for (const rp of (permissions ?? []) as RolePermission[]) {
    const list = byRole.get(rp.role_id) ?? []
    list.push(rp)
    byRole.set(rp.role_id, list)
  }

  const data = roles.map((role) => ({
    ...(role as Role),
    permissions: byRole.get((role as Role).id) ?? [],
  }))

  return { data, error: null }
}

/**
 * Obtiene los permisos del usuario autenticado (para filtrar navegación y UI).
 * Usa la función RPC get_user_permissions() definida en la migración 0013.
 * Excluye los módulos legado ocultos para que no reaparezcan en la interfaz.
 * @returns Lista de permisos del usuario actual.
 */
export async function getUserPermissions(): Promise<{ data: UserModulePermission[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('get_user_permissions')
  if (error) return { data: null, error: { message: error.message } }
  const rows = (data ?? []) as UserModulePermission[]
  return { data: rows.filter((permission) => !isModuleHidden(permission.module_slug)), error: null }
}

/**
 * Verifica si el usuario autenticado tiene permiso sobre un módulo y acción.
 * Los módulos legado ocultos quedan SIEMPRE sin acceso (menú, URL directa y APIs).
 * @param slug Slug del módulo (ej: 'productos').
 * @param action Acción: 'read' | 'write' | 'delete'.
 * @returns true si tiene permiso, false en caso contrario.
 */
export async function hasPermission(slug: string, action: 'read' | 'write' | 'delete'): Promise<boolean> {
  // Corta antes de consultar la base de datos: ocultar es más rápido y seguro.
  if (isModuleHidden(slug)) return false
  const supabase = await createServerClient()
  const { data } = await supabase.rpc('has_permission', { p_slug: slug, p_action: action })
  return Boolean(data)
}

// ---------- Mutaciones ----------

/**
 * Crea un rol nuevo con sus permisos por módulo.
 * Primero inserta el rol y luego inserta todos los permisos en lote.
 * @param input Datos del rol incluyendo permisos.
 */
export async function createRole(input: RoleInput): Promise<{ data: Role | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const name = input.name.trim()
  if (!name) return { data: null, error: { message: 'El nombre del rol es obligatorio.' } }

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .insert({ name, description: input.description ?? null })
    .select('*')
    .single()
  if (roleError || !role) return { data: null, error: { message: roleError?.message ?? 'No se pudo crear el rol.' } }

  const permissionRows = Object.entries(input.permissions ?? {}).map(([module_id, p]) => ({
    role_id: role.id,
    module_id,
    can_read: p.can_read,
    can_write: p.can_write,
    can_delete: p.can_delete,
  }))

  if (permissionRows.length > 0) {
    const { error: permError } = await supabase.from('role_permissions').insert(permissionRows)
    if (permError) {
      await supabase.from('roles').delete().eq('id', role.id)
      return { data: null, error: { message: permError.message } }
    }
  }

  return { data: role as Role, error: null }
}

/**
 * Actualiza un rol existente: nombre, descripción y permisos.
 * Los permisos se reemplazan por completo (borrar + insertar).
 * @param id ID del rol.
 * @param input Datos actualizados.
 */
export async function updateRole(id: string, input: RoleInput): Promise<{ data: Role | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const name = input.name.trim()
  if (!name) return { data: null, error: { message: 'El nombre del rol es obligatorio.' } }

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .update({ name, description: input.description ?? null })
    .eq('id', id)
    .select('*')
    .single()
  if (roleError || !role) return { data: null, error: { message: roleError?.message ?? 'No se pudo actualizar el rol.' } }

  const { error: deleteError } = await supabase.from('role_permissions').delete().eq('role_id', id)
  if (deleteError) return { data: null, error: { message: deleteError.message } }

  const permissionRows = Object.entries(input.permissions ?? {}).map(([module_id, p]) => ({
    role_id: id,
    module_id,
    can_read: p.can_read,
    can_write: p.can_write,
    can_delete: p.can_delete,
  }))

  if (permissionRows.length > 0) {
    const { error: permError } = await supabase.from('role_permissions').insert(permissionRows)
    if (permError) return { data: null, error: { message: permError.message } }
  }

  return { data: role as Role, error: null }
}

/**
 * Elimina un rol. Los permisos se borran en cascada.
 * Protege los roles base del sistema (admin y client).
 * @param id ID del rol.
 */
export async function deleteRole(id: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const { data: role } = await supabase.from('roles').select('name').eq('id', id).maybeSingle()
  if (role && ['admin', 'client'].includes(role.name)) {
    return { ok: false, error: { message: 'Los roles "admin" y "client" no se pueden eliminar.' } }
  }

  const { error } = await supabase.from('roles').delete().eq('id', id)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}