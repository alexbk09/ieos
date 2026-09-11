'use client'

import Image from 'next/image'
import { ArrowUpRight, BadgeCheck, ChevronRight, Mail, PackageCheck, ShieldCheck, Sparkles, Star, Tag, Truck } from 'lucide-react'
import type { HomepageConfig, HomepageSegment } from '@/lib/homepage-config'
import { ProductCard, type CardProduct } from '@/components/product-card'
import { HOMEPAGE_CATEGORY_GRID_LIMIT } from '@/lib/constants'
import { hexLuminance } from '@/lib/theme'
import { useTranslations } from '@/hooks/use-translations'
import { useLocalizedPath } from '@/hooks/use-localized-path'

/** Aplica el fondo (sólido / imagen / gradiente). Acepta tokens CSS del tema. */
function bgStyle(bg: { backgroundType: string; backgroundSolid?: string; backgroundImage?: string; backgroundGradientFrom?: string; backgroundGradientTo?: string }) {
  if (bg.backgroundType === 'image' && bg.backgroundImage) {
    return { backgroundImage: `url(${bg.backgroundImage})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
  }
  if (bg.backgroundType === 'gradient') {
    return { backgroundImage: `linear-gradient(135deg, ${bg.backgroundGradientFrom || 'var(--surface-1)'}, ${bg.backgroundGradientTo || 'var(--surface-3)'})` }
  }
  return { background: bg.backgroundSolid === 'transparent' ? 'transparent' : bg.backgroundSolid }
}

/**
 * Tokens de superficie PROFUNDOS: los ÚNICOS que exigen texto claro.
 * El resto de tokens (--surface-1/2/3, --card, --background) siguen el tema y
 * heredan --foreground/--muted-foreground, que ya cambian entre claro y oscuro.
 */
const DEEP_SURFACE_TOKENS = ['--surface-deep', '--navy', '--primary']

/** TRUE si un valor de color CSS (token var(), HEX o 'transparent') es oscuro. */
function isDarkColorValue(value?: string): boolean {
  if (!value || value === 'transparent') return false
  // Token del tema: la decisión se toma por el NOMBRE (no por luminancia),
  // porque un mismo token cambia de color según el modo claro/oscuro.
  if (value.includes('var(')) return DEEP_SURFACE_TOKENS.some((token) => value.includes(token))
  if (value.startsWith('#')) return hexLuminance(value) < 0.5
  return false
}

/**
 * Determina si un fondo exige texto claro.
 * - Imagen: se asume oscura (lleva overlay).
 * - Gradiente: oscuro si CUALQUIERA de sus paradas es profunda.
 * - Sólido: se evalúa el token/HEX.
 */
function isDarkBackground(bg: { backgroundType: string; backgroundSolid?: string; backgroundImage?: string; backgroundGradientFrom?: string; backgroundGradientTo?: string }): boolean {
  if (bg.backgroundType === 'image' && bg.backgroundImage) return true
  if (bg.backgroundType === 'gradient') return isDarkColorValue(bg.backgroundGradientFrom) || isDarkColorValue(bg.backgroundGradientTo)
  return isDarkColorValue(bg.backgroundSolid)
}


/** Mapa de íconos para los sellos de confianza (trust-badges). */
const TRUST_ICONS: Record<string, React.ReactNode> = {
  truck: <Truck size={22} />,
  shield: <ShieldCheck size={22} />,
  tag: <Tag size={22} />,
  package: <PackageCheck size={22} />,
  check: <BadgeCheck size={22} />,
}

/**
 * Ancla por defecto de cada tipo de segmento.
 * POR QUÉ: el menú y el footer apuntan a /#como-funciona, /#faq, etc. Si el
 * segmento no lleva `id`, la ancla no existe y el clic no hace nada. Así todo
 * segmento publicado expone un destino estable (sin obligar al admin a definirlo).
 */
const SEGMENT_DEFAULT_ANCHORS: Record<string, string> = {
  'category-grid': 'categorias',
  'product-carousel': 'ofertas',
  'how-it-works': 'como-funciona',
  faq: 'faq',
  testimonials: 'testimonios',
  newsletter: 'newsletter',
  'trust-badges': 'confianza',
}

/** Renderiza una estrella de valoración (testimonios). */
function Stars({ rating }: { rating?: number }) {
  const value = Math.max(0, Math.min(5, Math.round(rating ?? 0)))
  return (
    <div className="flex gap-0.5" aria-label={`${value} de 5 estrellas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={14} className={i < value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'} />
      ))}
    </div>
  )
}

/** Datos externos que alimentan los segmentos dinámicos (categorías/productos). */
export type SegmentData = {
  categories?: { id: string; name: string; slug: string; slug_localizado?: string; description?: string | null }[]
  products?: CardProduct[]
  rate?: number
  onAdd?: (product: CardProduct) => void
  onViewDetails?: (product: CardProduct) => void
}

/** Segmento renderizado en el inicio público. */
function RenderSegment({ segment, data, anchorId }: { segment: HomepageSegment; data?: SegmentData; anchorId?: string }) {
  // Idioma activo: los enlaces internos de los segmentos conservan el idioma.
  const t = useTranslations()
  const localizedPath = useLocalizedPath()
  const style = bgStyle(segment)
  const isDark = isDarkBackground(segment)
  // Texto y acentos por banda: en la banda PROFUNDA usamos los tokens "deep"
  // (texto claro) y en el resto heredamos los del tema, que ya se adaptan solos
  // al modo claro/oscuro (antes el texto suave usaba --navy-muted sobre fondos
  // claros → contraste insuficiente).
  const textColor = segment.textColor || (isDark ? 'var(--surface-deep-foreground)' : '')
  const mutedColor = isDark ? 'var(--surface-deep-muted)' : 'var(--muted-foreground)'
  const accentColor = isDark ? 'var(--brand-light)' : 'var(--brand-strong)'
  // Sobre bandas profundas el contenido va en un panel translúcido para que
  // respire; en el resto NO ponemos marco: la banda tonal ya separa secciones.
  const cardClass = isDark
    ? 'rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm'
    : 'rounded-3xl p-6'


  // --- category-grid: vitrina de categorías (pSEO → /categoria/[slug]) ---
  const categories = (data?.categories ?? []).filter((c) => !segment.categorySlugs || segment.categorySlugs.length === 0 || segment.categorySlugs.includes(c.slug))

  // --- product-carousel: productos curados (fallback: destacados) ---
  const carouselProducts = (() => {
    const all = data?.products ?? []
    if (segment.productSlugs && segment.productSlugs.length > 0) {
      const bySlug = all.filter((p) => segment.productSlugs!.includes(p.slug))
      if (bySlug.length > 0) return bySlug
    }
    return all
  })()

  return (
    <section id={anchorId} className="px-5 py-16 lg:px-8" style={style}>
      <div className="mx-auto max-w-7xl">
        <div className={cardClass}>
          {segment.eyebrow && <p className="font-mono text-xs uppercase tracking-[.25em]" style={{ color: accentColor }}>{segment.eyebrow}</p>}

          {segment.title && <h2 className="mt-3 text-3xl font-semibold tracking-[-.05em]" style={{ color: textColor }}>{segment.title}</h2>}
          {segment.description && <p className="mt-4 max-w-2xl leading-7 text-muted-foreground" style={{ color: mutedColor }}>{segment.description}</p>}

          {segment.type === 'image-text' && segment.imageUrl && (
            <div className="mt-6 overflow-hidden rounded-2xl">
              <Image src={segment.imageUrl} alt={segment.imageAlt ?? ''} width={800} height={450} className="aspect-video w-full object-cover" />
              {segment.imageCaption && <p className="bg-navy px-4 py-3 font-mono text-xs uppercase tracking-widest text-navy-foreground">{segment.imageCaption}</p>}
            </div>
          )}

          {segment.stats && segment.stats.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {segment.stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-border p-4">
                  <p className="text-2xl font-semibold">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* category-grid: vitrina CURADA (nunca volcamos 200 categorías) */}
          {segment.type === 'category-grid' && (
            <>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {categories.slice(0, HOMEPAGE_CATEGORY_GRID_LIMIT).map((cat) => (
                  <a
                    key={cat.id}
                    href={localizedPath(`/categoria/${cat.slug_localizado ?? cat.slug}`)}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-brand hover:bg-brand/5"
                  >
                    <div>
                      <p className="font-semibold transition-colors group-hover:text-brand-strong">{cat.name}</p>
                      {cat.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{cat.description}</p>}
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-brand-strong" />
                  </a>
                ))}
                {categories.length === 0 && (
                  <p className="col-span-full text-sm text-muted-foreground">{t('home.noCategories')}</p>
                )}
              </div>
              {/* Con más categorías que el tope, no las listamos todas: enlazamos
                  al catálogo (mejor UX y sin diluir el enlazado interno). */}
              {categories.length > HOMEPAGE_CATEGORY_GRID_LIMIT && (
                <div className="mt-8">
                  <a
                    href={localizedPath('/catalogo')}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-medium transition-colors hover:border-brand hover:text-brand-strong"
                  >
                    {t('home.viewAllCategories', { count: categories.length })} <ArrowUpRight size={16} />
                  </a>
                </div>
              )}
            </>
          )}

          {/* product-carousel */}
          {segment.type === 'product-carousel' && (
            <div className="mt-6">
              {segment.carouselLabel && <p className="mb-4 font-mono text-xs uppercase tracking-[.25em] text-brand-strong">{segment.carouselLabel}</p>}
              {carouselProducts.length > 0 ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {carouselProducts.slice(0, 6).map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      rate={data?.rate ?? 0}
                      onAdd={data?.onAdd ?? (() => {})}
                      onViewDetails={data?.onViewDetails ?? (() => {})}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No hay productos destacados todavía.</p>
              )}
            </div>
          )}

          {/* trust-badges */}
          {segment.type === 'trust-badges' && segment.badges && segment.badges.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {segment.badges.map((badge, i) => (
                <div key={i} className="flex items-start gap-3 rounded-2xl border border-border p-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-strong">
                    {TRUST_ICONS[badge.icon] ?? <BadgeCheck size={22} />}
                  </span>
                  <div>
                    <p className="font-semibold">{badge.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{badge.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* how-it-works */}
          {segment.type === 'how-it-works' && segment.steps && segment.steps.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {segment.steps.map((step) => (
                <div key={step.number} className="rounded-2xl border border-border p-5">
                  <p className="font-mono text-3xl font-semibold" style={{ color: accentColor }}>{step.number}</p>
                  <p className="mt-3 font-semibold">{step.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* faq */}
          {segment.type === 'faq' && segment.faqItems && segment.faqItems.length > 0 && (
            <div className="mt-6 grid gap-3">
              {segment.faqItems.map((item, i) => (
                <details key={i} className="group rounded-2xl border border-border bg-card px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                    {item.question}
                    <ChevronRight size={16} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.answer}</p>
                </details>
              ))}
            </div>
          )}

          {/* testimonials */}
          {segment.type === 'testimonials' && segment.testimonials && segment.testimonials.length > 0 && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {segment.testimonials.map((t, i) => (
                <figure key={i} className="flex flex-col gap-3 rounded-2xl border border-border p-5">
                  <Stars rating={t.rating} />
                  <blockquote className="text-sm leading-6 text-muted-foreground">“{t.text}”</blockquote>
                  <figcaption className="mt-auto flex items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand-strong">
                      {t.name.charAt(0)}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      {t.role && <p className="text-xs text-muted-foreground">{t.role}</p>}
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {/* newsletter */}
          {segment.type === 'newsletter' && (
            <form
              className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault()
                const input = (e.currentTarget.elements.namedItem('email') as HTMLInputElement)?.value
                if (input) window.location.href = `mailto:?subject=Quiero%20recibir%20ofertas&body=${encodeURIComponent(input)}`
              }}
            >
              <input
                type="email"
                name="email"
                required
                placeholder={segment.newsletterPlaceholder ?? 'tu@correo.com'}
                className="flex-1 rounded-full border border-border bg-card px-5 py-3 text-sm outline-none focus:border-brand"
              />
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-navy-foreground transition hover:bg-brand hover:text-brand-foreground">
                <Mail size={15} /> {segment.newsletterButton ?? 'Suscribirme'}
              </button>
            </form>
          )}

          {(segment.primaryButton || segment.secondaryButton) && (
            <div className="mt-6 flex flex-wrap gap-3">
              {segment.primaryButton && <a href={segment.primaryHref ?? '#contacto'} className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-navy-foreground hover:bg-brand hover:text-brand-foreground">{segment.primaryButton} <ArrowUpRight size={16} /></a>}
              {segment.secondaryButton && <a href={segment.secondaryHref ?? '/catalogo'} className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-medium">{segment.secondaryButton} <ArrowUpRight size={16} /></a>}
            </div>
          )}

          {segment.quote && (
            <blockquote className="mt-6 border-l-4 border-brand pl-4">
              <p className="text-xl italic">“{segment.quote}”</p>
              {segment.quoteAuthor && <footer className="mt-2 text-sm text-muted-foreground">— {segment.quoteAuthor}</footer>}
            </blockquote>
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * Renderiza la portada personalizada y los segmentos del inicio.
 * Usado por el Storefront para reflejar exactly what el admin configuró.
 */
export function StudioSection({ config, studio, anchorId = 'studio' }: {
  config: HomepageConfig
  studio: { eyebrow?: string; title?: string; items?: { number: string; text: string }[] }
  /** Ancla del bloque (por defecto 'studio'; la home la usa como 'como-funciona'). */
  anchorId?: string
}) {
  const sc = config.studio
  const style = bgStyle(sc)
  const isDark = isDarkBackground(sc)
  const textColor = sc.textColor || (isDark ? 'var(--surface-deep-foreground)' : '')
  const accentColor = sc.accentColor || (isDark ? 'var(--brand-light)' : 'var(--brand-strong)')
  const mutedColor = sc.mutedColor || (isDark ? 'var(--surface-deep-muted)' : 'var(--muted-foreground)')

  const layoutClass = sc.layout === 'text-right' ? 'lg:grid-cols-[1.2fr_.8fr] lg:[&>*:first-child]:order-2' : 'lg:grid-cols-[.8fr_1.2fr]'

  return (
    <section id={anchorId} className="px-5 py-20 lg:px-8" style={style}>
      <div className={`mx-auto grid max-w-7xl gap-12 ${layoutClass} lg:items-end`}>
        <div>
          {studio.eyebrow && <p className="font-mono text-xs uppercase tracking-[.25em]" style={{ color: accentColor }}>{studio.eyebrow}</p>}
          {studio.title && <h2 className="mt-4 text-4xl font-semibold tracking-[-.06em]" style={{ color: textColor }}>{studio.title}</h2>}
        </div>
        <div className="grid gap-8 sm:grid-cols-3">
          {studio.items?.map((item) => (
            <div key={item.number}>
              <p className="text-3xl font-semibold" style={{ color: accentColor }}>{item.number}</p>
              <p className="mt-3 text-sm leading-6" style={{ color: mutedColor }}>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HomepageHero({ config, hero, heroImage, brandTagline, brandName, brandLogoUrl, brandIconUrl, data }: {
  config: HomepageConfig
  hero: { eyebrow?: string; title?: string; titleHighlight?: string; description?: string; primaryButton?: string; primaryHref?: string; secondaryButton?: string; secondaryHref?: string; badge?: string; imageAlt?: string; imageCaption?: string; imagePosition?: string; stats?: { value: string; label: string }[] }
  heroImage: string
  brandTagline: string
  /** Nombre de marca (alt accesible del logo en el visual de portada). */
  brandName?: string
  /** Wordmark del header (se usa como visual de portada si no hay imagen). */
  brandLogoUrl?: string | null
  /** Isotipo (favicon) del sitio: protagonista del visual sin marco. */
  brandIconUrl?: string | null
  data?: SegmentData
}) {
  const hc = config.hero
  // Idioma activo: los enlaces internos del hero conservan el idioma.
  const t = useTranslations()
  const localizedPath = useLocalizedPath()
  const showImage = hc.showImage && hc.layout !== 'text-only' && hc.layout !== 'text-center'
  const align = hc.contentAlign === 'center' ? 'text-center items-center' : hc.contentAlign === 'right' ? 'text-right items-end' : 'text-left items-start'
  const gridCols = showImage && hc.layout === 'text-right-image-left' ? 'lg:grid-cols-[.95fr_1.05fr]' : 'lg:grid-cols-[1.05fr_.95fr]'
  const style = bgStyle(hc)

  /**
   * Ancla estable por tipo de segmento: solo el PRIMER segmento habilitado de
   * cada tipo la recibe (evita ids duplicados). Así /#como-funciona o /#faq
   * siempre resuelven si el segmento está publicado.
   */
  const anchorsBySegment = (() => {
    const used = new Set<string>()
    const map = new Map<string, string>()
    for (const segment of config.segments.filter((s) => s.enabled)) {
      const base = SEGMENT_DEFAULT_ANCHORS[segment.type]
      if (base && !used.has(base)) {
        used.add(base)
        map.set(segment.id, base)
      }
    }
    return map
  })()

  return (
    <>
      <section id="inicio" className="relative px-5 pb-20 pt-16 lg:px-8 lg:pb-28 lg:pt-24">
        {hc.backgroundType === 'image' && hc.backgroundImage && (
          <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url(${hc.backgroundImage})` }}>
            {hc.overlay && <div className="absolute inset-0 bg-black/50" />}
          </div>
        )}
        {hc.backgroundType === 'gradient' && (
          <div className="absolute inset-0 -z-10" style={style} />
        )}
        {hc.backgroundType === 'solid' && hc.backgroundSolid !== 'transparent' && (
          <div className="absolute inset-0 -z-10" style={style} />
        )}

        <div className={`mx-auto grid max-w-7xl gap-12 ${showImage ? gridCols : 'grid-cols-1'} lg:items-center`}>
          <div className={`flex flex-col gap-5 ${align}`}>
            {hero.eyebrow && <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[.28em] text-brand-strong"><Sparkles size={14} /> {hero.eyebrow}</p>}
            <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.07em] sm:text-7xl">{hero.title ?? 'Las mejores ofertas de AliExpress, '}<span className="text-brand">{hero.titleHighlight ?? 'curadas para ti.'}</span></h1>
            {hero.description && <p className="max-w-xl text-base leading-7 text-muted-foreground">{hero.description}</p>}
            {(hero.primaryButton || hero.secondaryButton) && (
              <div className="flex flex-wrap gap-3">
                {hero.primaryButton && <a href={hero.primaryHref ?? '#catalogo'} className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-navy-foreground transition hover:bg-brand hover:text-brand-foreground">{hero.primaryButton} <ArrowUpRight size={16} /></a>}
                {hero.secondaryButton && <a href={hero.secondaryHref ?? localizedPath('/catalogo')} className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-medium">{hero.secondaryButton} <ArrowUpRight size={16} /></a>}
              </div>
            )}
            {hc.showStats && hero.stats && hero.stats.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-10 border-t border-border pt-5">
                {hero.stats.map((stat) => (
                  <div key={stat.label}><p className="text-2xl font-semibold">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.label}</p></div>
                ))}
              </div>
            )}
          </div>
          {showImage && (
            /* VISUAL DE PORTADA: sin marco ni placa oscura. Si el admin sube una
               imagen se muestra limpia con sombra suave; si no, el protagonista
               es el LOGO de la marca sobre un halo difuso (nunca una caja). */
            <div className="relative flex items-center justify-center">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 opacity-40 blur-3xl"
                style={{ background: 'radial-gradient(closest-side, var(--brand-light), transparent)' }}
              />
              {heroImage ? (
                <Image
                  src={heroImage}
                  alt={hero.imageAlt ?? 'Portada'}
                  width={720}
                  height={720}
                  priority
                  className="aspect-square w-full max-w-lg rounded-[2rem] object-cover shadow-2xl"
                />
              ) : (
                <div className="flex flex-col items-center gap-6 py-6 text-center">
                  {brandLogoUrl ? (
                    /* El WORDMARK es el protagonista: grande y sin marco. */
                    <Image
                      src={brandLogoUrl}
                      alt={brandName ?? 'Logotipo'}
                      width={520}
                      height={208}
                      priority
                      className="h-16 w-auto object-contain dark:invert sm:h-20"
                    />
                  ) : brandIconUrl ? (
                    <Image
                      src={brandIconUrl}
                      alt={brandName ?? 'Logotipo'}
                      width={288}
                      height={288}
                      priority
                      className="size-32 w-auto drop-shadow-[0_20px_50px_rgba(2,6,23,.28)] sm:size-40"
                    />
                  ) : null}
                  {(hero.imageCaption || brandTagline) && (
                    <p className="text-sm font-medium text-muted-foreground">{hero.imageCaption ?? brandTagline}</p>
                  )}
                </div>
              )}
              {hc.showBadge && hero.badge && (
                <div className="absolute right-0 top-0 rounded-full border border-brand/40 bg-background/80 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-brand-strong backdrop-blur">
                  {hero.badge}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Segmentos personalizados apilables (con ancla estable por tipo). */}
      {config.segments.filter((s) => s.enabled).map((segment) => (
        <RenderSegment key={segment.id} segment={segment} data={data} anchorId={anchorsBySegment.get(segment.id)} />
      ))}
    </>
  )
}
