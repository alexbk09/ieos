import { createClient as createServerClient } from '@/lib/supabase/server'
import { calcularMargenNetoPorProducto, resumirMargenTotal } from '@/lib/margin-net-calculator'
import { IVA_RATE } from '@/lib/constants'

/**
 * Servicio de reporte de margen neto.
 * Capa única de acceso a Supabase para generar el reporte de ganancia
 * real: cruza solicitudes completadas (ítems vendidos) con el costo
 * inicial de cada producto. La lógica de cálculo vive en
 * lib/margin-net-calculator.mjs (lógica pura + tests).
 */

export type RenglonMargenReporte = {
  product_id: string
  product_name: string
  cantidad_vendida: number
  total_vendido_usd: number
  costo_inicial_usd: number
  ingreso_bruto_usd: number
  ingreso_neto_usd: number
  costo_total_usd: number
  ganancia_usd: number
  porcentaje: number
}

export type ResumenReporteMargen = {
  ingreso_neto_usd: number
  costo_total_usd: number
  ganancia_usd: number
  porcentaje: number
}

/**
 * Genera el reporte de margen neto de un período.
 * Cruza los ítems de solicitudes completadas con el costo inicial
 * de cada producto (campo costo_inicial de products).
 * @param periodoInicio Fecha ISO YYYY-MM-DD.
 * @param periodoFin Fecha ISO YYYY-MM-DD.
 * @returns Renglones por producto + resumen global.
 */
export async function getReporteMargen(periodoInicio: string, periodoFin: string): Promise<{
  data: { renglones: RenglonMargenReporte[]; resumen: ResumenReporteMargen } | null
  error: { message: string } | null
}> {
  const supabase = await createServerClient()

  if (!periodoInicio || !periodoFin) {
    return { data: null, error: { message: 'Debes indicar el período del reporte.' } }
  }

  // 1) Ítems de solicitudes completadas en el período.
  const { data: solicitudes } = await supabase
    .from('solicitudes')
    .select('id, created_at')
    .eq('status', 'completed')
    .gte('created_at', `${periodoInicio}T00:00:00`)
    .lte('created_at', `${periodoFin}T23:59:59`)
    .limit(500)

  const solicitudIds = (solicitudes ?? []).map((s) => s.id)
  if (solicitudIds.length === 0) {
    return { data: { renglones: [], resumen: { ingreso_neto_usd: 0, costo_total_usd: 0, ganancia_usd: 0, porcentaje: 0 } }, error: null }
  }

  // 2) Ítems de esas solicitudes.
  const { data: items } = await supabase
    .from('solicitud_items')
    .select('product_id, product_name, quantity, unit_price_usd')
    .in('solicitud_id', solicitudIds)
    .limit(2000)

  // 3) Costo inicial de los productos involucrados.
  const productIds = (items ?? []).map((i) => i.product_id).filter(Boolean)
  const { data: productos } = productIds.length > 0
    ? await supabase.from('products').select('id, name, costo_inicial').in('id', productIds)
    : { data: [] as any[] }
  const costoMap = new Map((productos ?? []).map((p: any) => [p.id, Number(p.costo_inicial) || 0]))

  // 4) Agrupa ventas por producto.
  const porProducto = new Map<string, { cantidad: number; total: number }>()
  for (const item of (items ?? []) as any[]) {
    const entry = porProducto.get(item.product_id) ?? { cantidad: 0, total: 0 }
    entry.cantidad += Number(item.quantity) || 0
    entry.total += Number(item.unit_price_usd) * (Number(item.quantity) || 0)
    porProducto.set(item.product_id, entry)
  }

  // 5) Calcula margen por producto con la lógica pura.
  const renglones: RenglonMargenReporte[] = []
  for (const [productId, venta] of porProducto) {
    const costoInicial = costoMap.get(productId) ?? 0
    const nombre = (items ?? []).find((i: any) => i.product_id === productId)?.product_name ?? 'Producto'
    const calculado = calcularMargenNetoPorProducto({ total_vendido_usd: venta.total, cantidad_vendida: venta.cantidad }, costoInicial, {
      tasaIva: IVA_RATE * 100,
      preciosIncluyenIva: true,
      otrosCostosUsd: 0,
    })
    renglones.push({
      product_id: productId,
      product_name: nombre,
      cantidad_vendida: venta.cantidad,
      total_vendido_usd: Math.round(venta.total * 100) / 100,
      costo_inicial_usd: costoInicial,
      ...calculado,
    })
  }

  // Ordenar por ganancia descendente.
  renglones.sort((a, b) => b.ganancia_usd - a.ganancia_usd)

  const resumen = resumirMargenTotal(renglones as any)

  return { data: { renglones, resumen }, error: null }
}