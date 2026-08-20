import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'

/**
 * Servicio de marcas.
 * Capa única de acceso a Supabase para la tabla marcas.
 * Los componentes NUNCA deben llamar a supabase.from() directamente.
 * Las consultas públicas usan el cliente público (SSG+ISR).
 */

// ---------- Tipos ----------
export type Marca = {
  id: string
  nombre: string
  activa: boolean
  created_at: string
  updated_at: string
}

export type MarcaInput = {
  nombre: string
  activa: boolean
}

// ---------- Consultas ----------

/**
 * Obtiene todas las marcas (vista admin).
 * @returns Lista de marcas o null si hay error.
 */
export async function getMarcas(): Promise<{ data: Marca[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('marcas').select('*').order('nombre')
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Marca[], error: null }
}

/**
 * Obtiene solo las marcas activas (para catálogo/selects públicos).
 * @returns Lista de marcas activas.
 */
export async function getMarcasActivas(): Promise<{ data: Pick<Marca, 'id' | 'nombre'>[] | null; error: { message: string } | null }> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.from('marcas').select('id,nombre').eq('activa', true).order('nombre')
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Pick<Marca, 'id' | 'nombre'>[], error: null }
}

// ---------- Mutaciones ----------

/**
 * Crea una nueva marca.
 * @param input Datos de la marca.
 */
export async function createMarca(input: MarcaInput): Promise<{ data: Marca | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const nombre = input.nombre.trim()
  if (!nombre) return { data: null, error: { message: 'El nombre de la marca es obligatorio.' } }

  const { data, error } = await supabase.from('marcas').insert({ nombre, activa: input.activa }).select('*').single()
  if (error || !data) return { data: null, error: { message: error?.message ?? 'No se pudo crear la marca.' } }
  return { data: data as Marca, error: null }
}

/**
 * Actualiza una marca existente.
 * @param id ID de la marca.
 * @param input Datos actualizados.
 */
export async function updateMarca(id: string, input: MarcaInput): Promise<{ data: Marca | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const nombre = input.nombre.trim()
  if (!nombre) return { data: null, error: { message: 'El nombre de la marca es obligatorio.' } }

  const { data, error } = await supabase
    .from('marcas')
    .update({ nombre, activa: input.activa, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) return { data: null, error: { message: error?.message ?? 'No se pudo actualizar la marca.' } }
  return { data: data as Marca, error: null }
}

/**
 * Elimina una marca. Los productos asociados quedan con marca_id NULL
 * (relación on delete set null).
 * @param id ID de la marca.
 */
export async function deleteMarca(id: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('marcas').delete().eq('id', id)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}