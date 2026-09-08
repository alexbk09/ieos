import { Skeleton, ProductGridSkeleton } from '@/components/ui/skeleton'

/**
 * Carga sutil de la portada.
 * Fondo claro (no invasivo) con tres bloques esqueletos: un encabezado
 * pequeño, y los productos destacados mostrando sus propias tarjetas
 * "cargando" sobre fondo claro — como si cada componente recién llegara.
 */
export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-7xl space-y-10 px-5 py-8 lg:px-8">
        {/* Encabezado de la página, discreto */}
        <div className="space-y-4 pt-4">
          <Skeleton className="h-3 w-36 rounded-full" />
          <Skeleton className="h-6 w-64 rounded-lg sm:w-80" />
          <Skeleton className="h-10 w-44 rounded-full" />
        </div>

        {/* Tarjetas de productos mostrando su carga individual */}
        <div className="rounded-[2rem] border border-border bg-background p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <Skeleton className="h-5 w-44 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
          <ProductGridSkeleton count={3} columns="sm:grid-cols-2 lg:grid-cols-3" />
        </div>

        {/* Pie ligero */}
        <div className="flex justify-center gap-4 pb-6">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
      </div>
    </div>
  )
}