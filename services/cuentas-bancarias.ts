import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de cuentas bancarias.
 * Capa única de acceso a Supabase para la tabla cuentas_bancarias.
 * Permite gestionar qué cuenta agregar, activar o asociar a los pagos.
 */

export type CuentaBancaria = {
  id: string
  banco_id: string | null
  nombre_banco: string
  numero_cuenta: string
  tipo_cuenta: 'corriente' | 'ahorro' | 'pago_movil'
  titular: string | null
  documento_titular: string | null
  moneda: 'USD' | 'VES' | 'EUR'
  telefono_pago_movil: string | null
  cedula_pago_movil: string | null
  banco_pago_movil: string | null
  activa: boolean
  es_principal: boolean
  created_at: string
  banco_nombre?: string | null
}

/** Obtiene todas las cuentas bancarias con el nombre del banco asociado. */
export async function getCuentasBancarias(): Promise<{ data: CuentaBancaria[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('cuentas_bancarias')
    .select('*, banco_configuraciones(nombre_banco)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return { data: null, error: { message: error.message } }

  const normalized = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    banco_id: row.banco_id,
    nombre_banco: row.nombre_banco,
    numero_cuenta: row.numero_cuenta,
    tipo_cuenta: row.tipo_cuenta,
    titular: row.titular,
    documento_titular: row.documento_titular,
    moneda: row.moneda,
    telefono_pago_movil: row.telefono_pago_movil,
    cedula_pago_movil: row.cedula_pago_movil,
    banco_pago_movil: row.banco_pago_movil,
    activa: row.activa,
    es_principal: row.es_principal,
    created_at: row.created_at,
    banco_nombre: (row.banco_configuraciones as any)?.nombre_banco ?? null,
  }))

  return { data: normalized, error: null }
}

/** Crea una cuenta bancaria nueva. Si es la primera, queda como principal. */
export async function createCuentaBancaria(input: Partial<CuentaBancaria>): Promise<{ data: CuentaBancaria | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const numero = input.numero_cuenta?.trim()
  if (!numero) return { data: null, error: { message: 'El número de cuenta es obligatorio.' } }
  const nombreBanco = input.nombre_banco?.trim()
  if (!nombreBanco) return { data: null, error: { message: 'El nombre del banco es obligatorio.' } }

  const { count } = await supabase.from('cuentas_bancarias').select('*', { count: 'exact', head: true })
  const esPrincipal = (count ?? 0) === 0 || Boolean(input.es_principal)

  if (esPrincipal) {
    await supabase.from('cuentas_bancarias').update({ es_principal: false }).neq('id', '00000000-0000-0000-0000-000000000000')
  }

  const { data, error } = await supabase
    .from('cuentas_bancarias')
    .insert({
      banco_id: input.banco_id ?? null,
      nombre_banco: nombreBanco,
      numero_cuenta: numero,
      tipo_cuenta: input.tipo_cuenta ?? 'corriente',
      titular: input.titular?.trim() || null,
      documento_titular: input.documento_titular?.trim() || null,
      moneda: input.moneda ?? 'USD',
      telefono_pago_movil: input.telefono_pago_movil?.trim() || null,
      cedula_pago_movil: input.cedula_pago_movil?.trim() || null,
      banco_pago_movil: input.banco_pago_movil?.trim() || null,
      activa: input.activa ?? true,
      es_principal: esPrincipal,
    })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as CuentaBancaria, error: null }
}

/** Actualiza una cuenta bancaria. */
export async function updateCuentaBancaria(id: string, input: Partial<CuentaBancaria>): Promise<{ data: CuentaBancaria | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  // Si se marca como principal, quitar el flag de las demás.
  if (input.es_principal) {
    await supabase.from('cuentas_bancarias').update({ es_principal: false }).neq('id', id)
  }

  const update: Record<string, unknown> = {}
  if (input.banco_id !== undefined) update.banco_id = input.banco_id
  if (input.nombre_banco !== undefined) update.nombre_banco = input.nombre_banco.trim()
  if (input.numero_cuenta !== undefined) update.numero_cuenta = input.numero_cuenta.trim()
  if (input.tipo_cuenta !== undefined) update.tipo_cuenta = input.tipo_cuenta
  if (input.titular !== undefined) update.titular = input.titular?.trim() || null
  if (input.documento_titular !== undefined) update.documento_titular = input.documento_titular?.trim() || null
  if (input.moneda !== undefined) update.moneda = input.moneda
  if (input.telefono_pago_movil !== undefined) update.telefono_pago_movil = input.telefono_pago_movil?.trim() || null
  if (input.cedula_pago_movil !== undefined) update.cedula_pago_movil = input.cedula_pago_movil?.trim() || null
  if (input.banco_pago_movil !== undefined) update.banco_pago_movil = input.banco_pago_movil?.trim() || null
  if (input.activa !== undefined) update.activa = input.activa
  if (input.es_principal !== undefined) update.es_principal = input.es_principal

  const { data, error } = await supabase.from('cuentas_bancarias').update(update).eq('id', id).select('*').single()
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as CuentaBancaria, error: null }
}

/** Elimina una cuenta bancaria. */
export async function deleteCuentaBancaria(id: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('cuentas_bancarias').delete().eq('id', id)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}