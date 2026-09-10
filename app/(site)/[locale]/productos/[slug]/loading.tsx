import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton de la página /productos/[slug].
 * Refleja la estructura del detalle (galería + ficha + CTA) para
 * minimizar CLS mientras el Server Component resuelve los datos SEO.
 */
export default function ProductDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 lg:px-8">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-14 rounded-full" />
        <Skeleton className="h-3 w-3 rounded-full" />
        <Skeleton className="h-3 w-16 rounded-full" />
      </div>

      <div className="mt-7 grid w-full gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <Skeleton className="aspect-square w-full rounded-3xl" />
          <div className="mt-3 grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="mt-4 h-9 w-11/12 rounded-lg" />
          <Skeleton className="mt-2 h-9 w-3/4 rounded-lg" />
          <div className="mt-5 flex items-center gap-3">
            <Skeleton className="h-9 w-28 rounded-full" />
            <Skeleton className="ml-auto h-6 w-24 rounded-full" />
          </div>
          <div className="mt-6 space-y-2.5">
            <Skeleton className="h-4 w-full rounded-lg" />
            <Skeleton className="h-4 w-full rounded-lg" />
            <Skeleton className="h-4 w-2/3 rounded-lg" />
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Skeleton className="h-12 flex-1 rounded-full" />
            <Skeleton className="h-12 w-56 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}