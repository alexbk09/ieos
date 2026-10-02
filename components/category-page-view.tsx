'use client'

import { useState } from 'react'
import Image from 'next/image'
import { SiteHeader, type HeaderNavLink } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { ProductCard, type CardProduct } from '@/components/product-card'
import { ProductDetailModal } from '@/components/product-detail-modal'
import { RichDescription } from '@/components/rich-description'
import { CategoryNav, type CategoryNavItem } from '@/components/category-nav'
import type { SeoFaqItem } from '@/lib/seo-types'
import { CartDrawer } from '@/components/cart-drawer'
import { AffiliateRedirectModal } from '@/components/affiliate-redirect-modal'
import { useCart } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useAgentAddToCart } from '@/hooks/use-agent-add-to-cart'
import { useTranslations } from '@/hooks/use-translations'
import { useLocalizedPath } from '@/hooks/use-localized-path'

/**
 * Vista cliente de la página /categoria/[slug].
 *
 * POR QUÉ es un componente cliente:
 *  - SiteHeader necesita el carrito (cartCount + onOpenCart), que solo existe
 *    en cliente vía useCart. No se puede pasar un handler desde un Server
 *    Component (Next.js lo prohíbe).
 *  - Aun siendo cliente, Next.js hace SSR del primer render, así que el H1,
 *    la descripción y la grilla de productos viajan en el HTML crudo que
 *    recibe Google (SEO pSEO intacto).
 *  - No toca Supabase: recibe categoría + productos + settings ya serializados.
 */
export function CategoryPageView({
  category,
  parentCategory,
  products,
  categories,
  guides,
  navLinks,
  brand,
  footer,
  social,
  brandAddress,
}: {
  category: {
    name: string
    slug: string
    description: string | null
    /** H1 largo del hub (pSEO). Fallback = name. */
    seo_title?: string | null
    /** HTML editorial del hub (Guía de compra, Cómo elegir). */
    seo_intro?: string | null
    /** Preguntas frecuentes visibles del nicho. */
    seo_faq?: SeoFaqItem[] | null
    /** Firma editorial del hub (autoría visible = señal E-E-A-T). */
    autor?: string | null
  }
  parentCategory?: { name: string; slug_localizado: string } | null
  products: CardProduct[]
  /** Categorías para la navegación cross-categoría (enlazado interno). */
  categories: CategoryNavItem[]
  /**
   * Guías/comparativas del nicho (enlazado interno BIDIRECCIONAL).
   * Es opcional: si el nicho aún no tiene guías, el bloque no se renderiza.
   */
  guides?: { titulo: string; slugLocalizado: string; resumen: string | null; imagenUrl?: string | null }[]
  navLinks: HeaderNavLink[]
  brand: { name: string; tagline: string; logoUrl: string | null; iconUrl: string | null; whatsapp?: string }
  footer: { copyright?: string; slogan?: string }
  social: { instagram?: string; linkedin?: string; email?: string }
  brandAddress?: string
}) {
  const exchangeRate = useExchangeRate()
  const { cart, add, change, total, count, cartOpen, setCartOpen, popupsBlocked, setPopupsBlocked, finishAffiliateCheckout, clear } = useCart()
  useAgentAddToCart(add)
  const t = useTranslations()
  // Enlaces internos de la miga de pan en el idioma activo.
  const localizedPath = useLocalizedPath()

  const [selected, setSelected] = useState<CardProduct | null>(null)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader
        cartCount={count}
        onOpenCart={() => setCartOpen(true)}
        navLinks={navLinks}
        brand={{ name: brand.name, tagline: brand.tagline, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl }}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 lg:px-8">
        {/* Miga de pan semántica (UX + SEO) */}
        <nav aria-label="Ruta">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <li><a href={localizedPath('/')} className="transition-colors hover:text-brand-strong">{t('nav.home')}</a></li>
            <li aria-hidden="true">/</li>
            <li><a href={localizedPath('/catalogo')} className="transition-colors hover:text-brand-strong">{t('nav.catalog')}</a></li>
            <li aria-hidden="true">/</li>
            {parentCategory && (
              <>
                <li>
                  <a href={localizedPath(`/${parentCategory.slug_localizado}`)} className="transition-colors hover:text-brand-strong">
                    {parentCategory.name}
                  </a>
                </li>
                <li aria-hidden="true">/</li>
              </>
            )}
            <li className="text-brand-strong">{category.name}</li>
          </ol>
        </nav>

        {/* Encabezado de la categoría (H1 largo del hub si existe) */}
        <header className="mt-7 border-b border-border pb-7">
          <p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">{t('category.eyebrow')}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.05em] sm:text-4xl">{category.seo_title?.trim() || category.name}</h1>
          {/* Autoría visible: firma editorial del hub (E-E-A-T). */}
          {category.autor && (
            <p className="mt-3 text-xs text-muted-foreground">{t('entry.by', { author: category.autor })}</p>
          )}
          {category.description && (
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{category.description}</p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {products.length === 1
              ? t('category.availableSingular', { count: products.length })
              : t('category.availablePlural', { count: products.length })}
          </p>
        </header>

        {/* Contenido editorial del hub (pSEO): guía de compra con H2/H3.
            Es lo que convierte el listado plano en una "categoría de nicho". */}
        {category.seo_intro && (
          <section className="mt-8 max-w-3xl">
            <RichDescription html={category.seo_intro} />
          </section>
        )}

        {/* Grilla de productos (SSR → crawlable por Google) */}
        <section className="mt-8">
          {products.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} rate={exchangeRate} onAdd={add} onViewDetails={setSelected} />
              ))}
            </div>
          ) : (
            <div className="grid place-items-center rounded-3xl border border-dashed border-border py-20 text-center">
              <p className="text-muted-foreground">{t('category.empty')}</p>
              <a href="/catalogo" className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-brand-foreground transition hover:brightness-110">
                {t('category.seeAll')}
              </a>
            </div>
          )}
        </section>

        {/* FAQ del nicho: contenido visible para resolver dudas de compra. */}
        {category.seo_faq && category.seo_faq.length > 0 && (
          <section aria-labelledby="category-faq-heading" className="mt-12 max-w-3xl border-t border-border pt-8">
            <h2 id="category-faq-heading" className="text-2xl font-semibold tracking-[-.04em]">
              {t('category.faq')}
            </h2>
            <dl className="mt-5 space-y-4">
              {category.seo_faq.map((item, i) => (
                <div key={`${item.pregunta}-${i}`} className="rounded-2xl border border-border bg-card p-5">
                  <dt className="font-medium">{item.pregunta}</dt>
                  <dd className="mt-2 text-sm leading-7 text-muted-foreground">{item.respuesta}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Guías del nicho + puerta al hub de contenido.
            Aunque este nicho aún no tenga guías propias, el usuario (y Google)
            SIEMPRE tiene un camino al contenido: la malla nunca queda rota. */}
        <section
          aria-labelledby="category-guides-heading"
          className="mt-12 border-t border-border pt-8"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="category-guides-heading" className="text-2xl font-semibold tracking-[-.04em]">
              {t('entry.related')}
            </h2>
            <a
              href={localizedPath('/guias')}
              className="text-sm font-medium text-brand-strong transition hover:underline"
            >
              {t('entry.allGuides')}
            </a>
          </div>

          {guides && guides.length > 0 ? (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((guide) => (
                <li key={guide.slugLocalizado}>
                  <a
                    href={localizedPath('/guias/' + guide.slugLocalizado)}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-brand/60"
                  >
                    {/* Miniatura: la foto del producto comparado cuando la guía
                        no tiene una propia (nunca una tarjeta en gris). */}
                    <span className="relative block aspect-[16/9] w-full overflow-hidden bg-muted">
                      {guide.imagenUrl ? (
                        <Image
                          src={guide.imagenUrl}
                          alt={guide.titulo}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover transition duration-500 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="block h-full w-full bg-gradient-to-br from-brand/15 via-muted to-muted" />
                      )}
                    </span>
                    <span className="flex flex-1 flex-col p-5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-brand-strong">
                        {t('entry.eyebrow')}
                      </span>
                      <span className="mt-2 font-medium leading-snug group-hover:text-brand-strong">
                        {guide.titulo}
                      </span>
                      {guide.resumen && (
                        <span className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                          {guide.resumen}
                        </span>
                      )}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('entry.indexSubtitle')}
            </p>
          )}
        </section>

        {/* Navegación cross-categoría (enlazado interno + UX moderna). */}
        <CategoryNav items={categories} currentSlug={category.slug} />
      </main>

      <SiteFooter
        footer={footer}
        brand={{ name: brand.name, address: brandAddress }}
        social={social}
        logoUrl={brand.logoUrl}
        iconUrl={brand.iconUrl}
        whatsapp={brand.whatsapp}
      />

      {selected && (
        <ProductDetailModal
          product={selected}
          rate={exchangeRate}
          onClose={() => setSelected(null)}
          onAdd={(product, unit, quantity, colorName) => add(product, unit, quantity, colorName)}
        />
      )}

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onChange={change}
        total={total}
        onFinishCheckout={finishAffiliateCheckout}
        exchangeRate={exchangeRate}
        hasNonAffiliate={cart.some((item) => !item.url_afiliado_ali && !item.url_afiliado_amazon && !item.url_afiliado_store)}
      />

      <AffiliateRedirectModal
        open={popupsBlocked}
        items={cart}
        rate={exchangeRate}
        onClose={() => setPopupsBlocked(false)}
        onClearCheckout={clear}
      />
    </div>
  )
}
