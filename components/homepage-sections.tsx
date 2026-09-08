'use client'

import Image from 'next/image'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import type { HomepageConfig, HomepageSegment } from '@/lib/homepage-config'

/** Aplica el fondo (sólido / imagen / gradiente). */
function bgStyle(bg: { backgroundType: string; backgroundSolid?: string; backgroundImage?: string; backgroundGradientFrom?: string; backgroundGradientTo?: string }) {
  if (bg.backgroundType === 'image' && bg.backgroundImage) {
    return { backgroundImage: `url(${bg.backgroundImage})`, backgroundSize: 'cover' as const, backgroundPosition: 'center' as const }
  }
  if (bg.backgroundType === 'gradient') {
    return { backgroundImage: `linear-gradient(135deg, ${bg.backgroundGradientFrom || '#020617'}, ${bg.backgroundGradientTo || '#0891b2'})` }
  }
  return { background: bg.backgroundSolid === 'transparent' ? 'transparent' : bg.backgroundSolid }
}

/** Segmento renderizado en el inicio público. */
function RenderSegment({ segment }: { segment: HomepageSegment }) {
  const style = bgStyle(segment)
  return (
    <section className="px-5 py-16 lg:px-8" style={style}>
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-border p-6">
          {segment.eyebrow && <p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">{segment.eyebrow}</p>}
          {segment.title && <h2 className="mt-3 text-3xl font-semibold tracking-[-.05em]">{segment.title}</h2>}
          {segment.description && <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">{segment.description}</p>}

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
export function StudioSection({ config, studio }: {
  config: HomepageConfig
  studio: { eyebrow?: string; title?: string; items?: { number: string; text: string }[] }
}) {
  const sc = config.studio
  const style = bgStyle(sc)
  const isDark = sc.backgroundType !== 'solid' || (sc.backgroundSolid && sc.backgroundSolid !== 'transparent')
  const textColor = sc.textColor || (isDark ? '#f8fafc' : '')
  const accentColor = sc.accentColor || 'var(--brand-light)'
  const mutedColor = sc.mutedColor || 'var(--navy-muted)'
  const layoutClass = sc.layout === 'text-right' ? 'lg:grid-cols-[1.2fr_.8fr] lg:[&>*:first-child]:order-2' : 'lg:grid-cols-[.8fr_1.2fr]'

  return (
    <section id="studio" className="px-5 py-20 lg:px-8" style={style}>
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

export function HomepageHero({ config, hero, heroImage, brandTagline }: {
  config: HomepageConfig
  hero: { eyebrow?: string; title?: string; titleHighlight?: string; description?: string; primaryButton?: string; primaryHref?: string; secondaryButton?: string; secondaryHref?: string; badge?: string; imageAlt?: string; imageCaption?: string; imagePosition?: string; stats?: { value: string; label: string }[] }
  heroImage: string
  brandTagline: string
}) {
  const hc = config.hero
  const showImage = hc.showImage && hc.layout !== 'text-only' && hc.layout !== 'text-center'
  const align = hc.contentAlign === 'center' ? 'text-center items-center' : hc.contentAlign === 'right' ? 'text-right items-end' : 'text-left items-start'
  const gridCols = showImage && hc.layout === 'text-right-image-left' ? 'lg:grid-cols-[.95fr_1.05fr]' : 'lg:grid-cols-[1.05fr_.95fr]'
  const style = bgStyle(hc)

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
            <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.07em] sm:text-7xl">{hero.title ?? 'Luz que define '}<span className="text-brand">{hero.titleHighlight ?? 'espacios.'}</span></h1>
            {hero.description && <p className="max-w-xl text-base leading-7 text-muted-foreground">{hero.description}</p>}
            {(hero.primaryButton || hero.secondaryButton) && (
              <div className="flex flex-wrap gap-3">
                {hero.primaryButton && <a href={hero.primaryHref ?? '#catalogo'} className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-navy-foreground transition hover:bg-brand hover:text-brand-foreground">{hero.primaryButton} <ArrowUpRight size={16} /></a>}
                {hero.secondaryButton && <a href={hero.secondaryHref ?? '/catalogo'} className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm font-medium">{hero.secondaryButton} <ArrowUpRight size={16} /></a>}
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
            <div className="relative overflow-hidden rounded-[2rem] bg-navy p-5 text-navy-foreground">
              {hc.showBadge && hero.badge && <div className="absolute right-8 top-8 z-10 rounded-full border border-brand-light/30 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-brand-light">{hero.badge}</div>}
              {heroImage ? (
                <Image src={heroImage} alt={hero.imageAlt ?? 'Portada'} width={600} height={600} priority className="aspect-square w-full rounded-[1.5rem] object-cover opacity-90" />
              ) : (
                <div className="grid aspect-square w-full place-items-center rounded-[1.5rem] bg-muted text-navy-muted">Sin imagen</div>
              )}
              <div className="absolute bottom-10 left-10"><p className="font-mono text-xs uppercase tracking-widest text-brand-light">{hero.imagePosition ?? '01 / 03'}</p><p className="mt-2 text-xl font-medium">{hero.imageCaption ?? brandTagline}</p></div>
            </div>
          )}
        </div>
      </section>

      {/* Segmentos personalizados apilables */}
      {config.segments.filter((s) => s.enabled).map((segment) => (
        <RenderSegment key={segment.id} segment={segment} />
      ))}
    </>
  )
}