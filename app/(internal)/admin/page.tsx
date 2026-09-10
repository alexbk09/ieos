import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { getAdminDashboardData } from '@/services/requests'
import { getAdminDashboardExtendedData } from '@/services/dashboard'
import { getExchangeRates } from '@/services/exchange-rate'
import { LOW_STOCK_ALERT } from '@/lib/constants'
import { moneyUsd, formatRate } from '@/lib/currency'
import { rateSpread } from '@/lib/rate-spread-calculator'
import { STATUS_COLORS, SalesBarChart, StatusDonutChart } from '@/components/admin-dashboard-charts'
import { AlertTriangle, ArrowLeftRight, BadgeDollarSign, Boxes, CheckCircle2, ClipboardList, Clock, FileText, Landmark, ShoppingBag, TicketCheck, Truck, Users, Wallet, Warehouse } from 'lucide-react'

/** Últimos 7 días con etiqueta corta y clave ISO. */
function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return { label: d.toLocaleDateString('es-VE', { weekday: 'short' }), key: d.toISOString().slice(0, 10) }
  })
}

/** Dashboard admin con KPIs, tasas y gráficos. */
export default async function AdminPage() {
  await requireAdmin()
  const [[{ data: products }, { data: requests }, { data: profiles }], { official, parallel }, extended] = await Promise.all([
    getAdminDashboardData(),
    getExchangeRates(),
    getAdminDashboardExtendedData(),
  ])

  const { spread } = rateSpread(official.rate, parallel.rate)
  const extendedData = extended.data
  const reqs = requests ?? []
  // Solo las solicitudes completadas generan ingresos, ventas y unidades vendidas.
  const completedReqs = reqs.filter((r) => r.status === 'completed')
  const revenue = completedReqs.reduce((sum, r) => sum + Number(r.total_usd), 0)
  const completedRevenue = completedReqs.reduce((sum, r) => sum + Number(r.total_usd), 0)
  const pendingCount = reqs.filter((r) => r.status === 'pending').length
  const lowStock = products?.filter((p) => p.stock < LOW_STOCK_ALERT).length ?? 0
  const unitSales = completedReqs.flatMap((r) => r.solicitud_items ?? []).reduce((sum, it) => sum + Number(it.quantity), 0)

  /** Ventas diarias de los últimos 7 días (solo completadas). */
  const byDay = last7Days().map(({ label, key }) => ({ label, value: completedReqs.filter((r) => r.created_at?.slice(0, 10) === key).reduce((s, r) => s + Number(r.total_usd), 0) }))

  /** Distribución de solicitudes por estado. */
  const statusData = Object.entries(STATUS_COLORS).map(([status, color]) => ({ label: status.charAt(0).toUpperCase() + status.slice(1), value: reqs.filter((r) => r.status === status).length, color }))

  /** Top 5 productos por unidades vendidas (solo completadas). */
  const topProducts = Object.values(completedReqs.flatMap((r) => r.solicitud_items ?? []).reduce<Record<string, { name: string; qty: number }>>((acc, it) => {
    if (!acc[it.product_name]) acc[it.product_name] = { name: it.product_name, qty: 0 }
    acc[it.product_name].qty += Number(it.quantity)
    return acc
  }, {})).sort((a, b) => b.qty - a.qty).slice(0, 5)

  // Ticket promedio por pedido completado.
  const averageTicket = completedReqs.length > 0 ? revenue / completedReqs.length : 0

  const stats = [
    [Wallet, 'Ingresos', moneyUsd(revenue), 'Solo pedidos completados'],
    [CheckCircle2, 'Completadas', moneyUsd(completedRevenue), 'Pedidos finalizados'],
    [ShoppingBag, 'Unidades vendidas', String(unitSales), 'Solo pedidos completados'],
    [TicketCheck, 'Ticket promedio', moneyUsd(averageTicket), 'Por pedido completado'],
    [ClipboardList, 'Solicitudes', String(reqs.length), 'Pedidos registrados'],
  ] as const

  // KPIs financieros y logísticos extendidos.
  const extendedStats = [
    [FileText, 'Facturas emitidas', String(extendedData?.facturasEmitidas ?? 0), `${extendedData?.facturasAnuladas ?? 0} anuladas`],
    [Landmark, 'Total facturado', moneyUsd(extendedData?.totalFacturadoUsd ?? 0), `IVA: ${moneyUsd(extendedData?.ivaGeneradoUsd ?? 0)}`],
    [Users, 'Clientes', String(profiles?.length ?? 0), 'Perfiles registrados'],
    [Warehouse, 'Valor inventario', moneyUsd(extendedData?.valorInventarioUsd ?? 0), `${extendedData?.productosAgotados ?? 0} agotados`],
    [Boxes, 'Productos', String(extendedData?.productosTotales ?? 0), `${extendedData?.productosActivos ?? 0} en catálogo`],
    [Truck, 'Despachos activos', String(extendedData?.despachosActivos ?? 0), 'Programados o en ruta'],
    [Wallet, 'CxC pendiente', moneyUsd(extendedData?.cuentasPorCobrarSaldo ?? 0), `${extendedData?.cuentasVencidas ?? 0} vencidas`],
    [Clock, 'Cotizaciones activas', String(extendedData?.cotizacionesActivas ?? 0), `${extendedData?.cotizacionesConvertidas ?? 0} convertidas`],
  ] as const

  return (
<>
      <AdminPageHeader eyebrow="Control center" title="Visión general" description="Métricas, tasas y estado del negocio en tiempo real." />
      <div className="p-5 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-5"><BadgeDollarSign size={20} className="text-cyan-600" /><p className="mt-7 text-sm text-muted-foreground">Tasa oficial del día</p><p className="mt-1 text-3xl font-semibold tracking-tight">Bs. {formatRate(official.rate)}</p><p className="mt-1 text-xs text-muted-foreground">Fuente: dolarapi.com</p></div>
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5"><ArrowLeftRight size={20} className="text-amber-600" /><p className="mt-7 text-sm text-muted-foreground">Tasa paralela del día</p><p className="mt-1 text-3xl font-semibold tracking-tight">Bs. {formatRate(parallel.rate)}</p><p className="mt-1 text-xs text-muted-foreground">Diferencia: Bs. {spread !== null ? spread.toFixed(2) : '—'}</p></div>
          {stats.map(([Icon, label, value, sub]) => (
            <div key={label} className="rounded-3xl border border-border bg-card p-5"><Icon size={20} className="text-cyan-600" /><p className="mt-7 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{sub}</p></div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Inteligencia de negocio</h2>
              <p className="mt-1 text-sm text-muted-foreground">Finanzas, logística, inventario y ventas en un vistazo.</p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Pendientes: {pendingCount}</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {extendedStats.map(([Icon, label, value, sub]) => (
              <div key={label} className="rounded-2xl bg-muted/60 p-4 transition hover:bg-muted"><div className="flex items-center gap-2"><Icon size={18} className="text-cyan-600" /><p className="text-xs text-muted-foreground">{label}</p></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{sub}</p></div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">Ventas (últimos 7 días)</h2><p className="mt-1 text-sm text-muted-foreground">Facturación diaria en USD</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Total: {moneyUsd(byDay.reduce((s, d) => s + d.value, 0))}</span></div>
            <div className="mt-6"><SalesBarChart data={byDay} /></div>
          </section>
          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="font-medium">Estado de solicitudes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Distribución por estado</p>
            <div className="mt-6"><StatusDonutChart data={statusData} /></div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center gap-3"><AlertTriangle className={lowStock ? 'text-amber-500' : 'text-cyan-600'} size={20} /><div><h2 className="font-medium">Inventario</h2><p className="mt-1 text-sm text-muted-foreground">Estado de existencias</p></div></div>
            <p className="mt-8 text-5xl font-semibold">{lowStock}</p>
            <p className="mt-2 text-sm text-muted-foreground">productos con stock bajo</p>
            <a href="/admin/productos" className="mt-6 inline-flex rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">Gestionar inventario</a>
          </section>
          <section className="rounded-3xl border border-border bg-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between"><div><h2 className="font-medium">Productos más vendidos</h2><p className="mt-1 text-sm text-muted-foreground">Top 5 por unidades solicitadas</p></div><a href="/admin/productos" className="text-sm text-cyan-600">Ver todos</a></div>
            <div className="mt-5 space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4 text-sm transition hover:bg-muted"><span className="font-mono text-xs text-muted-foreground">#{i + 1}</span><span className="truncate font-medium">{p.name}</span><span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{p.qty} uds</span></div>
              ))}
              {topProducts.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay ventas registradas.</p>}
            </div>
          </section>
        </div>
      </div>
  
</>)
}