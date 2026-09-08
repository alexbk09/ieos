import { Skeleton } from '@/components/ui/skeleton'

/**
 * Carga del dashboard del cliente: replica el layout final
 * (header con navegación, saludo, 2 KPI y tarjeta de historial).
 */
export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-3 py-5">
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="size-10 rounded-full" />
          </div>
        </header>

        <div className="mt-12">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-10 w-72 max-w-full" />
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-border bg-card p-6">
              <Skeleton className="size-9 rounded-xl" />
              <Skeleton className="mt-8 h-4 w-32" />
              <Skeleton className="mt-2 h-8 w-28" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
          ))}
        </div>

        <section className="mt-10 rounded-3xl border border-border bg-card p-6">
          <Skeleton className="h-5 w-36" />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}