import { Skeleton } from '@/components/ui/skeleton'

/**
 * Carga de "Mi Perfil": skeleton fiel a la página final
 * (encabezado con navegación, título y tarjeta con avatar + inputs).
 */
export default function ProfileLoading() {
  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="size-10 rounded-full" />
        </header>

        <div className="mt-10">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-9 w-48" />
          <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        </div>

        <section className="mt-8 rounded-3xl border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <Skeleton className="size-24 rounded-3xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-6 h-12 w-full rounded-xl" />
          <div className="mt-8 border-t border-border pt-6">
            <Skeleton className="h-4 w-36" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-11 w-full rounded-xl" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-5 h-11 w-36 rounded-xl" />
          </div>
        </section>
      </div>
    </main>
  )
}