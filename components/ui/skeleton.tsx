'use client'

import { cn } from '@/lib/utils'

/**
 * Primitivo de skeleton reutilizable.
 * Puro CSS (animate-pulse): ligero, sin JS adicional y con soporte de modo oscuro.
 * Usar SOLO durante estados de carga; nunca reemplaza contenido real.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} />
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