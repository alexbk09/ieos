import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { getAdminDashboardData } from '@/services/requests'
import { getOfficialExchangeRate } from '@/services/exchange-rate'
import { LOW_STOCK_ALERT } from '@/lib/constants'
import { formatBolivars, moneyUsd, formatRate } from '@/lib/currency'
import { AlertTriangle, BadgeDollarSign, ClipboardList, Package, TrendingUp, Users } from 'lucide-react'

/**
 * Dashboard principal de administración.
 * La obtención de datos vive en /services/requests.
 * Muestra la tasa oficial del día (dolarapi.com) y precios en Bs + USD.
 */
export default async function AdminPage() {
  await requireAdmin()
  const [[{ data: products }, { data: requests }, { data: profiles }], { rate }] = await Promise.all([
    getAdminDashboardData(),
    getOfficialExchangeRate(),
  ])

  const revenue = requests?.reduce((sum, item) => sum + Number(item.total_usd), 0) ?? 0
  const lowStock = products?.filter((item) => item.stock < LOW_STOCK_ALERT).length ?? 0
  const stats = [
    [TrendingUp, 'Ventas estimadas', `${moneyUsd(revenue)}`],
    [ClipboardList, 'Solicitudes', String(requests?.length ?? 0)],
    [Package, 'Productos', String(products?.length ?? 0)],
    [Users, 'Usuarios', String(profiles?.length ?? 0)],
  ] as const

  return (
    <AdminShell>
      <AdminPageHeader eyebrow="Control center" title="Visión general" description="Todo lo importante de ilumaX, en un solo lugar." />
      <div className="p-5 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-5">
            <BadgeDollarSign size={20} className="text-cyan-600" />
            <p className="mt-7 text-sm text-muted-foreground">Tasa oficial del día</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">Bs. {formatRate(rate)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Fuente: dolarapi.com</p>
          </div>
          {stats.map(([Icon, label, value]) => (
            <div key={label} className="rounded-3xl border border-border bg-card p-5">
              <Icon size={20} className="text-cyan-600" />
              <p className="mt-7 text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">Solicitudes recientes</h2>
                <p className="mt-1 text-sm text-muted-foreground">Seguimiento de pedidos de clientes</p>
              </div>
              <a href="/admin/solicitudes" className="text-sm text-cyan-600">Ver todas</a>
            </div>
            <div className="mt-5 space-y-3">
              {requests?.slice(0, 5).map((request) => (
                <a href="/admin/solicitudes" key={request.id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 p-4 text-sm transition hover:bg-muted">
                  <span className="font-mono text-xs">#{request.id.slice(0, 8).toUpperCase()}</span>
                  <span className="text-muted-foreground">{request.status}</span>
                  <div className="text-right">
                    <strong>{moneyUsd(Number(request.total_usd))}</strong>
                    <p className="text-xs font-normal text-muted-foreground">{formatBolivars(Number(request.total_usd), rate)}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
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
        </div>
      </div>
    </AdminShell>
  )
}