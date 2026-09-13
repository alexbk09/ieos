'use client'

import { SiteHeader, type HeaderNavLink } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CartDrawer } from '@/components/cart-drawer'
import { CategoryNav, type CategoryNavItem } from '@/components/category-nav'
import { EntryCard, type EntryCardData } from '@/components/entry-card'
import { useCart } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useLocalizedPath } from '@/hooks/use-localized-path'
import { useTranslations } from '@/hooks/use-translations'

/**
 * Vista cliente del hub de contenido /guias.
 * ------------------------------------------------------------------
 * POR QUÉ es un componente cliente: SiteHeader necesita el carrito (solo
 * disponible en cliente). Next hace SSR del primer render, así que el H1, la
 * introducción y TODAS las tarjetas viajan en el HTML crudo que lee Google
 * (el hub es una pieza pSEO, no un adorno).
 *
 * No toca Supabase: recibe entradas, categorías y ajustes ya serializados.
 */
export function EntryIndexView({
  entries,
  categories,
  navLinks,
  brand,
  footer,
  social,
  brandAddress,
}: {
  entries: EntryCardData[]
  categories: CategoryNavItem[]
  navLinks: HeaderNavLink[]
  brand: { name: string; tagline: string; logoUrl: string | null; iconUrl: string | null; whatsapp?: string }
  footer: { copyright?: string; slogan?: string }
  social: { instagram?: string; linkedin?: string; email?: string }
  brandAddress?: string
}) {
  const { cart, change, total, count, cartOpen, setCartOpen, finishAffiliateCheckout } = useCart()
  const exchangeRate = useExchangeRate()
  const t = useTranslations()
  const localizedPath = useLocalizedPath()

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
            <li>
              <a href={localizedPath('/')} className="transition hover:text-foreground">
                {t('nav.home')}
              </a>
            </li>
            <li aria-hidden>/</li>
            <li className="text-foreground">{t('entry.indexTitle')}</li>
          </ol>
        </nav>

        {/* H1 único del hub: agrupa el cluster de guías bajo un tema claro. */}
        <header className="mt-6 max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-wider text-brand-strong">{t('entry.eyebrow')}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{t('entry.indexTitle')}</h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">{t('entry.indexSubtitle')}</p>
        </header>

        <section className="mt-8">
          {entries.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {entries.map((entry) => (
                <EntryCard key={entry.slug} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="grid place-items-center rounded-3xl border border-dashed border-border py-20 text-center">
              <p className="text-muted-foreground">{t('entry.empty')}</p>
              <a
                href={localizedPath('/catalogo')}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-brand-foreground transition hover:brightness-110"
              >
                {t('category.seeAll')}
              </a>
            </div>
          )}
        </section>

        {/* Enlazado interno hacia los hubs de nicho (cluster topical). */}
        <CategoryNav items={categories} />
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
        hasNonAffiliate={cart.some((item) => !item.url_afiliado_ali && !item.url_afiliado_amazon && !item.url_afiliado_store)}
      />
    </div>
  )
}
