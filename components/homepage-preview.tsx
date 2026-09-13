'use client'

import Image from 'next/image'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import type { HomepageConfig, HomepageSegment } from '@/lib/homepage-config'

/** Aplica el estilo de fondo (sólido / imagen / gradiente) de un bloque. */
function bgStyle(bg: { backgroundType: 'solid' | 'image' | 'gradient'; backgroundSolid: string; backgroundImage: string; backgroundGradientFrom: string; backgroundGradientTo: string; overlay?: boolean }) {
  if (bg.backgroundType === 'image' && bg.backgroundImage) {
    return {
      backgroundImage: `url(${bg.backgroundImage})`,
      backgroundSize: 'cover' as const,
      backgroundPosition: 'center' as const,
    }
  }
  if (bg.backgroundType === 'gradient') {
    return { backgroundImage: `linear-gradient(135deg, ${bg.backgroundGradientFrom || '#020617'}, ${bg.backgroundGradientTo || '#0891b2'})` }
  }
  return { background: bg.backgroundSolid || 'transparent' }
}

/** Render de un segmento en el preview. */
function SegmentPreview({ segment }: { segment: HomepageSegment }) {
  const style = bgStyle(segment)

  return (
    <div className="rounded-3xl border border-border p-6" style={style}>
      {segment.eyebrow && <p className="font-mono text-[10px] uppercase tracking-widest text-brand-strong">{segment.eyebrow}</p>}
      {segment.title && <p className="mt-2 text-xl font-semibold tracking-tight">{segment.title}</p>}
      {segment.description && <p className="mt-2 text-xs leading-5 text-muted-foreground">{segment.description}</p>}
      {segment.imageUrl && (
        <div className="mt-4 rounded-2xl bg-muted">
          <Image src={segment.imageUrl} alt={segment.imageAlt ?? ''} width={400} height={300} className="aspect-video w-full rounded-2xl object-cover" />
          {segment.imageCaption && <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{segment.imageCaption}</p>}
        </div>
      )}
      {segment.stats && segment.stats.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {segment.stats.map((s, i) => (
            <div key={i} className="rounded-2xl bg-background/10 p-3">
              <p className="text-lg font-semibold">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}
      {(segment.primaryButton || segment.secondaryButton) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {segment.primaryButton && <span className="inline-flex items-center gap-1 rounded-full bg-navy px-3 py-1.5 text-[10px] font-semibold text-navy-foreground">{segment.primaryButton}<ArrowUpRight size={11} /></span>}
          {segment.secondaryButton && <span className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold">{segment.secondaryButton}</span>}
        </div>
      )}
      {segment.quote && (
        <blockquote className="mt-3 border-l-2 border-brand pl-3">
          <p className="text-sm italic">“{segment.quote}”</p>
          {segment.quoteAuthor && <footer className="mt-1 text-[10px] text-muted-foreground">— {segment.quoteAuthor}</footer>}
        </blockquote>
      )}

      {/* category-grid: chips de categorías */}
      {segment.type === 'category-grid' && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(segment.categorySlugs ?? []).length > 0
            ? segment.categorySlugs!.map((slug) => (
                <span key={slug} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[10px] font-medium">{slug}<ArrowUpRight size={10} /></span>
              ))
            : <span className="text-[10px] text-muted-foreground">Mostrará todas las categorías activas</span>}
        </div>
      )}

      {/* product-carousel: chips de productos */}
      {segment.type === 'product-carousel' && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(segment.productSlugs ?? []).length > 0
            ? segment.productSlugs!.map((slug) => (
                <span key={slug} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[10px] font-medium">{slug}<ArrowUpRight size={10} /></span>
              ))
            : <span className="text-[10px] text-muted-foreground">Mostrará los productos destacados</span>}
        </div>
      )}

      {/* trust-badges: sellos */}
      {segment.type === 'trust-badges' && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(segment.badges ?? []).map((b, i) => (
            <div key={i} className="rounded-xl border border-border p-2 text-center">
              <p className="text-[10px] font-semibold">{b.title || 'Sello'}</p>
              {b.text && <p className="mt-0.5 text-[9px] leading-3 text-muted-foreground">{b.text}</p>}
            </div>
          ))}
        </div>
      )}

      {/* how-it-works: pasos */}
      {segment.type === 'how-it-works' && (
        <div className="mt-4 grid gap-2">
          {(segment.steps ?? []).map((s, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-border p-2">
              <span className="font-mono text-sm font-semibold text-brand-strong">{s.number}</span>
              <div>
                <p className="text-[11px] font-semibold">{s.title}</p>
                {s.text && <p className="text-[10px] text-muted-foreground">{s.text}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* faq: preguntas */}
      {segment.type === 'faq' && (
        <div className="mt-4 grid gap-2">
          {(segment.faqItems ?? []).map((f, i) => (
            <div key={i} className="rounded-xl border border-border p-2">
              <p className="text-[11px] font-semibold">{f.question || 'Pregunta'}</p>
              {f.answer && <p className="mt-0.5 text-[10px] text-muted-foreground">{f.answer}</p>}
            </div>
          ))}
        </div>
      )}

      {/* testimonials: prueba social */}
      {segment.type === 'testimonials' && (
        <div className="mt-4 grid gap-2">
          {(segment.testimonials ?? []).map((t, i) => (
            <div key={i} className="rounded-xl border border-border p-2">
              <p className="text-[10px] text-amber-500">{'★'.repeat(Math.max(1, Math.min(5, t.rating ?? 5)))}</p>
              <p className="mt-1 text-[10px] italic text-muted-foreground">“{t.text || 'Testimonio'}”</p>
              <p className="mt-1 text-[10px] font-semibold">{t.name}{t.role ? ` · ${t.role}` : ''}</p>
            </div>
          ))}
        </div>
      )}

      {/* newsletter */}
      {segment.type === 'newsletter' && (
        <div className="mt-4 flex gap-2">
          <span className="flex-1 rounded-full border border-border px-3 py-1.5 text-[10px] text-muted-foreground">{segment.newsletterPlaceholder || 'tu@correo.com'}</span>
          <span className="inline-flex items-center rounded-full bg-navy px-3 py-1.5 text-[10px] font-semibold text-navy-foreground">{segment.newsletterButton || 'Suscribirme'}</span>
        </div>
      )}
    </div>
  )
}


/**
 * Preview en vivo del inicio personalizado.
 * Recibe la configuración y muestra cómo se verá la portada y los segmentos.
 */
export function HomepagePreview({ config, heroTexts, heroImage }: {
  config: HomepageConfig
  heroTexts: { eyebrow?: string; title?: string; titleHighlight?: string; description?: string; primaryButton?: string; primaryHref?: string; secondaryButton?: string; secondaryHref?: string; badge?: string; stats?: { value: string; label: string }[] }
  heroImage: string
}) {
  const hero = config.hero
  const showImage = hero.showImage && hero.layout !== 'text-only' && hero.layout !== 'text-center'
  const contentAlign = hero.contentAlign === 'center' ? 'text-center items-center' : hero.contentAlign === 'right' ? 'text-right items-end' : 'text-left items-start'
  const layoutClass = hero.layout === 'text-right-image-left' && showImage ? 'lg:grid-cols-[.95fr_1.05fr]' : 'lg:grid-cols-[1.05fr_.95fr]'

  return (
    <div className="space-y-4">
      {/* Portada */}
      <div className="overflow-hidden rounded-3xl border border-border">
        <div className="relative px-6 py-10" style={bgStyle(hero)}>
          {hero.backgroundType === 'image' && hero.backgroundImage && hero.overlay && (
            <div className="absolute inset-0 bg-black/50" />
          )}
          <div className={`relative mx-auto grid max-w-4xl gap-8 ${showImage ? layoutClass : 'grid-cols-1'} lg:items-center`}>
            <div className={`flex flex-col gap-3 ${contentAlign}`}>
              {heroTexts.eyebrow && <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.25em] text-brand-strong"><Sparkles size={12} /> {heroTexts.eyebrow}</p>}
              <p className="text-3xl font-semibold leading-[1.05] tracking-[-.04em] sm:text-4xl">
                {heroTexts.title}
                {heroTexts.titleHighlight && <span className="text-brand-strong">{heroTexts.titleHighlight}</span>}
              </p>
              {heroTexts.description && <p className="max-w-md text-sm leading-6 text-muted-foreground">{heroTexts.description}</p>}
              {(heroTexts.primaryButton || heroTexts.secondaryButton) && (
                <div className="flex flex-wrap gap-2">
                  {heroTexts.primaryButton && <span className="inline-flex items-center gap-1 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-navy-foreground">{heroTexts.primaryButton}<ArrowUpRight size={13} /></span>}
                  {heroTexts.secondaryButton && <span className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-xs font-semibold">{heroTexts.secondaryButton}</span>}
                </div>
              )}
              {hero.showStats && heroTexts.stats && heroTexts.stats.length > 0 && (
                <div className="flex gap-6 border-t border-border pt-3">
                  {heroTexts.stats.map((s) => (
                    <div key={s.label}>
                      <p className="text-lg font-semibold">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {showImage && (
              <div className="overflow-hidden rounded-2xl bg-navy p-3">
                <div className="relative">
                  {heroImage ? (
                    <Image src={heroImage} alt={heroTexts.title ?? 'Portada'} width={400} height={400} className="aspect-square w-full rounded-xl object-cover" />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center rounded-xl bg-muted text-xs text-muted-foreground">Sin imagen</div>
                  )}
                  {hero.showBadge && heroTexts.badge && (
                    <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[8px] uppercase tracking-widest text-white">{heroTexts.badge}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Segmentos */}
      {config.segments.filter((s) => s.enabled).map((segment) => (
        <SegmentPreview key={segment.id} segment={segment} />
      ))}

      {config.segments.length === 0 && (
        <div className="grid place-items-center rounded-3xl border border-dashed border-border py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">Aún no hay segmentos.</p>
          <p className="mt-1 text-xs text-muted-foreground/70">Agrega secciones con imagen + texto, estadísticas, CTA o frases desde el editor.</p>
        </div>
      )}
    </div>
  )
}