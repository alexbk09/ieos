import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { getAdminDashboardData } from '@/services/requests'
import { getExchangeRates } from '@/services/exchange-rate'
import { LOW_STOCK_ALERT } from '@/lib/constants'
import { formatRate } from '@/lib/currency'
import { rateSpread } from '@/lib/rate-spread-calculator'
import { AlertTriangle, ArrowLeftRight, BadgeDollarSign } from 'lucide-react'

/**
 * Dashboard admin simplificado.
 * Solo muestra las tasas de cambio y el estado del inventario,
 * ya que el sistema se utiliza únicamente para productos.
 *
 * NOTA: Las secciones de métricas/KPIs, ventas, estado de solicitudes
 * y productos más vendidos están ocultas (comentadas). Para volver a
 * mostrarlas, descomenta los bloques correspondientes y sus imports.
 */
export default async function AdminPage() {
  await requireAdmin()
  const [[{ data: products }], { official, parallel }] = await Promise.all([
    getAdminDashboardData(),
    getExchangeRates(),
  ])

  const { spread } = rateSpread(official.rate, parallel.rate)
  const lowStock = products?.filter((p) => p.stock < LOW_STOCK_ALERT).length ?? 0

  return (
    <AdminShell>
      <AdminPageHeader eyebrow="Control center" title="Visión general" description="Tasas de cambio y estado del inventario." />
      <div className="p-5 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-5">
            <BadgeDollarSign size={20} className="text-cyan-600" />
            <p className="mt-7 text-sm text-muted-foreground">Tasa oficial del día</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">Bs. {formatRate(official.rate)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Fuente: dolarapi.com</p>
          </div>
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5">
            <ArrowLeftRight size={20} className="text-amber-600" />
            <p className="mt-7 text-sm text-muted-foreground">Tasa paralela del día</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">Bs. {formatRate(parallel.rate)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Diferencia: Bs. {spread !== null ? spread.toFixed(2) : '—'}</p>
          </div>
        </div>

        {/* OCULTO: Métricas/KPIs de ventas (solo productos en uso).
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map(([Icon, label, value, sub]) => (
            <div key={label} className="rounded-3xl border border-border bg-card p-5"><Icon size={20} className="text-cyan-600" /><p className="mt-7 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{sub}</p></div>
          ))}
        </div>
        */}

        {/* OCULTO: Gráficos de ventas y estado de solicitudes.
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
        */}

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className={lowStock ? 'text-amber-500' : 'text-cyan-600'} size={20} />
              <div>
                <h2 className="font-medium">Inventario</h2>
                <p className="mt-1 text-sm text-muted-foreground">Estado de existencias</p>
              </div>
            </div>
            <p className="mt-8 text-5xl font-semibold">{lowStock}</p>
            <p className="mt-2 text-sm text-muted-foreground">productos con stock bajo</p>
            <a href="/admin/productos" className="mt-6 inline-flex rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">Gestionar inventario</a>
          </section>

          {/* OCULTO: Productos más vendidos (solo productos en uso).
          <section className="rounded-3xl border border-border bg-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between"><div><h2 className="font-medium">Productos más vendidos</h2><p className="mt-1 text-sm text-muted-foreground">Top 5 por unidades solicitadas</p></div><a href="/admin/productos" className="text-sm text-cyan-600">Ver todos</a></div>
            <div className="mt-5 space-y-3">
              {topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4 text-sm transition hover:bg-muted"><span className="font-mono text-xs text-muted-foreground">#{i + 1}</span><span className="truncate font-medium">{p.name}</span><span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{p.qty} uds</span></div>
              ))}
              {topProducts.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay ventas registradas.</p>}
            </div>
          </section>
          */}
        </div>
      </div>
    </AdminShell>
  )
}