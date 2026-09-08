import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de conciliación bancaria express.
 * Capa única de acceso a Supabase para las tablas banco_configuraciones
 * y movimientos_bancarios. La conciliación y descarte usan RPCs
 * transaccionales con validación de permisos.
 */

// ---------- Tipos ----------

export type BancoConfiguracion = {
  id: string
  nombre_banco: string
  tipo_integracion: 'manual' | 'api'
  api_endpoint: string | null
  api_key: string | null
  api_token: string | null
  activo: boolean
  ultima_sincronizacion: string | null
  created_at: string
}

export type MovimientoBancario = {
  id: string
  banco_id: string | null
  referencia: string
  fecha_movimiento: string
  monto_usd: number
  emisor: string | null
  beneficiario: string | null
  detalle: string | null
  estado: 'nuevo' | 'conciliado' | 'descartado' | 'duplicado'
  abono_id: string | null
  raw_json: Record<string, unknown>
  created_at: string
  banco_nombre?: string | null
}

// ---------- Consultas ----------

/**
 * Obtiene todos los bancos configurados.
 */
export async function getBancos(): Promise<{ data: BancoConfiguracion[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('banco_configuraciones').select('*').order('nombre_banco')
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as BancoConfiguracion[], error: null }
}

/**
 * Obtiene los movimientos bancarios, opcionalmente filtrados por estado.
 * @param estado Filtro opcional: 'nuevo', 'conciliado', 'descartado', 'duplicado'.
 */
export async function getMovimientos(estado?: string | null): Promise<{ data: MovimientoBancario[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  let query = supabase
    .from('movimientos_bancarios')
    .select('*, banco_configuraciones(nombre_banco)')
    .order('fecha_movimiento', { ascending: false })
    .limit(200)

  if (estado && ['nuevo', 'conciliado', 'descartado', 'duplicado'].includes(estado)) {
    query = query.eq('estado', estado)
  }

  const { data, error } = await query
  if (error) return { data: null, error: { message: error.message } }

  const normalized = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    banco_id: row.banco_id,
    referencia: row.referencia,
    fecha_movimiento: row.fecha_movimiento,
    monto_usd: Number(row.monto_usd ?? 0),
    emisor: row.emisor,
    beneficiario: row.beneficiario,
    detalle: row.detalle,
    estado: row.estado,
    abono_id: row.abono_id,
    raw_json: row.raw_json ?? {},
    created_at: row.created_at,
    banco_nombre: (row.banco_configuraciones as any)?.nombre_banco ?? null,
  }))

  return { data: normalized, error: null }
}

// ---------- Mutaciones ----------

/**
 * Crea un banco o configuración de integración.
 */
export async function crearBanco(input: Partial<BancoConfiguracion>): Promise<{ data: BancoConfiguracion | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  if (!input.nombre_banco?.trim()) return { data: null, error: { message: 'El nombre del banco es obligatorio.' } }

  const { data, error } = await supabase
    .from('banco_configuraciones')
    .insert({
      nombre_banco: input.nombre_banco.trim(),
      tipo_integracion: input.tipo_integracion ?? 'manual',
      api_endpoint: input.api_endpoint?.trim() || null,
      api_key: input.api_key?.trim() || null,
      api_token: input.api_token?.trim() || null,
      activo: input.activo ?? true,
    })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as BancoConfiguracion, error: null }
}

/**
 * Actualiza un banco.
 */
export async function actualizarBanco(id: string, input: Partial<BancoConfiguracion>): Promise<{ data: BancoConfiguracion | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (input.nombre_banco !== undefined) update.nombre_banco = input.nombre_banco.trim()
  if (input.tipo_integracion !== undefined) update.tipo_integracion = input.tipo_integracion
  if (input.api_endpoint !== undefined) update.api_endpoint = input.api_endpoint?.trim() || null
  if (input.api_key !== undefined) update.api_key = input.api_key?.trim() || null
  if (input.api_token !== undefined) update.api_token = input.api_token?.trim() || null
  if (input.activo !== undefined) update.activo = input.activo

  const { data, error } = await supabase.from('banco_configuraciones').update(update).eq('id', id).select('*').single()
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as BancoConfiguracion, error: null }
}

/**
 * Elimina un banco (los movimientos referenciados quedan con banco null).
 */
export async function eliminarBanco(id: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('banco_configuraciones').delete().eq('id', id)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}

/**
 * Crea un movimiento bancario manual.
 */
export async function crearMovimiento(input: {
  banco_id?: string | null
  referencia: string
  monto_usd: number
  emisor?: string | null
  beneficiario?: string | null
  detalle?: string | null
  fecha_movimiento?: string | null
}): Promise<{ data: MovimientoBancario | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  if (!input.referencia.trim()) return { data: null, error: { message: 'La referencia es obligatoria.' } }
  if (!input.monto_usd || input.monto_usd <= 0) return { data: null, error: { message: 'El monto debe ser mayor a 0.' } }

  const { data, error } = await supabase
    .from('movimientos_bancarios')
    .insert({
      banco_id: input.banco_id ?? null,
      referencia: input.referencia.trim(),
      monto_usd: Number(input.monto_usd),
      emisor: input.emisor?.trim() || null,
      beneficiario: input.beneficiario?.trim() || null,
      detalle: input.detalle?.trim() || null,
      fecha_movimiento: input.fecha_movimiento || new Date().toISOString(),
      estado: 'nuevo',
    })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as MovimientoBancario, error: null }
}

/**
 * Sincroniza movimientos desde el endpoint API del banco.
 * Devuelve los movimientos creados o el error de la petición.
 */
export async function sincronizarBanco(banco: BancoConfiguracion): Promise<{ ok: boolean; error?: string; creados?: number }> {
  const supabase = await createServerClient()

  if (banco.tipo_integracion !== 'api' || !banco.api_endpoint) {
    return { ok: false, error: 'El banco no tiene integración API configurada.' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (banco.api_key) headers['X-API-Key'] = banco.api_key
    if (banco.api_token) headers['Authorization'] = `Bearer ${banco.api_token}`

    const response = await fetch(banco.api_endpoint, { headers, signal: controller.signal })
    clearTimeout(timeout)

    if (!response.ok) {
      return { ok: false, error: `El banco respondió con estado ${response.status}` }
    }

    const result = await response.json()
    const movimientos = Array.isArray(result) ? result : (result.movimientos ?? result.data ?? [])

    let creados = 0
    for (const item of movimientos as Array<Record<string, unknown>>) {
      const referencia = String(item.referencia ?? item.operation_id ?? item.id ?? '')
      if (!referencia) continue
      const { error: insertError } = await supabase.from('movimientos_bancarios').upsert(
        {
          banco_id: banco.id,
          referencia,
          fecha_movimiento: String(item.fecha_movimiento ?? item.fecha ?? new Date().toISOString()),
          monto_usd: Number(item.monto_usd ?? item.amount ?? item.monto ?? 0),
          emisor: String(item.emisor ?? item.from ?? '').slice(0, 200) || null,
          beneficiario: String(item.beneficiario ?? item.to ?? '').slice(0, 200) || null,
          detalle: String(item.detalle ?? item.descripcion ?? '').slice(0, 300) || null,
          raw_json: item,
          estado: 'nuevo',
        },
        { onConflict: 'banco_id,referencia' },
      )
      if (!insertError) creados++
    }

    // Registrar última sincronización.
    await supabase.from('banco_configuraciones').update({ ultima_sincronizacion: new Date().toISOString() }).eq('id', banco.id)

    return { ok: true, creados }
  } catch (err: any) {
    return { ok: false, error: err?.name === 'AbortError' ? 'La petición al banco tardó demasiado.' : err?.message ?? 'Error al sincronizar con el banco.' }
  }
}

/**
 * Concilia un movimiento contra un abono (RPC transaccional).
 */
export async function conciliarMovimiento(movimientoId: string, abonoId: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('conciliar_movimiento', {
    p_movimiento_id: movimientoId,
    p_abono_id: abonoId,
  })
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: Boolean(data), error: null }
}

/**
 * Descarta un movimiento (RPC transaccional).
 */
export async function descartarMovimiento(movimientoId: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('descartar_movimiento', {
    p_movimiento_id: movimientoId,
  })
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: Boolean(data), error: null }
}