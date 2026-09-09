'use client'

import { useState } from 'react'
import { Eye, Upload, X } from 'lucide-react'
import type { HomepageConfig, HomepageSegment, SegmentType, HeroLayout, BackgroundType } from '@/lib/homepage-config'
import { createSegment, moveSegment } from '@/lib/homepage-config'
import { HomepagePreview } from '@/components/homepage-preview'
import { cn } from '@/lib/utils'

const SEGMENT_TYPES: { type: SegmentType; label: string }[] = [
  { type: 'text', label: 'Texto' },
  { type: 'image-text', label: 'Imagen + texto' },
  { type: 'stats', label: 'Estadísticas' },
  { type: 'cta', label: 'Llamada a la acción' },
  { type: 'quote', label: 'Frase / Cita' },
  // --- Tipos orientados a tienda de afiliados (SEO/UX) ---
  { type: 'category-grid', label: 'Grilla de categorías' },
  { type: 'product-carousel', label: 'Productos destacados' },
  { type: 'trust-badges', label: 'Sellos de confianza' },
  { type: 'how-it-works', label: 'Cómo funciona' },
  { type: 'faq', label: 'Preguntas frecuentes' },
  { type: 'testimonials', label: 'Testimonios' },
  { type: 'newsletter', label: 'Newsletter' },
]


const HERO_LAYOUTS: { value: HeroLayout; label: string }[] = [
  { value: 'text-left-image-right', label: 'Texto izq · Imagen der' },
  { value: 'text-right-image-left', label: 'Texto der · Imagen izq' },
  { value: 'text-center', label: 'Texto centrado' },
  { value: 'text-only', label: 'Solo texto' },
]

const BG_TYPES: { value: BackgroundType; label: string }[] = [
  { value: 'solid', label: 'Color sólido' },
  { value: 'image', label: 'Imagen' },
  { value: 'gradient', label: 'Degradado' },
]

async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/admin/upload', { method: 'POST', body: form })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'No se pudo subir la imagen')
  return result.url
}

export function HomepageConfigManager({
  value,
  onChange,
  heroTexts,
  heroImage,
}: {
  value: HomepageConfig
  onChange: (config: HomepageConfig) => void
  heroTexts: { eyebrow?: string; title?: string; titleHighlight?: string; description?: string; primaryButton?: string; primaryHref?: string; secondaryButton?: string; secondaryHref?: string; badge?: string; stats?: { value: string; label: string }[] }
  heroImage: string
}) {
  const [showPreview, setShowPreview] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)

  function setHeroField<K extends keyof HomepageConfig['hero']>(key: K, val: HomepageConfig['hero'][K]) {
    onChange({ ...value, hero: { ...value.hero, [key]: val } })
  }

  function updateSegment(id: string, patch: Partial<HomepageSegment>) {
    onChange({ ...value, segments: value.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }

  function addSegment(type: SegmentType) {
    onChange({ ...value, segments: [...value.segments, createSegment(type)] })
  }

  function removeSegment(id: string) {
    onChange({ ...value, segments: value.segments.filter((s) => s.id !== id) })
  }

  function reorderSegment(index: number, dir: -1 | 1) {
    const to = index + dir
    if (to < 0 || to >= value.segments.length) return
    onChange({ ...value, segments: moveSegment(value.segments, index, to) })
  }

  async function handleUpload(field: string, file?: File | null) {
    if (!file) return
    setUploading(field)
    try {
      const url = await uploadImage(file)
      if (field === 'hero-bg') setHeroField('backgroundImage', url)
      else {
        const [segId, segField] = field.split(':')
        updateSegment(segId, { [segField]: url } as Partial<HomepageSegment>)
      }
    } catch (err) {
      console.error('Error subiendo imagen:', err)
    } finally {
      setUploading(null)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="grid gap-6">
        {/* Layout de portada */}
        <section className="rounded-3xl border border-border p-5">
          <p className="text-sm font-semibold">Layout de portada</p>
          <p className="mt-1 text-xs text-muted-foreground">Elige cómo se distribuyen el texto y la imagen.</p>
          <div className="mt-4 grid gap-2">
            {HERO_LAYOUTS.map((opt) => (
              <button key={opt.value} onClick={() => setHeroField('layout', opt.value)} className={cn('flex items-center justify-between rounded-2xl border px-4 py-2.5 text-left text-sm font-medium transition-colors', value.hero.layout === opt.value ? 'border-brand bg-brand/10 text-brand' : 'border-border hover:bg-muted')}>
                {opt.label}
                {value.hero.layout === opt.value && <span className="text-brand">✓</span>}
              </button>
            ))}
          </div>
        </section>

        {/* Fondo de portada */}
        <section className="rounded-3xl border border-border p-5">
          <p className="text-sm font-semibold">Fondo de portada</p>
          <div className="mt-3 grid gap-2">
            {BG_TYPES.map((opt) => (
              <button key={opt.value} onClick={() => setHeroField('backgroundType', opt.value)} className={cn('flex items-center justify-between rounded-2xl border px-4 py-2 text-left text-sm font-medium transition-colors', value.hero.backgroundType === opt.value ? 'border-brand bg-brand/10 text-brand' : 'border-border hover:bg-muted')}>
                {opt.label}
                {value.hero.backgroundType === opt.value && <span className="text-brand">✓</span>}
              </button>
            ))}
          </div>

          {value.hero.backgroundType === 'solid' && (
            <label className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
              <input type="color" value={value.hero.backgroundSolid} onChange={(e) => setHeroField('backgroundSolid', e.target.value)} className="size-10 cursor-pointer rounded-lg border-0 bg-transparent" />
              <span className="text-sm">{value.hero.backgroundSolid}</span>
              <span className="ml-auto text-xs text-muted-foreground">Color de fondo</span>
            </label>
          )}

          {value.hero.backgroundType === 'image' && (
            <div className="mt-4 grid gap-3">
              {value.hero.backgroundImage && (
                <div className="flex items-center gap-3 rounded-2xl border border-border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={value.hero.backgroundImage} alt="Fondo" className="h-14 w-20 rounded-xl object-cover" />
                  <button onClick={() => setHeroField('backgroundImage', '')} className="grid size-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><X size={14} /></button>
                </div>
              )}
              <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">
                {uploading === 'hero-bg' ? 'Subiendo…' : 'Subir imagen de fondo'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload('hero-bg', e.target.files?.[0])} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={value.hero.overlay} onChange={(e) => setHeroField('overlay', e.target.checked)} className="accent-brand" />
                Oscurecer fondo para legibilidad
              </label>
            </div>
          )}

          {value.hero.backgroundType === 'gradient' && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-2">
                <input type="color" value={value.hero.backgroundGradientFrom} onChange={(e) => setHeroField('backgroundGradientFrom', e.target.value)} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent" />
                <span className="text-xs">Desde</span>
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-2">
                <input type="color" value={value.hero.backgroundGradientTo} onChange={(e) => setHeroField('backgroundGradientTo', e.target.value)} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent" />
                <span className="text-xs">Hasta</span>
              </label>
            </div>
          )}
        </section>

        {/* Contenido visible */}
        <section className="rounded-3xl border border-border p-5">
          <p className="text-sm font-semibold">Contenido visible</p>
          <div className="mt-3 grid gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={value.hero.showBadge} onChange={(e) => setHeroField('showBadge', e.target.checked)} className="accent-brand" />
              Mostrar badge (esquina)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={value.hero.showStats} onChange={(e) => setHeroField('showStats', e.target.checked)} className="accent-brand" />
              Mostrar estadísticas
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={value.hero.showImage} onChange={(e) => setHeroField('showImage', e.target.checked)} className="accent-brand" />
              Mostrar imagen principal
            </label>
          </div>
        </section>

        {/* Segmentos */}
        <section className="rounded-3xl border border-border p-5">
          <p className="text-sm font-semibold">Segmentos del inicio</p>
          <p className="mt-1 text-xs text-muted-foreground">Agrega secciones con imagen + texto, estadísticas, CTA o frases.</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {SEGMENT_TYPES.map((opt) => (
              <button key={opt.type} onClick={() => addSegment(opt.type)} className="inline-flex h-9 items-center gap-1 rounded-xl border border-border px-3 text-xs font-medium transition-colors hover:border-brand hover:text-brand">
                + {opt.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3">
            {value.segments.map((segment, i) => (
              <div key={segment.id} className={cn('rounded-2xl border p-4', !segment.enabled && 'opacity-50')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{SEGMENT_TYPES.find((t) => t.type === segment.type)?.label}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => reorderSegment(i, -1)} disabled={i === 0} className="grid size-7 place-items-center rounded-lg border border-border text-xs disabled:opacity-30">↑</button>
                    <button onClick={() => reorderSegment(i, 1)} disabled={i === value.segments.length - 1} className="grid size-7 place-items-center rounded-lg border border-border text-xs disabled:opacity-30">↓</button>
                    <button onClick={() => updateSegment(segment.id, { enabled: !segment.enabled })} className="grid size-7 place-items-center rounded-lg border border-border text-xs">{segment.enabled ? '✓' : '○'}</button>
                    <button onClick={() => removeSegment(segment.id)} className="grid size-7 place-items-center rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10">✕</button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  <input value={segment.eyebrow ?? ''} onChange={(e) => updateSegment(segment.id, { eyebrow: e.target.value })} placeholder="Eyebrow (opcional)" className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
                  <input value={segment.title ?? ''} onChange={(e) => updateSegment(segment.id, { title: e.target.value })} placeholder="Título" className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
                  <textarea value={segment.description ?? ''} onChange={(e) => updateSegment(segment.id, { description: e.target.value })} placeholder="Descripción" rows={2} className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />

                  {segment.type === 'image-text' && (
                    <div className="grid gap-2">
                      {segment.imageUrl && (
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={segment.imageUrl} alt="Segmento" className="h-12 w-20 rounded-lg object-cover" />
                          <button onClick={() => updateSegment(segment.id, { imageUrl: '' })} className="grid size-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><X size={13} /></button>
                        </div>
                      )}
                      <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted">
                        <Upload size={13} /> {uploading === `${segment.id}:imageUrl` ? 'Subiendo…' : 'Subir imagen'}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(`${segment.id}:imageUrl`, e.target.files?.[0])} />
                      </label>
                    </div>
                  )}

                  {/* category-grid: slugs de categorías (pSEO) */}
                  {segment.type === 'category-grid' && (
                    <input
                      value={(segment.categorySlugs ?? []).join(', ')}
                      onChange={(e) => updateSegment(segment.id, { categorySlugs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                      placeholder="Slugs de categorías separados por coma (vacío = todas)"
                      className="rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-ring"
                    />
                  )}

                  {/* product-carousel: slugs de productos + etiqueta */}
                  {segment.type === 'product-carousel' && (
                    <div className="grid gap-2">
                      <input
                        value={(segment.productSlugs ?? []).join(', ')}
                        onChange={(e) => updateSegment(segment.id, { productSlugs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                        placeholder="Slugs de productos (vacío = destacados)"
                        className="rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-ring"
                      />
                      <input
                        value={segment.carouselLabel ?? ''}
                        onChange={(e) => updateSegment(segment.id, { carouselLabel: e.target.value })}
                        placeholder="Etiqueta del carrusel (ej: Más vendidos)"
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                      />
                    </div>
                  )}

                  {/* trust-badges: sellos de confianza */}
                  {segment.type === 'trust-badges' && (
                    <div className="grid gap-2">
                      {(segment.badges ?? []).map((badge, bi) => (
                        <div key={bi} className="grid gap-1 rounded-xl border border-border p-2">
                          <div className="flex items-center gap-2">
                            <input value={badge.icon} onChange={(e) => { const next = [...(segment.badges ?? [])]; next[bi] = { ...next[bi], icon: e.target.value }; updateSegment(segment.id, { badges: next }) }} placeholder="icono (truck/shield/tag/package/check)" className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-[11px] outline-none focus:border-ring" />
                            <button onClick={() => updateSegment(segment.id, { badges: (segment.badges ?? []).filter((_, x) => x !== bi) })} className="grid size-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10">✕</button>
                          </div>
                          <input value={badge.title} onChange={(e) => { const next = [...(segment.badges ?? [])]; next[bi] = { ...next[bi], title: e.target.value }; updateSegment(segment.id, { badges: next }) }} placeholder="Título" className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring" />
                          <input value={badge.text} onChange={(e) => { const next = [...(segment.badges ?? [])]; next[bi] = { ...next[bi], text: e.target.value }; updateSegment(segment.id, { badges: next }) }} placeholder="Texto" className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring" />
                        </div>
                      ))}
                      <button onClick={() => updateSegment(segment.id, { badges: [...(segment.badges ?? []), { icon: 'check', title: '', text: '' }] })} className="inline-flex h-8 items-center justify-center rounded-lg border border-dashed border-border text-xs font-medium hover:border-brand hover:text-brand">+ Agregar sello</button>
                    </div>
                  )}

                  {/* how-it-works: pasos */}
                  {segment.type === 'how-it-works' && (
                    <div className="grid gap-2">
                      {(segment.steps ?? []).map((step, si) => (
                        <div key={si} className="grid gap-1 rounded-xl border border-border p-2">
                          <div className="flex items-center gap-2">
                            <input value={step.number} onChange={(e) => { const next = [...(segment.steps ?? [])]; next[si] = { ...next[si], number: e.target.value }; updateSegment(segment.id, { steps: next }) }} placeholder="01" className="w-14 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-ring" />
                            <input value={step.title} onChange={(e) => { const next = [...(segment.steps ?? [])]; next[si] = { ...next[si], title: e.target.value }; updateSegment(segment.id, { steps: next }) }} placeholder="Título del paso" className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring" />
                            <button onClick={() => updateSegment(segment.id, { steps: (segment.steps ?? []).filter((_, x) => x !== si) })} className="grid size-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10">✕</button>
                          </div>
                          <input value={step.text} onChange={(e) => { const next = [...(segment.steps ?? [])]; next[si] = { ...next[si], text: e.target.value }; updateSegment(segment.id, { steps: next }) }} placeholder="Descripción del paso" className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring" />
                        </div>
                      ))}
                      <button onClick={() => updateSegment(segment.id, { steps: [...(segment.steps ?? []), { number: String((segment.steps?.length ?? 0) + 1).padStart(2, '0'), title: '', text: '' }] })} className="inline-flex h-8 items-center justify-center rounded-lg border border-dashed border-border text-xs font-medium hover:border-brand hover:text-brand">+ Agregar paso</button>
                    </div>
                  )}

                  {/* faq: preguntas frecuentes (genera FAQPage JSON-LD) */}
                  {segment.type === 'faq' && (
                    <div className="grid gap-2">
                      {(segment.faqItems ?? []).map((item, fi) => (
                        <div key={fi} className="grid gap-1 rounded-xl border border-border p-2">
                          <div className="flex items-center gap-2">
                            <input value={item.question} onChange={(e) => { const next = [...(segment.faqItems ?? [])]; next[fi] = { ...next[fi], question: e.target.value }; updateSegment(segment.id, { faqItems: next }) }} placeholder="Pregunta" className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring" />
                            <button onClick={() => updateSegment(segment.id, { faqItems: (segment.faqItems ?? []).filter((_, x) => x !== fi) })} className="grid size-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10">✕</button>
                          </div>
                          <textarea value={item.answer} onChange={(e) => { const next = [...(segment.faqItems ?? [])]; next[fi] = { ...next[fi], answer: e.target.value }; updateSegment(segment.id, { faqItems: next }) }} placeholder="Respuesta" rows={2} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring" />
                        </div>
                      ))}
                      <button onClick={() => updateSegment(segment.id, { faqItems: [...(segment.faqItems ?? []), { question: '', answer: '' }] })} className="inline-flex h-8 items-center justify-center rounded-lg border border-dashed border-border text-xs font-medium hover:border-brand hover:text-brand">+ Agregar pregunta</button>
                    </div>
                  )}

                  {/* testimonials: prueba social */}
                  {segment.type === 'testimonials' && (
                    <div className="grid gap-2">
                      {(segment.testimonials ?? []).map((t, ti) => (
                        <div key={ti} className="grid gap-1 rounded-xl border border-border p-2">
                          <div className="flex items-center gap-2">
                            <input value={t.name} onChange={(e) => { const next = [...(segment.testimonials ?? [])]; next[ti] = { ...next[ti], name: e.target.value }; updateSegment(segment.id, { testimonials: next }) }} placeholder="Nombre" className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring" />
                            <input type="number" min={1} max={5} value={t.rating ?? 5} onChange={(e) => { const next = [...(segment.testimonials ?? [])]; next[ti] = { ...next[ti], rating: Number(e.target.value) }; updateSegment(segment.id, { testimonials: next }) }} className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-sm outline-none focus:border-ring" title="Valoración 1-5" />
                            <button onClick={() => updateSegment(segment.id, { testimonials: (segment.testimonials ?? []).filter((_, x) => x !== ti) })} className="grid size-7 place-items-center rounded-lg text-destructive hover:bg-destructive/10">✕</button>
                          </div>
                          <input value={t.role ?? ''} onChange={(e) => { const next = [...(segment.testimonials ?? [])]; next[ti] = { ...next[ti], role: e.target.value }; updateSegment(segment.id, { testimonials: next }) }} placeholder="Rol (ej: Compradora verificada)" className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring" />
                          <textarea value={t.text} onChange={(e) => { const next = [...(segment.testimonials ?? [])]; next[ti] = { ...next[ti], text: e.target.value }; updateSegment(segment.id, { testimonials: next }) }} placeholder="Testimonio" rows={2} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-ring" />
                        </div>
                      ))}
                      <button onClick={() => updateSegment(segment.id, { testimonials: [...(segment.testimonials ?? []), { name: '', role: '', text: '', rating: 5 }] })} className="inline-flex h-8 items-center justify-center rounded-lg border border-dashed border-border text-xs font-medium hover:border-brand hover:text-brand">+ Agregar testimonio</button>
                    </div>
                  )}

                  {/* newsletter: botón y placeholder */}
                  {segment.type === 'newsletter' && (
                    <div className="grid gap-2">
                      <input value={segment.newsletterButton ?? ''} onChange={(e) => updateSegment(segment.id, { newsletterButton: e.target.value })} placeholder="Texto del botón" className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
                      <input value={segment.newsletterPlaceholder ?? ''} onChange={(e) => updateSegment(segment.id, { newsletterPlaceholder: e.target.value })} placeholder="Placeholder del correo" className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>

      {/* Columna derecha: preview */}
      <div className="xl:sticky xl:top-8 xl:h-fit">
        <div className="rounded-3xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold"><Eye size={15} className="text-brand" /> Preview en vivo</p>
            <button onClick={() => setShowPreview(!showPreview)} className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-muted">{showPreview ? 'Ocultar' : 'Mostrar'}</button>
          </div>
          {showPreview && <HomepagePreview config={value} heroTexts={heroTexts} heroImage={heroImage} />}
        </div>
      </div>
    </div>
  )
}