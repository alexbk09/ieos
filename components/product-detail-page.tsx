'use client'

import { ImagePlus, PackageX, Plus, ShieldCheck, Star, Truck, ExternalLink } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { bolivarsForProduct, formatRate, moneyForProduct } from '@/lib/currency'
import { affiliateCtaKey, marketplaceForUrl } from '@/lib/affiliate'
// Estados de disponibilidad del marketplace (lógica pura compartida).
import { ALI_ESTADO } from '@/lib/ali-availability'
import { AFFILIATE_LINK_REL, SEO_OPTIONAL_SPECS_SECTION } from '@/lib/constants'
// Aísla el párrafo de la ficha técnica (redactado por la IA) del resto de la
// descripción, para mostrarlo en su propia pestaña sin tocar la BD.
import { separarSeccionFichaTecnica } from '@/lib/seo-rules'
// Molécula de pestañas accesible y "SEO-safe" (mantiene ambos paneles en el DOM).
import { Tabs } from '@/components/ui/tabs'
import { useTranslations } from '@/hooks/use-translations'
import { useLocalizedPath } from '@/hooks/use-localized-path'

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
  /**
   * Disponibilidad verificada en el marketplace de afiliado (migración 0058).
   * 'unavailable' = ficha degradada (OutOfStock + alternativas) pero publicada:
   * NUNCA se oculta para no perder la URL indexada.
   */
  ali_status?: 'ok' | 'unavailable' | null
  url_afiliado_ali: string | null
  url_afiliado_amazon: string | null
  url_afiliado_store: string | null
  categories: { id: string; name: string; slug: string; slug_localizado?: string; description: string | null }[]
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
  /**
   * Guías/comparativas donde aparece este producto (enlazado interno
   * BIDIRECCIONAL ficha ↔ entrada). Opcional: si no hay, no se renderiza.
   */
  guides?: { titulo: string; slugLocalizado: string }[]
  /** Categorías para la navegación cross-categoría. */
  categories: CategoryNavItem[]
  navLinks: HeaderNavLink[]
  brand: { name: string; tagline: string; logoUrl: string | null; iconUrl: string | null; whatsapp?: string }
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
function StarRating({ value, size = 14, label }: { value: number; size?: number; label?: string }) {
  const redondeada = Math.round(Math.min(Math.max(Number(value) || 0, 0), 5))
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `Valoración ${Number(value).toFixed(1)} de 5`}>
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
 *    afiliado real en pestaña nueva con rel noopener. Se repite DOS veces a
 *    propósito (junto al precio y al final de la ficha): muchos visitantes no
 *    llegan al CTA inferior, y el segundo acceso se redacta en tono
 *    informativo ("verifica el precio de hoy"), nunca de presión de venta.
 *  - Botón secundario que reusa el carrito híbrido existente para
 *    productos sin afiliado o compras por solicitud/WhatsApp.
 *
 * MONEDA: todo el detalle se lee en DÓLARES. Los productos de afiliado se
 * guardan en EUR (precio real de AliExpress) y se convierten con la
 * configuración central de lib/display-price; la referencia en Bs solo se pinta
 * si la vitrina la publica (SHOW_BOLIVAR_PRICES).
 *
 * NO contiene llamadas a Supabase: todo llega serializado desde el
 * Server Component (regla /services de la arquitectura).
 */
export function ProductDetailPageView({ product, related, guides, categories, navLinks, brand, footer, social, brandAddress }: DetailProductProps) {
  const exchangeRate = useExchangeRate()
  const { cart, add, change, total, count, cartOpen, setCartOpen, popupsBlocked, setPopupsBlocked, finishAffiliateCheckout, clear } = useCart()
  useAgentAddToCart(add)
  // Idioma activo: la miga de pan y los enlaces internos conservan el idioma.
  const t = useTranslations()
  const localizedPath = useLocalizedPath()

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
  // Producto de afiliado: su precio se guarda en EUR (precio real de AliExpress)
  // y se convierte a $ al mostrarlo, igual que en el catálogo.
  const esAfiliado = Boolean(affiliateUrl)

  // Referencia en Bs del precio mostrado: `null` mientras la vitrina trabaje
  // solo en dólares (interruptor central en lib/display-price).
  const bsReference = bolivarsForProduct(product.price_usd, esAfiliado, exchangeRate)

  /**
   * Analítica del CTA de oferta: registra la salida real al marketplace.
   * Se comparte con el CTA temprano para que AMBAS apariciones midan lo mismo.
   */
  const handleOfferClick = () => {
    if (affiliateUrl) trackAffiliateClick(product.id, affiliateUrl)
  }

  // Ficha técnica (peso/tamaño/peso unitario). Si NO hay ningún dato, la
  // sección se OCULTA por completo para no dejar un bloque vacío en la ficha.
  const fichaTecnica = [
    product.peso ? { label: t('product.labelWeight'), value: product.peso } : null,
    product.tamaño ? { label: t('product.labelSize'), value: product.tamaño } : null,
    product.weight_grams != null ? { label: t('product.labelUnitWeight'), value: `${product.weight_grams} g` } : null,
  ].filter((d): d is { label: string; value: string } => d !== null)

  // Especificaciones sin duplicados por mayúsculas/minúsculas (se conserva la 1ª).
  const especificaciones = Object.entries(product.specifications ?? {}).filter(
    ([clave], i, arr) => arr.findIndex(([k]) => k.toLowerCase() === clave.toLowerCase()) === i,
  )

  // --- Pestañas de contenido largo (Descripción / Ficha técnica) ---
  // La IA redacta el párrafo FLUIDO de la ficha técnica DENTRO de la descripción
  // (bajo <h2>Especificaciones físicas</h2>); aquí se aísla en cliente, sin
  // volver a consultar la BD, para mostrarlo en su propia pestaña.
  const { descripcion, fichaTecnica: fichaTecnicaHtml } = useMemo(
    () => separarSeccionFichaTecnica(product.description ?? '', SEO_OPTIONAL_SPECS_SECTION),
    [product.description],
  )

  // Panel de la FICHA TÉCNICA: párrafo de la IA + datos físicos + tabla de specs.
  const panelFichaTecnica = (
    <div className="space-y-6">
      {fichaTecnicaHtml && <RichDescription html={fichaTecnicaHtml} />}
      {fichaTecnica.length > 0 && (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t('product.dataTitle')}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {fichaTecnica.map((dato) => (
              <DetailChip key={dato.label} label={dato.label} value={dato.value} />
            ))}
          </div>
        </div>
      )}
      {especificaciones.length > 0 && (
        <div>
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t('product.specsExtra')}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            {especificaciones.map(([key, value]) => (
              <DetailChip key={key} label={key} value={value} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
  // La pestaña de ficha técnica solo existe si hay algo que mostrar en ella.
  const tieneFichaTecnica = Boolean(fichaTecnicaHtml) || fichaTecnica.length > 0 || especificaciones.length > 0
  // Etiqueta del CTA según el marketplace REAL del enlace (AliExpress/Amazon/tienda):
  // clave i18n compartida con la tabla comparativa y el rail de las guías.
  const ctaLabel = t(affiliateCtaKey(market.id))

  // Producto listo para el carrito híbrido (image_url siempre string en runtime).
  const cartProduct: CartProduct = { ...product, image_url: product.image_url ?? '' }

  const isWeight = product.pricing_type === 'weight'
  const threshold = product.low_stock_threshold || 20
  const stockValue = isWeight ? formatWeight(product.stock_grams) : `${product.stock} ${product.unit_label || 'u'}`
  // Catálogo de afiliados puro: no se gestiona inventario real. Para productos
  // con enlace de afiliado se comunica disponibilidad + envío estimado en vez
  // de un stock falso que rompería la confianza y el "content mismatch" SEO.
  const isAffiliate = Boolean(product.url_afiliado_ali || product.url_afiliado_amazon || product.url_afiliado_store)
  // Verificado como NO disponible en el marketplace (migración 0058): la ficha
  // se degrada (OutOfStock + alternativas) pero NUNCA se oculta, para conservar
  // la URL indexada y no generar soft-404.
  const noDisponible = product.ali_status === ALI_ESTADO.UNAVAILABLE
  // Stock bajo: solo aplica a productos propios (sin afiliado). En afiliados
  // siempre se muestra verde ("Disponible") porque no hay inventario real.
  const lowStock = isAffiliate
    ? false
    : isWeight
      ? (product.min_order_grams > 0 && product.stock_grams < product.min_order_grams * 10)
      : product.stock < threshold
  const stockBadge = noDisponible
    ? t('product.unavailable')
    : isAffiliate
      ? t('product.affiliateAvailability')
      : isWeight
        ? t('product.availableWeight', { weight: stockValue })
        : t('product.stockInStock', { label: stockValue })

  // Alternativas mostradas cuando el producto está caído: se excluyen otros
  // productos también degradados para no encadenar fichas sin stock.
  const alternativas = useMemo(
    () => related.filter((item) => item.ali_status !== ALI_ESTADO.UNAVAILABLE),
    [related],
  )



  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader cartCount={count} onOpenCart={() => setCartOpen(true)} navLinks={navLinks} brand={{ name: brand.name, tagline: brand.tagline, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl }} />

      <main className="mx-auto flex-1 px-5 py-8 lg:px-8">
        {/* Miga de pan semántica (UX + SEO) */}
        <nav aria-label="Ruta" className="mx-auto max-w-7xl">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <li><a href={localizedPath('/')} className="transition-colors hover:text-brand-strong">{t('nav.home')}</a></li>
            <li aria-hidden="true">/</li>
            <li><a href={localizedPath('/catalogo')} className="transition-colors hover:text-brand-strong">{t('nav.catalog')}</a></li>
            {product.categories[0] && (
              <>
                <li aria-hidden="true">/</li>
                {/* La categoría enlaza a su página indexable /categoria/[slug]
                    (pSEO) en lugar de /catalogo, reforzando el enlazado interno. */}
                <li><a href={localizedPath(`/categoria/${product.categories[0].slug_localizado ?? product.categories[0].slug}`)} className="transition-colors hover:text-brand-strong">{product.categories[0].name}</a></li>
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
                    <img src={img.url} alt={t('product.galleryView', { name: product.name, index: i + 1 })} className="aspect-square w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ===== Info + CTA ===== */}
          <div className="flex flex-col">
            <CategoryPill>{product.categories[0]?.name ?? t('product.general')}</CategoryPill>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-.05em] sm:text-4xl">{product.name}</h1>

            {product.marca?.nombre && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t('product.marca')} <span className="font-medium text-foreground">{product.marca.nombre}</span>
              </p>
            )}

            <div className="mt-5 flex items-center gap-3">
              {/* Precio en DÓLARES. Los afiliados se guardan en EUR (target_currency
                  de AliExpress) y se convierten con la configuración central. */}
              <p className="text-3xl font-semibold">{moneyForProduct(product.price_usd, esAfiliado)}</p>
              {product.precio_original && product.precio_original > product.price_usd && (
                <p className="text-lg text-muted-foreground line-through">
                  {moneyForProduct(product.precio_original, esAfiliado)}
                </p>
              )}
              <span className={`ml-auto rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${noDisponible ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' : lowStock ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'}`}>
                {stockBadge}
              </span>
            </div>
            {/* Referencia en bolívares: se omite por completo mientras la vitrina
                solo publique dólares (sin párrafo vacío ni tasa sin uso). */}
            {bsReference && (
              <p className="mt-1 text-sm text-muted-foreground">
                {bsReference} <span className="text-xs opacity-70">· {t('cart.rate', { rate: formatRate(exchangeRate) })}</span>
              </p>
            )}
            {esAfiliado && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('product.priceReferenceNote')}
              </p>
            )}

            {/* ── CTA TEMPRANO (segunda aparición del botón de oferta) ─────────
                POR QUÉ: el CTA principal vive al final de la ficha y buena parte
                del tráfico (sobre todo en móvil) no baja hasta ahí. Repetir el
                acceso justo después de leer el precio —momento de máxima
                intención— recupera a ese visitante SIN presionarlo: el texto
                invita a VERIFICAR/COMPARAR y aclara que aquí no se cobra nada.
                Solo se muestra en productos de afiliado y comprables.
                COLOR: se usa el token --ali (rojo-naranja AliExpress) en los DOS
                accesos al marketplace. Mismo destino → mismo color: el visitante
                reconoce la salida a AliExpress al instante. La jerarquía se marca
                con tamaño y contenedor, no cambiando el tono. */}
            {affiliateUrl && !noDisponible && (
              <div className="mt-5 rounded-3xl border border-ali/30 bg-ali/5 p-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-ali-strong">
                  {t('product.quickCtaEyebrow')}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {t('product.quickCtaBody', { market: market.label })}
                </p>
                <a
                  href={affiliateUrl}
                  target="_blank"
                  rel={AFFILIATE_LINK_REL}
                  onClick={handleOfferClick}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ali px-5 py-3 text-sm font-semibold text-ali-foreground shadow-lg shadow-orange-900/20 transition hover:bg-ali-hover active:scale-[0.99]"
                >
                  <ExternalLink size={15} /> {t('product.quickCtaButton', { market: market.shortLabel })}
                </a>
                <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">
                  {t('product.quickCtaNote')}
                </p>
              </div>
            )}

            {/* La descripción y la ficha técnica se agrupan más abajo en PESTAÑAS
                (ver el bloque <Tabs>), después del selector de color/variante. */}

            {/* Selector de color: muta la imagen principal */}
            {product.colors.length > 0 && (
              <div className="mt-7">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t('product.colorVariant')} {selectedColor && <span className="text-brand-strong">· {selectedColor}</span>}
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
                  <p className="mt-1.5 text-xs text-muted-foreground">{t('product.variantNoImage')}</p>
                )}
              </div>
            )}

            {/* Contenido largo en PESTAÑAS (Descripción / Ficha técnica).
                Ambos paneles quedan en el DOM (el inactivo con `hidden`), así
                Google indexa también el párrafo de la ficha técnica. */}
            {(descripcion || tieneFichaTecnica) && (
              <div className="mt-7">
                {descripcion && tieneFichaTecnica ? (
                  <Tabs
                    ariaLabel={t('product.tabsAria')}
                    items={[
                      { id: 'descripcion', label: t('product.tabDescription'), content: <RichDescription html={descripcion} /> },
                      {
                        id: 'ficha-tecnica',
                        label: t('product.specsTitle'),
                        badge: especificaciones.length > 0 ? especificaciones.length : undefined,
                        content: panelFichaTecnica,
                      },
                    ]}
                  />
                ) : descripcion ? (
                  <RichDescription html={descripcion} />
                ) : (
                  panelFichaTecnica
                )}
              </div>
            )}

            {/* Opiniones y valoración (contenido REAL, migración 0052).
                Nunca se inventan reseñas: si no hay dato real, se invita a
                consultar las valoraciones directamente en el marketplace. */}
            <section className="mt-7">
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t('product.reviews')}</h2>

              {typeof product.rating_average === 'number' && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <StarRating value={product.rating_average} size={16} label={t('product.ratingAria', { value: product.rating_average.toFixed(1) })} />
                  <span className="text-sm font-semibold">{product.rating_average.toFixed(1)} / 5</span>
                  {typeof product.rating_count === 'number' && product.rating_count > 0 && (
                    <span className="text-xs text-muted-foreground">{t('product.ratingCount', { count: product.rating_count })}</span>
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
                        <span className="text-sm font-medium">{resena.autor || t('product.buyer')}</span>
                        {typeof resena.valoracion === 'number' && <StarRating value={resena.valoracion} label={t('product.ratingAria', { value: Number(resena.valoracion).toFixed(1) })} />}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{resena.texto}</p>
                      {resena.fecha && (
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {resena.fecha}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {affiliateUrl ? t('product.reviewsOn', { market: market.label }) : t('product.reviewsSoon')}
                </p>
              )}
            </section>

            {/* CTA afiliado transparente. Si el producto está verificado como NO
                disponible, se muestra un estado bloqueado + aviso + acceso directo
                a las alternativas: la ficha sigue viva (sin soft-404) y el schema
                declara OutOfStock, así el SEO no se perjudica. */}
            {noDisponible ? (
              <div className="mt-8 space-y-3">
                <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
                  <PackageX size={18} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{t('product.unavailableTitle')}</p>
                    <p className="mt-1 text-amber-700/90">{t('product.unavailableBody')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-muted px-6 py-3.5 text-sm font-semibold text-muted-foreground"
                >
                  <PackageX size={16} /> {t('product.unavailable')}
                </button>
                {alternativas.length > 0 && (
                  <a
                    href="#alternativas"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    {t('product.seeAlternatives')}
                  </a>
                )}
              </div>
            ) : (
              <>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  {/* CTA PRINCIPAL. Con enlace de afiliado se pinta con el color
                      del marketplace (--ali: rojo-naranja AliExpress, AA 5.1:1
                      con texto blanco); sin enlace es una acción de la tienda
                      (agregar a la selección) y conserva el color de marca. */}
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
                      // Analítica: mismo evento que el CTA temprano (una sola fuente).
                      handleOfferClick()
                    }}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition active:scale-[0.99] ${affiliateUrl ? 'bg-ali text-ali-foreground shadow-lg shadow-orange-900/20 hover:bg-ali-hover' : 'bg-brand text-brand-foreground hover:brightness-110'}`}
                  >
                    {affiliateUrl ? <><ExternalLink size={16} /> {ctaLabel}</> : <>{t('product.addToSelection')} <Plus size={16} /></>}
                  </a>
       {/*            <button
                    onClick={() => add(cartProduct, 'u', 1, selectedColor ?? undefined)}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-3.5 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    <Plus size={15} /> {t('product.addRequest')}
                  </button> */}
                </div>

                {affiliateUrl && (
                  <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-brand-strong" />
                    {t('product.redirectNote', { market: market.label })}
                  </p>
                )}
                <p className="mt-2 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                  <Truck size={14} className="shrink-0 text-brand-strong" />
                  {affiliateUrl
                    ? t('product.shipInternational', { market: market.label })
                    : t('product.shipLocal', { brand: brand.name })}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Guías donde aparece ESTE producto: cierra el enlazado bidireccional
            (entrada → ficha → entrada) y mejora el descubrimiento interno. */}
        {guides && guides.length > 0 && (
          <section
            aria-labelledby="product-guides-heading"
            className="mx-auto mt-12 max-w-7xl border-t border-border pt-8"
          >
            <h2 id="product-guides-heading" className="text-2xl font-semibold tracking-[-.04em]">
              {t('entry.related')}
            </h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((guide) => (
                <li key={guide.slugLocalizado}>
                  <a
                    href={localizedPath('/guias/' + guide.slugLocalizado)}
                    className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition hover:border-brand/60"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wider text-brand">
                      {t('entry.eyebrow')}
                    </span>
                    <span className="mt-2 font-medium leading-snug group-hover:text-brand">
                      {guide.titulo}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Enlazado interno (SEO): productos de la misma categoría. Cuando el
            producto está caído, este bloque hace de "alternativas" (ancla
            #alternativas) y excluye otros productos también degradados. */}
        <div id="alternativas" className="mx-auto max-w-7xl scroll-mt-24">
          <RelatedProducts products={alternativas} rate={exchangeRate} onAdd={add} />
        </div>

        {/* Navegación cross-categoría (UX moderna + enlazado interno). */}
        <div className="mx-auto max-w-7xl">
          <CategoryNav
            items={categories}
            currentSlug={product.categories[0]?.slug}
            title={t('product.exploreMoreCategories')}
          />
        </div>
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