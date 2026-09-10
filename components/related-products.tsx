'use client'

import { ProductCard, type CardProduct } from '@/components/product-card'

/**
 * Módulo de "Productos relacionados" (enlazado interno / Cluster SEO).
 * ------------------------------------------------------------------
 * POR QUÉ existe: Google descubre e indexa más rápido cuando las fichas
 * se enlazan entre sí. Este bloque cierra la malla interna mostrando
 * productos de la MISMA categoría al pie de la ficha.
 *
 * - Recibe los productos YA resueltos por /services (capa de datos), por
 *   lo que el componente es 100% presentacional (agnóstico de Supabase).
 * - Se renderiza en servidor: el HTML con los enlaces viaja a Google sin JS.
 */
export function RelatedProducts({
  products,
  rate,
  onAdd,
}: {
  products: CardProduct[]
  rate: number
  onAdd: (product: CardProduct) => void
}) {
  // Si no hay relacionados, no se renderiza nada (evita secciones vacías).
  if (!products || products.length === 0) return null

  /** Navega a la ficha del producto (los enlaces ya son crawlables). */
  function goToProduct(product: CardProduct) {
    window.location.href = '/productos/' + product.slug
  }

  return (
    <section aria-labelledby="related-products-heading" className="mt-16 border-t border-border pt-10">
      {/* H2 semántico: jerarquía de encabezados dentro de la ficha. */}
      <h2 id="related-products-heading" className="text-2xl font-semibold tracking-[-.04em] sm:text-3xl">
        Productos relacionados
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Opciones similares de la misma categoría.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} rate={rate} onAdd={onAdd} onViewDetails={goToProduct} />
        ))}
      </div>
    </section>
  )
}
