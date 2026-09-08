import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de pasarelas de pago internacionales.
 * Capa única de acceso a Supabase para las tablas pasarelas_configuracion
 * y pagos. La confirmación manual usa la RPC confirmar_pago.
 * Los componentes NUNCA llaman a supabase.from() directamente.
 */

// ---------- Tipos ----------

export type PasarelaConfiguracion = {
  id: string
  nombre: string
  activo: boolean
  llave_publica: string | null
  llave_secreta_enc: string | null
  modo: 'sandbox' | 'produccion'
  monedas: string[]
  comision_porcentual: number
  updated_at: string
}

export type Pago = {
  id: string
  solicitud_id: string | null
  invoice_id: string | null
  user_id: string | null
  pasarela_id: string | null
  referencia_pasarela: string | null
  monto_usd: number
  moneda: string
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'reembolsado' | 'expirado'
  payload: Record<string, unknown>
  created_at: string
  pasarela_nombre?: string
}

// ---------- Consultas ----------

/**
 * Obtiene las configuraciones de pasarelas.
 */
export async function getPasarelas(): Promise<{ data: PasarelaConfiguracion[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('pasarelas_configuracion').select('*').order('nombre')
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as PasarelaConfiguracion[], error: null }
}

/**
 * Obtiene el listado de pagos con el nombre de la pasarela.
 */
export async function getPagos(): Promise<{ data: Pago[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('pagos')
    .select('*, pasarelas_configuracion(nombre)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return { data: null, error: { message: error.message } }

  const normalized = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    solicitud_id: row.solicitud_id,
    invoice_id: row.invoice_id,
    user_id: row.user_id,
    pasarela_id: row.pasarela_id,
    referencia_pasarela: row.referencia_pasarela,
    monto_usd: Number(row.monto_usd ?? 0),
    moneda: row.moneda,
    estado: row.estado,
    payload: row.payload ?? {},
    created_at: row.created_at,
    pasarela_nombre: (row.pasarelas_configuracion as any)?.nombre ?? '—',
  }))

  return { data: normalized, error: null }
}

// ---------- Mutaciones ----------

/**
 * Actualiza la configuración de una pasarela.
 * @param id ID de la pasarela.
 * @param input Datos a actualizar (sin exponer llaves secretas).
 */
export async function actualizarPasarela(id: string, input: Partial<PasarelaConfiguracion>): Promise<{ data: PasarelaConfiguracion | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (input.activo !== undefined) update.activo = Boolean(input.activo)
  if (input.llave_publica !== undefined) update.llave_publica = input.llave_publica?.trim() || null
  if (input.llave_secreta_enc !== undefined) update.llave_secreta_enc = input.llave_secreta_enc?.trim() || null
  if (input.modo !== undefined) update.modo = input.modo
  if (input.comision_porcentual !== undefined) update.comision_porcentual = Number(input.comision_porcentual) || 0

  const { data, error } = await supabase.from('pasarelas_configuracion').update(update).eq('id', id).select('*').single()
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as PasarelaConfiguracion, error: null }
}

/**
 * Crea un pago pendiente asociado a una solicitud (para el checkout).
 * @param input Datos del pago.
 */
export async function crearPago(input: {
  solicitud_id?: string | null
  invoice_id?: string | null
  user_id?: string | null
  pasarela_id?: string | null
  referencia_pasarela?: string | null
  monto_usd: number
  moneda?: string
  payload?: Record<string, unknown>
}): Promise<{ data: Pago | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('pagos')
    .insert({
      solicitud_id: input.solicitud_id ?? null,
      invoice_id: input.invoice_id ?? null,
      user_id: input.user_id ?? null,
      pasarela_id: input.pasarela_id ?? null,
      referencia_pasarela: input.referencia_pasarela ?? null,
      monto_usd: Number(input.monto_usd) || 0,
      moneda: input.moneda ?? 'USD',
      payload: input.payload ?? {},
      estado: 'pendiente',
    })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Pago, error: null }
}

/**
 * Confirma o rechaza un pago manualmente (RPC transaccional).
 * Al aprobar, si tiene solicitud pendiente la pasa a 'confirmed'.
 */
export async function confirmarPago(pagoId: string, estado: 'aprobado' | 'rechazado' | 'reembolsado' | 'expirado'): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('confirmar_pago', {
    p_pago_id: pagoId,
    p_estado: estado,
  })
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: Boolean(data), error: null }
}