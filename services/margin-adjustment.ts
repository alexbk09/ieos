import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio del módulo "Ajuste de Margen y Control de Pérdidas".
 * Capa única de acceso a Supabase.
 * Los componentes NUNCA deben llamar a supabase.from() directamente.
 * La actualización masiva se ejecuta mediante la RPC aplicar_ajuste_precios
 * (una sola transacción en PostgreSQL, sin loop de updates individuales).
 */

// ---------- Tipos ----------
export type ProductForAdjustment = {
  id: string
  name: string
  costo_inicial: number
  price_usd: number
}

export type HistoryProduct = {
  product_id: string
  nombre: string
  costo_inicial_anterior: number
  precio_venta_anterior: number
}

export type AdjustmentHistoryEntry = {
  id: string
  fecha_registro: string
  tasa_calculada: number
  porcentaje_aplicado: number
  productos: HistoryProduct[]
  created_by: string | null
}

export type ApplyAdjustmentResult = {
  historial_id: string
  total_actualizados: number
  tasa_calculada: number
  porcentaje_aplicado: number
  productos_anteriores: HistoryProduct[]
}

// ---------- Consultas ----------

/**
 * Obtiene todos los productos con su costo base (costo_inicial)
 * y precio de venta actual (price_usd) para previsualizar el ajuste.
 * @returns Lista de productos o null si hay error.
 */
export async function getProductsForAdjustment(): Promise<{
  data: ProductForAdjustment[] | null
  error: { message: string } | null
}> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, costo_inicial, price_usd')
    .order('name')
  if (error) return { data: null, error: { message: error.message } }
  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      costo_inicial: Number(row.costo_inicial ?? 0),
      price_usd: Number(row.price_usd ?? 0),
    })),
    error: null,
  }
}

/**
 * Obtiene el historial de ajustes de precios aplicados (auditoría).
 * Ordenado del más reciente al más antiguo.
 * @returns Lista de registros de historial o null si hay error.
 */
export async function getAdjustmentHistory(): Promise<{
  data: AdjustmentHistoryEntry[] | null
  error: { message: string } | null
}> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('historial_ajustes_precios')
    .select('*')
    .order('fecha_registro', { ascending: false })
    .limit(50)
  if (error) return { data: null, error: { message: error.message } }
  return {
    data: (data ?? []).map((row) => ({
      id: row.id,
      fecha_registro: row.fecha_registro,
      tasa_calculada: Number(row.tasa_calculada),
      porcentaje_aplicado: Number(row.porcentaje_aplicado),
      productos: Array.isArray(row.productos) ? row.productos : [],
      created_by: row.created_by ?? null,
    })),
    error: null,
  }
}

/**
 * Obtiene la última tasa calculada usada en un ajuste previo (auditoría).
 * Sirve como base para calcular la pérdida por el aumento de la moneda:
 * la pérdida se compara contra esta tasa y no contra la tasa actual.
 * Si no hay historial, devuelve null (la app usará la tasa actual como base).
 * @returns Última tasa usada o null si no hay historial.
 */
export async function getLastAppliedRate(): Promise<{
  data: { tasa_calculada: number; fecha_registro: string } | null
  error: { message: string } | null
}> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('historial_ajustes_precios')
    .select('tasa_calculada, fecha_registro')
    .order('fecha_registro', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { data: null, error: { message: error.message } }
  if (!data) return { data: null, error: null }
  return {
    data: { tasa_calculada: Number(data.tasa_calculada), fecha_registro: data.fecha_registro },
    error: null,
  }
}

// ---------- Mutaciones ----------

/**
 * Aplica un ajuste masivo de precios a los productos seleccionados.
 * Ejecuta la RPC public.aplicar_ajuste_precios que realiza la
 * actualización en UNA sola transacción y registra el historial
 * con los precios anteriores para auditoría.
 * @param productIds IDs de los productos a ajustar.
 * @param porcentaje Porcentaje de incremento (ej: 5.5 = 5.5%).
 * @param tasa Nueva tasa oficial calculada.
 * @returns Resultado con historial_id y total de actualizados.
 */
export async function applyPriceAdjustment(
  productIds: string[],
  porcentaje: number,
  tasa: number,
): Promise<{ data: ApplyAdjustmentResult | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('aplicar_ajuste_precios', {
    p_product_ids: productIds,
    p_porcentaje: porcentaje,
    p_tasa: tasa,
  })
  if (error) return { data: null, error: { message: error.message } }
  return {
    data: data as ApplyAdjustmentResult,
    error: null,
  }
}