import { requireUser } from '@/lib/auth'
import { getUserRole } from '@/services/auth-server'
import { redirect } from 'next/navigation'
import { getRequestsByUser } from '@/services/requests'
import { getOfficialExchangeRate } from '@/services/exchange-rate'
import { formatBolivars, moneyUsd, formatRate } from '@/lib/currency'
import { ArrowLeft, BadgeDollarSign, ClipboardList } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/user-menu'
import { NotificationsBell } from '@/components/notifications-bell'

/**
 * Dashboard del cliente.
 * Los datos se obtienen a través de /services/requests.
 * Muestra la tasa oficial del día (dolarapi.com) y los montos en Bs + USD.
 * El UserMenu permite acceder a Mi Perfil y cerrar sesión.
 */
export default async function DashboardPage() {
  const { user } = await requireUser()
  if (await getUserRole(user) === 'admin') redirect('/admin')
  const [{ data: orders }, { rate }] = await Promise.all([
    getRequestsByUser(user.id),
    getOfficialExchangeRate(),
  ])

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-3 py-5">
          <a href="/" className="inline-flex items-center gap-2 text-sm"><ArrowLeft size={16} /> ilumaX</a>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <div className="mt-12">
          <p className="font-mono text-xs uppercase tracking-widest text-cyan-600">Mi espacio</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.06em]">Hola, {user.user_metadata?.name ?? user.email?.split('@')[0]}.</h1>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-6">
            <BadgeDollarSign className="text-cyan-500" />
            <h2 className="mt-8 font-medium">Tasa oficial del día</h2>
            <p className="mt-2 text-3xl font-semibold">Bs. {formatRate(rate)}</p>
            <p className="mt-1 text-xs text-slate-500">Fuente: dolarapi.com</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <ClipboardList className="text-cyan-500" />
            <h2 className="mt-8 font-medium">Solicitudes</h2>
            <p className="mt-2 text-3xl font-semibold">{orders?.length ?? 0}</p>
            <p className="text-sm text-slate-500">solicitudes registradas</p>
          </div>
        </div>
        <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-medium">Historial reciente</h2>
          {!orders?.length ? (
            <p className="py-10 text-sm text-slate-500">Todavía no tienes solicitudes. <a href="/" className="text-cyan-600 underline">Explora el catálogo.</a></p>
          ) : (
            <div className="mt-5 space-y-3">
              {orders.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800">
                  <span className="font-mono text-xs">#{order.id.slice(0, 8)}</span>
                  <span className="capitalize text-slate-500">{order.status}</span>
                  <div className="text-right">
                    <strong>{moneyUsd(Number(order.total_usd))}</strong>
                    <p className="text-xs text-slate-400">{formatBolivars(Number(order.total_usd), rate)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}