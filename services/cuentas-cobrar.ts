import { createClient as createServerClient } from '@/lib/supabase/server'
import { calcularFechaVencimiento, estadoConVencimiento } from '@/lib/credit-calculator'

/**
 * Servicio de cuentas por cobrar.
 * Capa única de acceso a Supabase para las tablas cuentas_por_cobrar,
 * abonos e invoices (lectura de saldos). El registro de abonos usa la
 * RPC transaccional registrar_abono. El cálculo de saldo/vencimiento
 * usa la lógica pura de lib/credit-calculator.mjs.
 */

// ---------- Tipos ----------

export type CuentaPorCobrar = {
  id: string
  invoice_id: string
  total_usd: number
  abonado_usd: number
  saldo_usd: number
  estado: 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'cancelada'
  updated_at: string
  invoice_number?: string
  customer_name?: string | null
  customer_email?: string | null
  fecha_vencimiento?: string | null
  cliente_id?: string | null
}

export type Abono = {
  id: string
  invoice_id: string
  monto_usd: number
  metodo: string
  referencia: string | null
  fecha: string
  notas: string | null
}

// ---------- Consultas ----------

/**
 * Obtiene todas las cuentas por cobrar con datos de la factura y el cliente.
 * Combina consultas manualmente (patrón del sistema, sin FK a profiles).
 */
export async function getCuentasPorCobrar(): Promise<{ data: CuentaPorCobrar[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const { data: cuentas, error } = await supabase
    .from('cuentas_por_cobrar')
    .select('*, invoices(invoice_number, customer_name, customer_email, user_id, fecha_vencimiento)')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) return { data: null, error: { message: error.message } }

  const userIds = (cuentas ?? [])
    .map((row: any) => row.invoices?.user_id ?? null)
    .filter(Boolean)
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds)
  const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p.full_name]))

  const normalized = ((cuentas ?? []) as any[]).map((row) => {
    const estadoBase = row.estado as CuentaPorCobrar['estado']
    const fechaVto = (row.invoices as any)?.fecha_vencimiento ?? null
    const diasVencido = fechaVto
      ? Math.ceil((Date.now() - new Date(String(fechaVto).slice(0, 10)).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    const estadoFinal = estadoConVencimiento(estadoBase, diasVencido) as CuentaPorCobrar['estado']

    return {
      id: row.id,
      invoice_id: row.invoice_id,
      total_usd: Number(row.total_usd ?? 0),
      abonado_usd: Number(row.abonado_usd ?? 0),
      saldo_usd: Number(row.saldo_usd ?? 0),
      estado: estadoFinal,
      updated_at: row.updated_at,
      invoice_number: (row.invoices as any)?.invoice_number ?? null,
      customer_name: (row.invoices as any)?.customer_name ?? (row.invoices as any)?.user_id ? (profileMap.get((row.invoices as any)?.user_id) ?? null) : null,
      customer_email: (row.invoices as any)?.customer_email ?? null,
      fecha_vencimiento: fechaVto,
      cliente_id: (row.invoices as any)?.user_id ?? null,
    }
  })

  return { data: normalized, error: null }
}

/**
 * Obtiene los abonos de una factura.
 * @param invoiceId ID de la factura.
 */
export async function getAbonosPorFactura(invoiceId: string): Promise<{ data: Abono[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('abonos')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('fecha', { ascending: true })
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Abono[], error: null }
}

/**
 * Obtiene los datos de crédito de un cliente (perfil).
 * @param userId ID del usuario.
 */
export async function getCreditoCliente(userId: string): Promise<{ data: { limite_credito_usd: number; dias_plazo_default: number; es_credito: boolean } | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('limite_credito_usd, dias_plazo_default, es_credito')
    .eq('id', userId)
    .maybeSingle()
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as any, error: null }
}

/**
 * Crea la cuenta por cobrar automáticamente para una factura emitida
 * (se invoca desde el servicio de facturación si la factura es a crédito).
 * @param invoiceId ID de la factura.
 * @param totalUsd Total de la factura.
 * @param diasPlazo Plazo en días (0 = sin plazo).
 */
export async function crearCuentaPorCobrar(invoiceId: string, totalUsd: number, diasPlazo: number = 0): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const fechaVencimiento = calcularFechaVencimiento(new Date().toISOString(), diasPlazo)

  const { error } = await supabase.from('cuentas_por_cobrar').upsert({
    invoice_id: invoiceId,
    total_usd: Number(totalUsd) || 0,
    abonado_usd: 0,
    saldo_usd: Number(totalUsd) || 0,
    estado: 'pendiente',
  }, { onConflict: 'invoice_id' })

  if (error) return { ok: false, error: { message: error.message } }

  // Actualizar fecha de vencimiento en la factura
  if (fechaVencimiento) {
    await supabase.from('invoices').update({ fecha_vencimiento: fechaVencimiento, dias_plazo: diasPlazo }).eq('id', invoiceId)
  }

  return { ok: true, error: null }
}

// ---------- Mutaciones ----------

/**
 * Registra un abono a una factura (RPC transaccional).
 * @param invoiceId ID de la factura.
 * @param monto Monto en USD.
 * @param metodo Método de pago.
 * @param referencia Referencia opcional.
 * @param notas Notas opcionales.
 */
export async function registrarAbono(
  invoiceId: string,
  monto: number,
  metodo: string = 'transferencia',
  referencia?: string | null,
  notas?: string | null,
): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('registrar_abono', {
    p_invoice_id: invoiceId,
    p_monto: Number(monto),
    p_metodo: metodo,
    p_referencia: referencia ?? null,
    p_notas: notas ?? null,
  })
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: Boolean(data), error: null }
}

/**
 * Actualiza el límite de crédito de un cliente (perfil).
 * @param userId ID del usuario.
 * @param limite Limite en USD.
 * @param diasPlazo Días de plazo por defecto.
 * @param esCredito Si el cliente puede comprar a crédito.
 */
export async function actualizarLimiteCredito(userId: string, limite: number, diasPlazo: number, esCredito: boolean): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('profiles')
    .update({
      limite_credito_usd: Number(limite) || 0,
      dias_plazo_default: Math.floor(Number(diasPlazo) || 0),
      es_credito: Boolean(esCredito),
    })
    .eq('id', userId)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}