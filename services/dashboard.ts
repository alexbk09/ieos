import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de métricas extendidas del dashboard admin.
 * Capa única de acceso a Supabase para los KPIs adicionales:
 * finanzas (facturas, IVA, CxC), logística (despachos) e inventario.
 * Los componentes NUNCA llaman a supabase.from() directamente.
 */

export type DashboardExtendedData = {
  despachosActivos: number
  cuentasPorCobrarSaldo: number
  cuentasVencidas: number
  facturasEmitidas: number
  facturasAnuladas: number
  totalFacturadoUsd: number
  ivaGeneradoUsd: number
  cotizacionesActivas: number
  cotizacionesConvertidas: number
  valorInventarioUsd: number
  productosTotales: number
  productosActivos: number
  productosAgotados: number
}

/**
 * Obtiene métricas extendidas para el dashboard admin.
 * Consultas ligeras en paralelo con solo las columnas necesarias.
 */
export async function getAdminDashboardExtendedData(): Promise<{ data: DashboardExtendedData; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const [despachosRes, cxcRes, invoicesRes, quotesRes, productsRes] = await Promise.all([
    supabase.from('despachos').select('estado').in('estado', ['programado', 'en_ruta']),
    supabase.from('cuentas_por_cobrar').select('saldo_usd, estado').in('estado', ['pendiente', 'parcial', 'vencida']),
    supabase.from('invoices').select('status, total, iva_amount'),
    supabase.from('quotes').select('status').in('status', ['draft', 'sent', 'accepted', 'converted']),
    supabase.from('products').select('stock, stock_grams, pricing_type, costo_inicial, is_available'),
  ])

  // Despachos activos en logística.
  const despachosActivos = (despachosRes.data ?? []).length

  // Cuentas por cobrar: saldo pendiente total y vencidas.
  const cxcRows = (cxcRes.data ?? []) as Array<{ saldo_usd: number; estado: string }>
  const cuentasPorCobrarSaldo = cxcRows.reduce((sum, row) => sum + Number(row.saldo_usd ?? 0), 0)
  const cuentasVencidas = cxcRows.filter((row) => row.estado === 'vencida').length

  // Facturas: emitidas, anuladas, total facturado e IVA.
  const facturas = (invoicesRes.data ?? []) as Array<{ status: string; total: number; iva_amount: number }>
  const emitidas = facturas.filter((row) => row.status === 'issued')
  const facturasEmitidas = emitidas.length
  const facturasAnuladas = facturas.filter((row) => row.status === 'cancelled').length
  const totalFacturadoUsd = emitidas.reduce((sum, row) => sum + Number(row.total ?? 0), 0)
  const ivaGeneradoUsd = emitidas.reduce((sum, row) => sum + Number(row.iva_amount ?? 0), 0)

  // Cotizaciones activas vs convertidas.
  const cotizaciones = (quotesRes.data ?? []) as Array<{ status: string }>
  const cotizacionesActivas = cotizaciones.filter((row) => ['draft', 'sent', 'accepted'].includes(row.status)).length
  const cotizacionesConvertidas = cotizaciones.filter((row) => row.status === 'converted').length

  // Inventario: valor a costo inicial + conteos de productos.
  const productos = (productsRes.data ?? []) as Array<{
    stock: number
    stock_grams: number
    pricing_type: string
    costo_inicial: number
    is_available: boolean
  }>
  const valorInventarioUsd = productos.reduce((sum, row) => {
    // Productos por peso: el costo inicial es por kilogramo (stock en gramos).
    if (row.pricing_type === 'weight') {
      return sum + (Number(row.stock_grams ?? 0) / 1000) * Number(row.costo_inicial ?? 0)
    }
    return sum + Number(row.stock ?? 0) * Number(row.costo_inicial ?? 0)
  }, 0)
  const productosTotales = productos.length
  const productosActivos = productos.filter((row) => row.is_available !== false).length
  const productosAgotados = productos.filter(
    (row) => (row.pricing_type === 'weight' ? Number(row.stock_grams ?? 0) <= 0 : Number(row.stock ?? 0) <= 0),
  ).length

  return {
    data: {
      despachosActivos,
      cuentasPorCobrarSaldo,
      cuentasVencidas,
      facturasEmitidas,
      facturasAnuladas,
      totalFacturadoUsd,
      ivaGeneradoUsd,
      cotizacionesActivas,
      cotizacionesConvertidas,
      valorInventarioUsd,
      productosTotales,
      productosActivos,
      productosAgotados,
    },
    error: null,
  }
}
