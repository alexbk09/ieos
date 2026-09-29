'use client'

import { ArrowUpRight, FolderKanban, Package } from 'lucide-react'
import { SiteHeader, type HeaderNavLink } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CartDrawer } from '@/components/cart-drawer'
import { AffiliateRedirectModal } from '@/components/affiliate-redirect-modal'
import { useCart } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useLocalizedPath } from '@/hooks/use-localized-path'
import { useTranslations } from '@/hooks/use-translations'

type Subcategory = {
  id: string
  name: string
  slug: string
  slug_localizado?: string
  description: string | null
  count: number
}

export function CategoryHubView({
  category,
  subcategories,
  navLinks,
  brand,
  footer,
  social,
  brandAddress,
}: {
  category: { name: string; slug: string; description: string | null }
  subcategories: Subcategory[]
  navLinks: HeaderNavLink[]
  brand: { name: string; tagline: string; logoUrl: string | null; iconUrl: string | null; whatsapp?: string }
  footer: { copyright?: string; slogan?: string }
  social: { instagram?: string; linkedin?: string; email?: string }
  brandAddress?: string
}) {
  const localizedPath = useLocalizedPath()
  const t = useTranslations()
  const exchangeRate = useExchangeRate()
  const {
    cart,
    change,
    total,
    count,
    cartOpen,
    setCartOpen,
    popupsBlocked,
    setPopupsBlocked,
    finishAffiliateCheckout,
    clear,
  } = useCart()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader
        cartCount={count}
        onOpenCart={() => setCartOpen(true)}
        navLinks={navLinks}
        brand={{ name: brand.name, tagline: brand.tagline, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl }}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 lg:px-8">
        <nav aria-label="Ruta">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <li><a href={localizedPath('/')} className="transition-colors hover:text-brand-strong">{t('nav.home')}</a></li>
            <li aria-hidden="true">/</li>
            <li className="text-brand-strong">{category.name}</li>
          </ol>
        </nav>

        <header className="mt-7 border-b border-border pb-7">
          <p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">{t('category.eyebrow')}</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{category.name}</h1>
          {category.description && <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">{category.description}</p>}
          <p className="mt-3 text-sm text-muted-foreground">{subcategories.length} subcategorías</p>
        </header>

        <section aria-label="Subcategorías" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subcategories.map((subcategory) => (
            <a
              key={subcategory.id}
              href={localizedPath(`/categoria/${subcategory.slug_localizado ?? subcategory.slug}`)}
              className="group flex min-h-44 flex-col border-b border-border py-5 transition-colors hover:border-brand-strong"
            >
              <span className="flex items-start justify-between gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-strong">
                  <FolderKanban size={18} />
                </span>
                <ArrowUpRight size={17} className="mt-1 text-muted-foreground transition group-hover:text-brand-strong" />
              </span>
              <span className="mt-4 font-medium">{subcategory.name}</span>
              {subcategory.description && <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{subcategory.description}</span>}
              <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs text-muted-foreground">
                <Package size={13} /> {subcategory.count} {subcategory.count === 1 ? t('category.stockOne') : t('category.stockMany')}
              </span>
            </a>
          ))}
        </section>
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