import { Skeleton } from '@/components/ui/skeleton'

/**
 * Carga genérica de las páginas internas (admin, cuenta).
 * Mantiene feedback visual premium mientras se resuelven los datos en servidor.
 */
export default function InternalLoading() {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-7xl space-y-6 px-5 py-10 lg:px-8">
        <Skeleton className="h-4 w-40 rounded-full" />
        <Skeleton className="h-8 w-72 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  )
}
