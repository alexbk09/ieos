import { Skeleton, ProductGridSkeleton } from '@/components/ui/skeleton'

/**
 * Carga del catálogo público (clientes).
 * Fondo claro, header discreto como la página real y grid de tarjetas
 * cargando (misma silueta que ProductCard). Nada de bloques gigantes.
 */
export default function CatalogLoading() {
  return (
    <div className="min-h-screen bg-background">
      {/* Barra superior ligera (sin el header completo del sitio) */}
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-xl" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="size-9 rounded-full" />
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl px-5 py-8 lg:px-8">
        {/* Título y subtítulo del catálogo */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-52" />
        </div>

        {/* Buscador y filtros */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-64 rounded-full" />
          <Skeleton className="h-10 w-36 rounded-full" />
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>

        {/* Grid de productos cargando individualmente */}
        <div className="mt-8">
          <ProductGridSkeleton count={6} />
        </div>
      </main>
    </div>
  )
}