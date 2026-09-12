'use client'

import Image from 'next/image'
import { CalendarClock, Clock, Tag } from 'lucide-react'
import { SiteHeader, type HeaderNavLink } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CartDrawer } from '@/components/cart-drawer'
import { RichDescription } from '@/components/rich-description'
import { ComparisonTable, type ComparisonTableData } from '@/components/comparison-table'
import { EntryCard, type EntryCardData } from '@/components/entry-card'
import { moneyUsd } from '@/lib/currency'
import { useCart } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useLocalizedPath } from '@/hooks/use-localized-path'
import { useTranslations } from '@/hooks/use-translations'

/**
 * Vista cliente de una entrada SEO (/guias/[slug]).
 * ------------------------------------------------------------------
 * POR QUÉ es cliente: SiteHeader necesita el carrito, que solo existe en
 * cliente. Aun así Next hace SSR del primer render, por lo que el H1, el
 * artículo completo, la tabla comparativa y las FAQ viajan en el HTML crudo
 * que lee Google (el valor pSEO de la entrada queda intacto).
 *
 * Es 100% presentacional: no conoce Supabase, recibe todo ya resuelto.
 * Los productos enlazan a su ficha interna (enlazado interno + conversión).
 */

/** Entrada serializada para la vista. */
export type EntryViewData = {
  slug: string
  /** Slug del idioma activo (para migas y enlaces internos). */
  slugLocalizado: string
  titulo: string
  resumen: string | null
  cuerpoHtml: string | null
  comparativa: ComparisonTableData | null
  faq: { pregunta: string; respuesta: string }[] | null
  angulo: string | null
  heroImageUrl: string | null
  lecturaMinutos: number | null
  autor: string | null
  actualizadoEn: string | null
}

/** Producto comparado (datos mínimos para el rail de productos). */
export type EntryViewProduct = {
  slug: string
  nombre: string
  imagenUrl: string | null
  precioUsd: number
  nota: string | null
}

/** Nicho enlazado (enlazado interno hacia el hub). */
export type EntryViewCategory = { nombre: string; slugLocalizado: string }

export function EntryPageView({
  entry,
  products,
  categories,
  related,
  navLinks,
  brand,
  footer,
  social,
  brandAddress,
  locale,
}: {
  entry: EntryViewData
  products: EntryViewProduct[]
  categories: EntryViewCategory[]
  related: EntryCardData[]
  navLinks: HeaderNavLink[]
  brand: { name: string; tagline: string; logoUrl: string | null; iconUrl: string | null; whatsapp?: string }
  footer: { copyright?: string; slogan?: string }
  social: { instagram?: string; linkedin?: string; email?: string }
  brandAddress?: string
  /** Idioma activo (para el formato de fechas). */
  locale: string
}) {
  const { cart, change, total, count, cartOpen, setCartOpen, finishAffiliateCheckout } = useCart()
  const exchangeRate = useExchangeRate()
  const t = useTranslations()
  const localizedPath = useLocalizedPath()

  /** Fecha legible en el idioma activo (señal de frescura para el usuario). */
  const fechaLegible = entry.actualizadoEn
    ? new Date(entry.actualizadoEn).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  /** Enlace interno a la ficha de un producto (con el idioma activo). */
  const productLink = (product: { slug: string }) => localizedPath('/productos/' + product.slug)
  const comparisonProducts = products.map((product) => ({ slug: product.slug, name: product.nombre }))

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader
        cartCount={count}
        onOpenCart={() => setCartOpen(true)}
        navLinks={navLinks}
        brand={{ name: brand.name, tagline: brand.tagline, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl }}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 lg:px-8">
        {/* Miga de pan: Inicio / Guías / Entrada (espejo del BreadcrumbList JSON-LD). */}
        <nav aria-label="Ruta">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <li>
              <a href={localizedPath('/')} className="transition hover:text-foreground">
                {t('nav.home')}
              </a>
            </li>
            <li aria-hidden>/</li>
            <li>
              <a href={localizedPath('/guias')} className="transition hover:text-foreground">
                {t('entry.indexTitle')}
              </a>
            </li>
            <li aria-hidden>/</li>
            <li className="line-clamp-1 text-foreground">{entry.titulo}</li>
          </ol>
        </nav>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="min-w-0">
            {/* H1 ÚNICO de la página (el cuerpo del artículo nunca trae <h1>). */}
            <header>
              <p className="font-mono text-[11px] uppercase tracking-wider text-brand">{t('entry.eyebrow')}</p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-.04em] sm:text-4xl">
                {entry.titulo}
              </h1>

              {/* Autoría y frescura: señales E-E-A-T visibles, no solo en el schema. */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {entry.autor && (
                  <span className="inline-flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" aria-hidden />
                    {t('entry.by', { author: entry.autor })}
                  </span>
                )}
                {entry.lecturaMinutos ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {t('entry.readingTime', { minutes: entry.lecturaMinutos })}
                  </span>
                ) : null}
                {fechaLegible && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                    {t('entry.updated', { date: fechaLegible })}
                  </span>
                )}
                {entry.angulo && (
                  <span className="rounded-full bg-brand/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-brand">
                    {entry.angulo}
                  </span>
                )}
              </div>

              {entry.resumen && (
                <p className="mt-5 border-l-2 border-brand pl-4 text-base font-medium leading-7 text-muted-foreground">
                  {entry.resumen}
                </p>
              )}
            </header>

            {entry.heroImageUrl && (
              <div className="relative mt-7 aspect-[16/9] w-full overflow-hidden rounded-3xl border border-border bg-muted">
                <Image
                  src={entry.heroImageUrl}
                  alt={entry.titulo}
                  fill
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="object-cover"
                />
              </div>
            )}

            {/* Cuerpo del artículo: HTML semántico sanitizado (H2/H3, listas, tablas). */}
            {entry.cuerpoHtml && (
              <section className="mt-8">
                <RichDescription html={entry.cuerpoHtml} />
              </section>
            )}

            {/* Comparativa con datos REALES del catálogo (nunca inventados por la IA). */}
            <ComparisonTable
              comparison={entry.comparativa}
              products={comparisonProducts}
              linkForProduct={productLink}
            />
          </article>

          {/* Columna lateral: productos de la guía + nichos (enlazado interno). */}
          <aside className="min-w-0 lg:sticky lg:top-24 lg:h-fit">
            {products.length > 0 && (
              <section
                aria-labelledby="entry-products-heading"
                className="rounded-3xl border border-border bg-card p-5"
              >
                <h2 id="entry-products-heading" className="text-sm font-semibold uppercase tracking-wider">
                  {t('entry.products')}
                </h2>
                <ul className="mt-4 space-y-4">
                  {products.map((product) => (
                    <li key={product.slug} className="flex gap-3">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
                        {product.imagenUrl && (
                          <Image
                            src={product.imagenUrl}
                            alt={product.nombre}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <a
                          href={productLink(product)}
                          className="line-clamp-2 text-sm font-medium transition hover:text-brand"
                        >
                          {product.nombre}
                        </a>
                        {product.precioUsd > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{moneyUsd(product.precioUsd)}</p>
                        )}
                        {product.nota && (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                            {product.nota}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {categories.length > 0 && (
              <section className="mt-5 rounded-3xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wider">{t('category.eyebrow')}</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {categories.map((categoria) => (
                    <li key={categoria.slugLocalizado}>
                      <a
                        href={localizedPath('/categoria/' + categoria.slugLocalizado)}
                        className="inline-flex rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:border-brand/60 hover:text-brand"
                      >
                        {categoria.nombre}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>

        {/* FAQ visible: espejo EXACTO del schema FAQPage que inyecta la página. */}
        {entry.faq && entry.faq.length > 0 && (
          <section aria-labelledby="entry-faq-heading" className="mt-14 max-w-3xl border-t border-border pt-8">
            <h2 id="entry-faq-heading" className="text-2xl font-semibold tracking-[-.04em]">
              {t('entry.faq')}
            </h2>
            <dl className="mt-5 space-y-4">
              {entry.faq.map((item, index) => (
                <div key={`${item.pregunta}-${index}`} className="rounded-2xl border border-border bg-card p-5">
                  <dt className="font-medium">{item.pregunta}</dt>
                  <dd className="mt-2 text-sm leading-7 text-muted-foreground">{item.respuesta}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Cluster: otras guías del mismo nicho (reparte autoridad interna). */}
        {related.length > 0 && (
          <section aria-labelledby="entry-related-heading" className="mt-14 border-t border-border pt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="entry-related-heading" className="text-2xl font-semibold tracking-[-.04em]">
                {t('entry.related')}
              </h2>
              <a
                href={localizedPath('/guias')}
                className="text-sm font-medium text-brand transition hover:text-brand-strong"
              >
                {t('entry.allGuides')}
              </a>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <EntryCard key={item.slug} entry={item} />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter
        footer={footer}
        brand={{ name: brand.name, address: brandAddress }}
        social={social}
        logoUrl={brand.logoUrl}
        iconUrl={brand.iconUrl}
        whatsapp={brand.whatsapp}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onChange={change}
        total={total}
        onFinishCheckout={finishAffiliateCheckout}
        exchangeRate={exchangeRate}
        hasNonAffiliate={cart.some(
          (item) => !item.url_afiliado_ali && !item.url_afiliado_amazon && !item.url_afiliado_store,
        )}
      />
    </div>
  )
}
