'use client'

import { ImagePlus, Plus, ShieldCheck, Star, Truck, ExternalLink } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { SiteHeader, type HeaderNavLink } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { RichDescription } from '@/components/rich-description'
import { RelatedProducts } from '@/components/related-products'
import { CategoryNav, type CategoryNavItem } from '@/components/category-nav'
import type { CardProduct } from '@/components/product-card'
import { CartDrawer } from '@/components/cart-drawer'
import { AffiliateRedirectModal } from '@/components/affiliate-redirect-modal'
import { useCart, type CartProduct } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useAgentAddToCart } from '@/hooks/use-agent-add-to-cart'
import { trackProductView, trackAffiliateClick } from '@/lib/analytics-client'
import { moneyUsd, moneyEur, formatBolivars, formatRate } from '@/lib/currency'
import { marketplaceForUrl } from '@/lib/affiliate'
import { AFFILIATE_LINK_REL } from '@/lib/constants'

// ---------- Tipos serializables (Server Component → Client) ----------
export type DetailProductImage = {
  id: string
  url: string
  alt_text: string | null
  sort_order: number
  color_name: string | null
}

/** Reseña real mostrada en la sección "Opiniones" (migración 0052). */
export type DetailProductReview = {
  autor: string | null
  valoracion: number | null
  texto: string
  fecha: string | null
}

export type DetailProduct = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  precio_original: number | null
  image_url: string | null
  stock: number
  colors: string[]
  peso: string | null
  tamaño: string | null
  specifications: Record<string, string>
  pricing_type: 'unit' | 'weight'
  price_per_gram_usd: number
  price_per_kilo_usd: number
  stock_grams: number
  min_order_grams: number
  unit_label: string
  low_stock_threshold: number
  weight_grams: number | null
  featured: boolean
  is_available: boolean
  url_afiliado_ali: string | null
  url_afiliado_amazon: string | null
  url_afiliado_store: string | null
  categories: { id: string; name: string; slug: string; description: string | null }[]
  images: DetailProductImage[]
  marca?: { id: string; nombre: string; activa: boolean } | null
  /** Valoración media real en escala 0-5 (migración 0052). */
  rating_average?: number | null
  /** Número de valoraciones reales (migración 0052). */
  rating_count?: number | null
  /** Reseñas reales traducidas (migración 0052). */
  reviews?: DetailProductReview[]
}

type DetailProductProps = {
  product: DetailProduct
  /** Productos relacionados de la misma categoría (enlazado interno SEO). */
  related: CardProduct[]
  /** Categorías para la navegación cross-categoría. */
  categories: CategoryNavItem[]
  navLinks: HeaderNavLink[]
  brand: { name: string; tagline: string; logoUrl: string | null; iconUrl: string | null }
  footer: { copyright?: string; slogan?: string }
  social: { instagram?: string; linkedin?: string; email?: string }
  brandAddress?: string
}

// ---------- Utils de UI ----------
function CategoryPill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-brand/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-brand-strong">{children}</span>
}

function DetailChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  )
}

/**
 * Estrellas de valoración (0-5). Renderiza 5 iconos rellenos según la media
 * redondeada. Accesible (aria-label con el valor exacto).
 */
function StarRating({ value, size = 14 }: { value: number; size?: number }) {
  const redondeada = Math.round(Math.min(Math.max(Number(value) || 0, 0), 5))
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Valoración ${Number(value).toFixed(1)} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={i < redondeada ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}
        />
      ))}
    </span>
  )
}

/**
 * Vista pública de la página /productos/[slug].
 *
 * Responsabilidades:
 *  - UI premium responsive (Tailwind) heredando los estilos de la tienda.
 *  - Galería dinámica: si el cliente toca un color/varinte con imagen
 *    asociada (product_images.color_name), la imagen principal muta
 *    con useState SIN recargar la página.
 *  - CTA transparente "Ver Oferta en AliExpress": abre el enlace de
 *    afiliado real en pestaña nueva con rel noopener.
 *  - Botón secundario que reusa el carrito híbrido existente para
 *    productos sin afiliado o compras por solicitud/WhatsApp.
 *
 * NO contiene llamadas a Supabase: todo llega serializado desde el
 * Server Component (regla /services de la arquitectura).
 */
export function ProductDetailPageView({ product, related, categories, navLinks, brand, footer, social, brandAddress }: DetailProductProps) {
  const exchangeRate = useExchangeRate()
  const { cart, add, change, total, count, cartOpen, setCartOpen, popupsBlocked, setPopupsBlocked, finishAffiliateCheckout, clear } = useCart()
  useAgentAddToCart(add)

  // Analítica: la página /productos/[slug] cuenta como una vista de detalle
  // del producto (el carrito exporta el id del producto real).
  useEffect(() => {
    trackProductView(product.id)
  }, [product.id])

  // ----- Galería conmutada por color -----
  const generalImages = product.images.filter((img) => !img.color_name)
  const colorImageMap = new Map<string, string>()
  for (const img of product.images) {
    if (img.color_name && img.url && !colorImageMap.has(img.color_name)) colorImageMap.set(img.color_name, img.url)
  }

  const defaultImages = generalImages.length > 0
    ? generalImages
    : (product.image_url ? [{ id: 'main', url: product.image_url, alt_text: null, sort_order: 0, color_name: null as string | null }] : [])

  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [activeImage, setActiveImage] = useState(0)

  const colorImage = selectedColor ? colorImageMap.get(selectedColor) : undefined
  const gallery = colorImage
    ? [{ id: `color-${selectedColor}`, url: colorImage, alt_text: null, sort_order: 0, color_name: null as string | null }]
    : defaultImages

  const safeActive = Math.min(Math.max(activeImage, 0), Math.max(gallery.length - 1, 0))
  const currentImage = gallery[safeActive]

  // Etiqueta del marketplace / CTA de afiliado
  const affiliateUrl = product.url_afiliado_ali ?? product.url_afiliado_amazon ?? product.url_afiliado_store ?? null
  const market = marketplaceForUrl(affiliateUrl)
  // Reseñas reales del producto (migración 0052); [] si aún no hay opiniones.
  const reviews = product.reviews ?? []
  // Producto de afiliado: su precio está en EUR (AliExpress), no en USD.
  const esAfiliado = Boolean(affiliateUrl)
  const ctaLabel = product.url_afiliado_ali ? 'Ver Oferta en AliExpress' : market.shortLabel === 'Amazon' ? 'Ver Oferta en Amazon' : market.shortLabel === 'Tienda' ? 'Ver Oferta en la Tienda Oficial' : 'Ver Oferta en AliExpress'

  // Producto listo para el carrito híbrido (image_url siempre string en runtime).
  const cartProduct: CartProduct = { ...product, image_url: product.image_url ?? '' }

  const isWeight = product.pricing_type === 'weight'
  const threshold = product.low_stock_threshold || 20
  const stockValue = isWeight ? formatWeight(product.stock_grams) : `${product.stock} ${product.unit_label || 'u'}`
  // Catálogo de afiliados puro: no se gestiona inventario real. Para productos
  // con enlace de afiliado se comunica disponibilidad + envío estimado en vez
  // de un stock falso que rompería la confianza y el "content mismatch" SEO.
  const isAffiliate = Boolean(product.url_afiliado_ali || product.url_afiliado_amazon || product.url_afiliado_store)
  // Stock bajo: solo aplica a productos propios (sin afiliado). En afiliados
  // siempre se muestra verde ("Disponible") porque no hay inventario real.
  const lowStock = isAffiliate
    ? false
    : isWeight
      ? (product.min_order_grams > 0 && product.stock_grams < product.min_order_grams * 10)
      : product.stock < threshold
  const stockBadge = isAffiliate
    ? 'Disponible · Envío 7-15 días'
    : isWeight
      ? `${stockValue} disponibles`
      : `${stockValue} en stock`



  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader cartCount={count} onOpenCart={() => setCartOpen(true)} navLinks={navLinks} brand={{ name: brand.name, tagline: brand.tagline, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl }} />

      <main className="mx-auto flex-1 px-5 py-8 lg:px-8">
        {/* Miga de pan semántica (UX + SEO) */}
        <nav aria-label="Ruta" className="mx-auto max-w-7xl">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <li><a href="/" className="transition-colors hover:text-brand-strong">Inicio</a></li>
            <li aria-hidden="true">/</li>
            <li><a href="/catalogo" className="transition-colors hover:text-brand-strong">Catálogo</a></li>
            {product.categories[0] && (
              <>
                <li aria-hidden="true">/</li>
                {/* La categoría enlaza a su página indexable /categoria/[slug]
                    (pSEO) en lugar de /catalogo, reforzando el enlazado interno. */}
                <li><a href={`/categoria/${product.categories[0].slug}`} className="transition-colors hover:text-brand-strong">{product.categories[0].name}</a></li>
              </>
            )}

            <li aria-hidden="true">/</li>
            <li className="max-w-48 truncate text-brand-strong">{product.name}</li>
          </ol>
        </nav>

        <div className="mx-auto mt-7 grid w-full max-w-7xl gap-10 lg:grid-cols-2 lg:gap-14">
          {/* ===== Galería ===== */}
          <div>
            <div className="overflow-hidden rounded-3xl border border-border bg-card">
              {currentImage ? (
                // Imagen sin next/image para URL remota de AliExpress/supabase al mismo tiempo:
                // <img> garantiza cero fallo de build con dominios remotos desconocidos.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={currentImage.url}
                  src={currentImage.url}
                  alt={currentImage.alt_text || product.name}
                  className="aspect-square w-full object-cover"
                  loading="eager"
                />
              ) : (
                <div className="grid aspect-square w-full place-items-center bg-muted text-muted-foreground">
                  <ImagePlus size={32} />
                </div>
              )}
            </div>

            {/* Miniaturas: si la galería es por color, solo se muestra 1 imagen; los chips nacen del selector de color */}
            {gallery.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {gallery.map((img, i) => (
                  <button
                    key={img.id || img.url}
                    onClick={() => setActiveImage(i)}
                    className={`overflow-hidden rounded-xl border-2 transition ${i === safeActive ? 'border-brand' : 'border-transparent opacity-70 hover:opacity-100'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={`${product.name} — vista ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ===== Info + CTA ===== */}
          <div className="flex flex-col">
            <CategoryPill>{product.categories[0]?.name ?? 'General'}</CategoryPill>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-.05em] sm:text-4xl">{product.name}</h1>

            {product.marca?.nombre && (
              <p className="mt-2 text-sm text-muted-foreground">
                Marca <span className="font-medium text-foreground">{product.marca.nombre}</span>
              </p>
            )}

            <div className="mt-5 flex items-center gap-3">
              {/* Moneda REAL: los afiliados guardan el precio de AliExpress en EUR
                  (target_currency=EUR); los locales, en USD. */}
              <p className="text-3xl font-semibold">{esAfiliado ? moneyEur(product.price_usd) : moneyUsd(product.price_usd)}</p>
              {product.precio_original && product.precio_original > product.price_usd && (
                <p className="text-lg text-muted-foreground line-through">
                  {esAfiliado ? moneyEur(product.precio_original) : moneyUsd(product.precio_original)}
                </p>
              )}
              <span className={`ml-auto rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${lowStock ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
                {stockBadge}
              </span>
            </div>
            {/* Referencia en bolívares (tasa oficial USD→Bs) + aviso de variación. */}
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {formatBolivars(product.price_usd, exchangeRate)} <span className="text-xs opacity-70">· tasa {formatRate(exchangeRate)}</span>
            </p>
            {esAfiliado && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Precio de referencia al momento de publicar. Puede variar en AliExpress según tu país, cupones, moneda y envío.
              </p>
            )}

            {/* Descripción: se renderiza como HTML semántico (h2, p, ul…) con
                estilos tipográficos y sanitización anti-XSS (RichDescription). */}
            {product.description && <RichDescription html={product.description} className="mt-6" />}

            {/* Selector de color: muta la imagen principal */}
            {product.colors.length > 0 && (
              <div className="mt-7">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Color / Variante {selectedColor && <span className="text-brand-strong">· {selectedColor}</span>}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {product.colors.map((color) => {
                    const image = colorImageMap.get(color)
                    const active = selectedColor === color
                    return (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(active ? null : color)}
                        className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition ${
                          active ? 'border-brand bg-brand/10 text-brand-strong' : 'border-border text-muted-foreground hover:border-brand'
                        }`}
                      >
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image} alt="" className="size-5 rounded-full object-cover" />
                        ) : (
                          <span className="size-5 rounded-full bg-brand/20" />
                        )}
                        {color}
                      </button>
                    )
                  })}
                </div>
                {selectedColor && !colorImageMap.has(selectedColor) && (
                  <p className="mt-1.5 text-xs text-muted-foreground">La imagen general se mantiene para esta variante.</p>
                )}
              </div>
            )}

            {/* Ficha técnica (peso / tamaño / peso unitario).
                Se usa <h2> real para la jerarquía de encabezados que Google lee. */}
            <div className="mt-7">
              <h2 className="text-xs font-medium uppercase tracking-widest text-slate-400">Ficha técnica</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                {product.peso && <DetailChip label="Peso" value={product.peso} />}
                {product.tamaño && <DetailChip label="Tamaño" value={product.tamaño} />}
                {product.weight_grams != null && <DetailChip label="Peso unitario" value={`${product.weight_grams} g`} />}
              </div>
            </div>

            {/* Especificaciones JSONB en pares clave-valor (<h2> semántico). */}
            {Object.keys(product.specifications ?? {}).length > 0 && (
              <div className="mt-6">
                <h2 className="text-xs font-medium uppercase tracking-widest text-slate-400">Especificaciones</h2>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {Object.entries(product.specifications ?? {}).map(([key, value]) => (
                    <DetailChip key={key} label={key} value={value} />
                  ))}
                </div>
              </div>
            )}

            {/* Opiniones y valoración (contenido REAL, migración 0052).
                Nunca se inventan reseñas: si no hay dato real, se invita a
                consultar las valoraciones directamente en el marketplace. */}
            <section className="mt-7">
              <h2 className="text-xs font-medium uppercase tracking-widest text-slate-400">Opiniones</h2>

              {typeof product.rating_average === 'number' && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <StarRating value={product.rating_average} size={16} />
                  <span className="text-sm font-semibold">{product.rating_average.toFixed(1)} / 5</span>
                  {typeof product.rating_count === 'number' && product.rating_count > 0 && (
                    <span className="text-xs text-muted-foreground">{product.rating_count} valoraciones</span>
                  )}
                </div>
              )}

              {reviews.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {reviews.map((resena, i) => (
                    <li
                      key={`${resena.autor ?? 'anonimo'}-${i}`}
                      className="rounded-2xl border border-border bg-card p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{resena.autor || 'Comprador'}</span>
                        {typeof resena.valoracion === 'number' && <StarRating value={resena.valoracion} />}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{resena.texto}</p>
                      {resena.fecha && (
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                          {resena.fecha}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {affiliateUrl ? (
                    <>
                      Consulta las valoraciones y opiniones reales de compradores en{' '}
                      <a
                        href={affiliateUrl}
                        target="_blank"
                        rel={AFFILIATE_LINK_REL}
                        className="text-brand-strong underline underline-offset-2"
                      >
                        {market.label}
                      </a>
                      .
                    </>
                  ) : (
                    'Muy pronto habilitaremos las opiniones de nuestros clientes.'
                  )}
                </p>
              )}
            </section>

            {/* CTA afiliado transparente */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={affiliateUrl ?? '#'}
                target={affiliateUrl ? '_blank' : undefined}
                rel={affiliateUrl ? AFFILIATE_LINK_REL : undefined}
                onClick={(e) => {
                  if (!affiliateUrl) {
                    e.preventDefault()
                    add(cartProduct, 'u', 1, selectedColor ?? undefined)
                    return
                  }
                  // Analítica: registro de salida real al marketplace de afiliado.
                  trackAffiliateClick(product.id, affiliateUrl)
                }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-semibold text-brand-foreground transition hover:bg-brand-strong active:scale-[0.99]"
              >
                {affiliateUrl ? <><ExternalLink size={16} /> {ctaLabel}</> : <>Agregar a mi selección <Plus size={16} /></>}
              </a>
              <button
                onClick={() => add(cartProduct, 'u', 1, selectedColor ?? undefined)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                <Plus size={15} /> Agregar a solicitud
              </button>
            </div>

            {affiliateUrl && (
              <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-brand-strong" />
                Serás redirigido a {market.label} en una pestaña nueva para finalizar tu compra de forma 100% segura.
              </p>
            )}
            <p className="mt-2 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
              <Truck size={14} className="shrink-0 text-brand-strong" />
              {affiliateUrl
                ? `Compra internacional con seguimiento vía ${market.label}.`
                : `Envíos a toda Venezuela vía ${brand.name}.`}
            </p>
          </div>
        </div>

        {/* Enlazado interno (SEO): productos de la misma categoría. */}
        <div className="mx-auto max-w-7xl">
          <RelatedProducts products={related} rate={exchangeRate} onAdd={add} />
        </div>

        {/* Navegación cross-categoría (UX moderna + enlazado interno). */}
        <div className="mx-auto max-w-7xl">
          <CategoryNav
            items={categories}
            currentSlug={product.categories[0]?.slug}
            title="Explora más categorías"
          />
        </div>
      </main>

      <SiteFooter footer={footer} brand={{ name: brand.name, address: brandAddress }} social={social} />

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

/** Formatea gramos a una etiqueta legible (g o kg). */
function formatWeight(grams: number): string {
  const value = Number(grams) || 0
  if (value >= 1000) {
    const kg = value / 1000
    return `${Number.isInteger(kg) ? kg : kg.toFixed(2)} kg`
  }
  return `${value} g`
}