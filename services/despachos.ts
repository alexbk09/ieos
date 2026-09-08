import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de despacho y asignación de rutas.
 * Capa única de acceso a Supabase para las tablas transportistas,
 * despachos y despacho_estados. El avance de estados usa la RPC
 * transaccional (completa la solicitud al entregar + historial).
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

export type Despacho = {
  id: string
  solicitud_id: string
  almacen_origen: string | null
  transportista_id: string | null
  ruta: string | null
  estado: 'programado' | 'en_ruta' | 'entregado' | 'fallido'
  fecha_programada: string | null
  fecha_entrega: string | null
  notas: string | null
  created_by: string | null
  created_at: string
  solicitud_id_short?: string
  cliente_nombre?: string | null
  almacen_nombre?: string | null
  transportista_nombre?: string | null
}

export type DespachoEstado = {
  id: string
  despacho_id: string
  estado_anterior: string | null
  estado_nuevo: string
  ubicacion: string | null
  observaciones: string | null
  updated_by: string | null
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

export type DespachoInput = {
  solicitud_id: string
  almacen_origen?: string | null
  transportista_id?: string | null
  ruta?: string | null
  fecha_programada?: string | null
  notas?: string | null
}

// ---------- Consultas ----------

/**
 * Obtiene las solicitudes despachables (confirmadas o en ruta) con datos
 * del cliente (perfil). El perfil se consulta aparte (sin FK a profiles).
 */
export async function getSolicitudesDespachables(): Promise<{ data: Array<{ id: string; id_short: string; total_usd: number; status: string; full_name: string | null; direccion_entrega: string | null; telefono_entrega: string | null }> | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('solicitudes')
    .select('id, user_id, total_usd, status, direccion_entrega, telefono_entrega, created_at')
    .in('status', ['confirmed', 'shipped', 'completed'])
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return { data: null, error: { message: error.message } }

  const userIds = (data ?? []).map((row: any) => row.user_id).filter(Boolean)
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p.full_name]))

  const normalized = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    id_short: row.id.slice(0, 8).toUpperCase(),
    total_usd: Number(row.total_usd ?? 0),
    status: row.status,
    full_name: row.user_id ? (profileMap.get(row.user_id) ?? null) : null,
    direccion_entrega: row.direccion_entrega ?? null,
    telefono_entrega: row.telefono_entrega ?? null,
  }))

  return { data: normalized, error: null }
}

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
 * Obtiene todos los despachos con datos de cliente, almacén y transportista.
 * Combina consultas manualmente (patrón del sistema).
 */
export async function getDespachos(): Promise<{ data: Despacho[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const { data: despachos, error } = await supabase
    .from('despachos')
    .select('*, solicitudes(user_id, total_usd), almacenes(nombre), transportistas(nombre)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return { data: null, error: { message: error.message } }

  const userIds = (despachos ?? [])
    .map((row: any) => row.solicitudes?.user_id ?? null)
    .filter(Boolean)
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p.full_name]))

  const normalized = ((despachos ?? []) as any[]).map((row) => ({
    id: row.id,
    solicitud_id: row.solicitud_id,
    almacen_origen: row.almacen_origen,
    transportista_id: row.transportista_id,
    ruta: row.ruta,
    estado: row.estado,
    fecha_programada: row.fecha_programada,
    fecha_entrega: row.fecha_entrega,
    notas: row.notas,
    created_by: row.created_by,
    created_at: row.created_at,
    solicitud_id_short: row.solicitud_id?.slice(0, 8).toUpperCase(),
    cliente_nombre: row.solicitudes?.user_id ? (profileMap.get(row.solicitudes.user_id) ?? null) : null,
    almacen_nombre: (row.almacenes as any)?.nombre ?? null,
    transportista_nombre: (row.transportistas as any)?.nombre ?? null,
  }))

  return { data: normalized, error: null }
}

/**
 * Obtiene el historial de estados de un despacho.
 */
export async function getHistorialDespacho(despachoId: string): Promise<{ data: DespachoEstado[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('despacho_estados')
    .select('*')
    .eq('despacho_id', despachoId)
    .order('created_at', { ascending: true })
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as DespachoEstado[], error: null }
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

/**
 * Crea un despacho para una solicitud.
 */
export async function createDespacho(input: DespachoInput): Promise<{ data: Despacho | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  if (!input.solicitud_id) return { data: null, error: { message: 'Debes seleccionar una solicitud.' } }

  // Verificar que la solicitud no tenga ya un despacho activo.
  const { data: existing } = await supabase
    .from('despachos')
    .select('id')
    .eq('solicitud_id', input.solicitud_id)
    .in('estado', ['programado', 'en_ruta'])
    .maybeSingle()
  if (existing) return { data: null, error: { message: 'Esta solicitud ya tiene un despacho activo.' } }

  const { data, error } = await supabase
    .from('despachos')
    .insert({
      solicitud_id: input.solicitud_id,
      almacen_origen: input.almacen_origen ?? null,
      transportista_id: input.transportista_id ?? null,
      ruta: input.ruta?.trim() || null,
      fecha_programada: input.fecha_programada || new Date().toISOString().slice(0, 10),
      notas: input.notas?.trim() || null,
    })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Despacho, error: null }
}

/**
 * Avanza el estado de un despacho (RPC transaccional + historial).
 * Al marcar 'entregado' completa la solicitud (dispara trigger de stock).
 */
export async function avanzarEstadoDespacho(
  despachoId: string,
  estado: 'programado' | 'en_ruta' | 'entregado' | 'fallido',
  ubicacion?: string | null,
  observaciones?: string | null,
): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('avanzar_estado_despacho', {
    p_despacho_id: despachoId,
    p_estado: estado,
    p_ubicacion: ubicacion ?? null,
    p_observaciones: observaciones ?? null,
  })
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: Boolean(data), error: null }
}

/**
 * Asigna un transportista a un despacho.
 */
export async function asignarTransportista(despachoId: string, transportistaId: string | null): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('despachos').update({ transportista_id: transportistaId }).eq('id', despachoId)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}