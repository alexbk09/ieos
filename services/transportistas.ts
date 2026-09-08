import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de transportistas (módulo independiente).
 * Capa única de acceso a Supabase para la tabla transportistas.
 * Los componentes NUNCA llaman a supabase.from() directamente.
 */

// ---------- Tipos ----------

export type Transportista = {
  id: string
  nombre: string
  tipo: 'interno' | 'externo'
  telefono: string | null
  vehiculo: string | null
  placa: string | null
  activo: boolean
  created_at: string
}

export type TransportistaInput = {
  nombre: string
  tipo: 'interno' | 'externo'
  telefono?: string | null
  vehiculo?: string | null
  placa?: string | null
  activo?: boolean
}

// ---------- Consultas ----------

/**
 * Obtiene todos los transportistas (activos e inactivos).
 */
export async function getTransportistas(): Promise<{ data: Transportista[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('transportistas').select('*').order('nombre')
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Transportista[], error: null }
}

/**
 * Obtiene solo los transportistas activos (para selectores).
 */
export async function getTransportistasActivos(): Promise<{ data: Transportista[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('transportistas').select('*').eq('activo', true).order('nombre')
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Transportista[], error: null }
}

// ---------- Mutaciones ----------

/**
 * Crea un transportista nuevo.
 */
export async function createTransportista(input: TransportistaInput): Promise<{ data: Transportista | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const nombre = input.nombre.trim()
  if (!nombre) return { data: null, error: { message: 'El nombre del transportista es obligatorio.' } }

  const { data, error } = await supabase
    .from('transportistas')
    .insert({
      nombre,
      tipo: input.tipo,
      telefono: input.telefono?.trim() || null,
      vehiculo: input.vehiculo?.trim() || null,
      placa: input.placa?.trim().toUpperCase() || null,
      activo: input.activo ?? true,
    })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Transportista, error: null }
}

/**
 * Actualiza un transportista.
 */
export async function updateTransportista(id: string, input: Partial<TransportistaInput>): Promise<{ data: Transportista | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (input.nombre !== undefined) update.nombre = input.nombre.trim()
  if (input.tipo !== undefined) update.tipo = input.tipo
  if (input.telefono !== undefined) update.telefono = input.telefono?.trim() || null
  if (input.vehiculo !== undefined) update.vehiculo = input.vehiculo?.trim() || null
  if (input.placa !== undefined) update.placa = input.placa?.trim().toUpperCase() || null
  if (input.activo !== undefined) update.activo = input.activo

  const { data, error } = await supabase.from('transportistas').update(update).eq('id', id).select('*').single()
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Transportista, error: null }
}

/**
 * Elimina un transportista.
 */
export async function deleteTransportista(id: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('transportistas').delete().eq('id', id)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}