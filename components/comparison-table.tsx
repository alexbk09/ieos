'use client'

import { MarketplaceOfferButton } from '@/components/marketplace-offer-button'
import { useTranslations } from '@/hooks/use-translations'

/**
 * ComparisonTable
 * ------------------------------------------------------------------
 * Tabla comparativa de una entrada SEO.
 * POR QUÉ una tabla real y no una imagen o una lista: Google entiende las
 * tablas HTML (<caption>, <th scope>) y las usa para extraer datos; además es
 * la forma más rápida de que el usuario compare. Los valores llegan YA
 * construidos con las especificaciones reales del catálogo (nunca inventadas
 * por la IA), así que el componente es 100% presentacional.
 */

/** Datos de la comparativa (misma forma que persiste la tabla `seo_entries`). */
export type ComparisonTableData = {
  criterios: { criterio: string; valores: { slug: string; valor: string }[] }[]
}

/** Cabecera de producto de la tabla. */
export type ComparisonProductHeader = {
  slug: string
  name: string
  /** Id real del producto: solo para atribuir el clic de afiliado en analítica. */
  id?: string
}

export function ComparisonTable({
  comparison,
  products,
  linkForProduct,
  offerUrlForProduct,
}: {
  comparison: ComparisonTableData | null
  products: ComparisonProductHeader[]
  /** Construye el enlace interno al producto (idioma activo incluido). */
  linkForProduct: (product: ComparisonProductHeader) => string
  /**
   * Devuelve la URL de afiliado del producto comparado (o `null` si no tiene
   * enlace, si está degradado en el marketplace o si la tabla va en modo
   * previsualización). Cuando existe, cada columna muestra el MISMO CTA
   * "Ver Oferta en …" que la ficha del producto: quien ya decidió comparar no
   * tiene que navegar a otra página para comprar.
   */
  offerUrlForProduct?: (product: ComparisonProductHeader) => string | null
}) {
  const t = useTranslations()

  // Sin criterios ni productos no hay nada que comparar: no se renderiza.
  if (!comparison || comparison.criterios.length === 0 || products.length === 0) return null

  // Se cuentan los productos que aportan AL MENOS un valor. Comparar con datos
  // de un solo producto no es una comparación: en ese caso la tabla se oculta
  // (evita mostrar una columna llena de guiones).
  const productosConDatos = products.filter((producto) =>
    comparison.criterios.some((fila) =>
      fila.valores.some((valor) => valor.slug === producto.slug && valor.valor),
    ),
  ).length
  if (productosConDatos < 2) return null

  return (
    <section aria-labelledby="entry-comparison-heading" className="mt-12">
      <h2 id="entry-comparison-heading" className="text-2xl font-semibold tracking-[-.04em] sm:text-3xl">
        {t('entry.comparison')}
      </h2>
      {/* overflow-x-auto: en móvil la tabla se desplaza en lugar de romper el layout.
          600px de ancho mínimo: ahora cada columna lleva nombre + CTA de oferta, y
          menos ancho dejaba el botón partido en tres líneas. */}
      <div className="mt-5 overflow-x-auto rounded-3xl border border-border bg-card">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <caption className="sr-only">{t('entry.comparison')}</caption>
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th
                scope="col"
                className="px-4 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                {t('entry.criteria')}
              </th>
              {products.map((product) => {
                const offerUrl = offerUrlForProduct?.(product) ?? null
                return (
                  <th key={product.slug} scope="col" className="px-4 py-3 text-left align-top font-medium">
                    <a href={linkForProduct(product)} className="transition hover:text-brand-strong">
                      {product.name}
                    </a>
                    {/* Salida directa al marketplace con el precio real: mismo CTA
                        "Ver Oferta" de la ficha (átomo compartido). */}
                    {offerUrl && (
                      <MarketplaceOfferButton url={offerUrl} productId={product.id ?? product.slug} />
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {comparison.criterios.map((fila) => (
              <tr key={fila.criterio} className="border-b border-border/60 last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {fila.criterio}
                </th>
                {products.map((product) => {
                  // El valor se busca por slug: los productos que no declaran ese
                  // criterio muestran un guion (nunca un hueco vacío).
                  const valor = fila.valores.find((item) => item.slug === product.slug)?.valor
                  return (
                    <td key={product.slug} className="px-4 py-3 align-top">
                      {valor || '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
