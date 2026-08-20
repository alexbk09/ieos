import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'

/**
 * Servicio de proveedores.
 * Capa única de acceso a Supabase para la tabla proveedores.
 * Los componentes NUNCA deben llamar a supabase.from() directamente.
 * Las consultas públicas usan el cliente público (SSG+ISR).
 */

// ---------- Tipos ----------
export type Proveedor = {
  id: string
  rif: string
  nombre: string
  direccion: string | null
  contacto_nombre: string | null
  telefono: string | null
  email: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export type ProveedorInput = {
  rif: string
  nombre: string
  direccion?: string | null
  contacto_nombre?: string | null
  telefono?: string | null
  email?: string | null
  activo: boolean
}

// ---------- Consultas ----------

/**
 * Obtiene todos los proveedores (vista admin).
 * @returns Lista de proveedores o null si hay error.
 */
export async function getProveedores(): Promise<{ data: Proveedor[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('proveedores').select('*').order('nombre')
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Proveedor[], error: null }
}

/**
 * Obtiene solo los proveedores activos (para catálogo/selects públicos).
 * @returns Lista de proveedores activos.
 */
export async function getProveedoresActivos(): Promise<{ data: Pick<Proveedor, 'id' | 'nombre'>[] | null; error: { message: string } | null }> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.from('proveedores').select('id,nombre').eq('activo', true).order('nombre')
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Pick<Proveedor, 'id' | 'nombre'>[], error: null }
}

// ---------- Mutaciones ----------

/**
 * Crea un nuevo proveedor.
 * @param input Datos del proveedor.
 */
export async function createProveedor(input: ProveedorInput): Promise<{ data: Proveedor | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const rif = input.rif.trim()
  const nombre = input.nombre.trim()
  if (!rif) return { data: null, error: { message: 'El RIF es obligatorio.' } }
  if (!nombre) return { data: null, error: { message: 'El nombre del proveedor es obligatorio.' } }

  const { data, error } = await supabase
    .from('proveedores')
    .insert({
      rif,
      nombre,
      direccion: input.direccion ?? null,
      contacto_nombre: input.contacto_nombre ?? null,
      telefono: input.telefono ?? null,
      email: input.email ?? null,
      activo: input.activo,
    })
    .select('*')
    .single()
  if (error || !data) return { data: null, error: { message: error?.message ?? 'No se pudo crear el proveedor.' } }
  return { data: data as Proveedor, error: null }
}

/**
 * Actualiza un proveedor existente.
 * @param id ID del proveedor.
 * @param input Datos actualizados.
 */
export async function updateProveedor(id: string, input: ProveedorInput): Promise<{ data: Proveedor | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const rif = input.rif.trim()
  const nombre = input.nombre.trim()
  if (!rif) return { data: null, error: { message: 'El RIF es obligatorio.' } }
  if (!nombre) return { data: null, error: { message: 'El nombre del proveedor es obligatorio.' } }

  const { data, error } = await supabase
    .from('proveedores')
    .update({
      rif,
      nombre,
      direccion: input.direccion ?? null,
      contacto_nombre: input.contacto_nombre ?? null,
      telefono: input.telefono ?? null,
      email: input.email ?? null,
      activo: input.activo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { data: null, error: { message: error?.message ?? 'No se pudo actualizar el proveedor.' } }
  return { data: data as Proveedor, error: null }
}

/**
 * Elimina un proveedor. Los productos asociados quedan con proveedor_id NULL
 * (relación on delete set null).
 * @param id ID del proveedor.
 */
export async function deleteProveedor(id: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('proveedores').delete().eq('id', id)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}