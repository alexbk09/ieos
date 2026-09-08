import { cn } from '@/lib/utils'

/**
 * Primitivo de skeleton reutilizable con efecto shimmer moderno.
 * El shimmer se aplica automáticamente a toda pieza de carga y
 * respeta dark mode usando variables de tema. Se debe usar SOLO
 * durante estados de carga; nunca reemplaza contenido real.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer animate-pulse rounded-xl bg-muted', className)} />
}

/** Línea de texto simulada (ancho recibido por className). */
export function SkeletonText({ className }: { className?: string }) {
  return <Skeleton className={cn('h-3.5 w-full', className)} />
}

/** Fila esqueleto para tablas (mismo alto de fila y bordes del diseño actual). */
export function TableRowSkeleton({ cells = 4 }: { cells?: number }) {
  return (
    <tr className="border-b border-border/70">
      {Array.from({ length: cells }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <Skeleton className={cn('h-4', i === 0 ? 'w-3/4' : 'w-full')} />
        </td>
      ))}
    </tr>
  )
}

/** Header esqueleto para páginas internas (eyebrow + título + descripción). */
export function PageHeaderSkeleton() {
  return (
    <header className="flex flex-col gap-5 border-b border-border px-5 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-8">
      <div className="max-w-xl space-y-3">
        <Skeleton className="h-3 w-32 rounded-full" />
        <Skeleton className="h-8 w-56 sm:h-9" />
        <SkeletonText className="max-w-md" />
      </div>
      <Skeleton className="h-11 w-40 rounded-xl" />
    </header>
  )
}

/** Card esqueleto para KPI/resúmenes del dashboard. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="size-10 rounded-2xl" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <SkeletonText className="mt-8 max-w-[7rem]" />
      <Skeleton className="mt-2 h-3.5 w-24" />
    </div>
  )
}

/**
 * Layout esqueleto típico de una página admin:
 * header + cuerpo. Fácil de componer con variantes extra
 * (fill para rellenar el área principal).
 */
export function AdminPageSkeleton() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="space-y-5 p-5 sm:p-8">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    </>
  )
}

/** Grid de skeletons para productos (misma estructura que la cuadrícula real). */
export function ProductGridSkeleton({ count = 6, columns = 'sm:grid-cols-2 xl:grid-cols-3' }: { count?: number; columns?: string }) {
  return (
    <div className={`grid gap-5 ${columns}`}>
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Skeleton de card de producto: replica la estructura visual de ProductCard
 * (imagen 1.1:1, badge de stock, título, descripción, precio) para evitar
 * saltos de layout (CLS) mientras cargan los productos en el catálogo.
 */
export function ProductCardSkeleton() {
  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card">
      {/* Imagen */}
      <div className="relative block w-full overflow-hidden bg-muted">
        <Skeleton className="aspect-[1.1] w-full rounded-none" />
        <Skeleton className="absolute left-4 top-4 h-6 w-24 rounded-full" />
      </div>

      {/* Contenido */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="size-9 shrink-0 rounded-full" />
        </div>

        <Skeleton className="mt-3 h-3 w-full" />
        <Skeleton className="mt-2 h-3 w-2/3" />

        <div className="mt-5 flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    </article>
  )
}