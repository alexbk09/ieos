'use client'

import { useState } from 'react'
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
import { AgentChat } from '@/components/agent-chat'

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
  products,
  categories,
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
    /** FAQ del nicho (visible + schema FAQPage). */
    seo_faq?: SeoFaqItem[] | null
  }
  products: CardProduct[]
  /** Categorías para la navegación cross-categoría (enlazado interno). */
  categories: CategoryNavItem[]
  navLinks: HeaderNavLink[]
  brand: { name: string; tagline: string; logoUrl: string | null; iconUrl: string | null }
  footer: { copyright?: string; slogan?: string }
  social: { instagram?: string; linkedin?: string; email?: string }
  brandAddress?: string
}) {
  const exchangeRate = useExchangeRate()
  const { cart, add, change, total, count, cartOpen, setCartOpen, popupsBlocked, setPopupsBlocked, finishAffiliateCheckout, clear } = useCart()
  useAgentAddToCart(add)

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
            <li><a href="/" className="transition-colors hover:text-brand-strong">Inicio</a></li>
            <li aria-hidden="true">/</li>
            <li><a href="/catalogo" className="transition-colors hover:text-brand-strong">Catálogo</a></li>
            <li aria-hidden="true">/</li>
            <li className="text-brand-strong">{category.name}</li>
          </ol>
        </nav>

        {/* Encabezado de la categoría (H1 largo del hub si existe) */}
        <header className="mt-7 border-b border-border pb-7">
          <p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">Categoría</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.05em] sm:text-4xl">{category.seo_title?.trim() || category.name}</h1>
          {category.description && (
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{category.description}</p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {products.length} producto{products.length !== 1 ? 's' : ''} disponible{products.length !== 1 ? 's' : ''}
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
              <p className="text-muted-foreground">Aún no hay productos publicados en esta categoría.</p>
              <a href="/catalogo" className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-brand-foreground transition hover:bg-brand-strong">
                Ver todo el catálogo
              </a>
            </div>
          )}
        </section>

        {/* FAQ del nicho: visible para el usuario y espejo del schema FAQPage
            que la página inyecta en el <head> (Google exige que coincidan). */}
        {category.seo_faq && category.seo_faq.length > 0 && (
          <section aria-labelledby="category-faq-heading" className="mt-12 max-w-3xl border-t border-border pt-8">
            <h2 id="category-faq-heading" className="text-2xl font-semibold tracking-[-.04em]">
              Preguntas frecuentes
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

        {/* Navegación cross-categoría (enlazado interno + UX moderna). */}
        <CategoryNav items={categories} currentSlug={category.slug} title="Explora otras categorías" />
      </main>

      <SiteFooter footer={footer} brand={{ name: brand.name, address: brandAddress }} social={social} />

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

      <AgentChat />
    </div>
  )
}
