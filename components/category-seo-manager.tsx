'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Save, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { FormSubmitButton } from '@/components/ui/form-field'
import type { SeoFaqItem } from '@/lib/seo-types'
import { DEFAULT_AUTHOR } from '@/lib/constants'

/** Categoría con su contenido SEO (respuesta de /api/admin/categorias/seo). */
type CategorySeo = {
  id: string
  name: string
  slug: string
  seo_title: string | null
  seo_intro: string | null
  seo_faq: SeoFaqItem[] | null
  /** Firma editorial del hub (migración 0057). */
  autor: string | null
}

/**
 * Gestor del contenido SEO de las categorías (hubs pSEO).
 * ------------------------------------------------------------------
 * - Consume la API RBAC /api/admin/categorias/seo (nunca Supabase directo).
 * - Estados de carga (skeleton + spinner) y toasts de error/éxito visibles.
 * - Permite editar manualmente o regenerar con IA (DeepSeek) el hub.
 */
export function CategorySeoManager() {
  const [categories, setCategories] = useState<CategorySeo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Campos del formulario del hub seleccionado.
  const [titulo, setTitulo] = useState('')
  const [intro, setIntro] = useState('')
  const [faq, setFaq] = useState<SeoFaqItem[]>([])
  const [autor, setAutor] = useState('')

  const selected = useMemo(() => categories.find((c) => c.id === selectedId) ?? null, [categories, selectedId])

  /** Carga las categorías con su SEO desde la API. */
  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/categorias/seo')
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar las categorías.')
      setCategories(body.categories ?? [])
    } catch (err: any) {
      toast.error('Error cargando el SEO de categorías', { description: err?.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  /** Vuelca el hub seleccionado en el formulario. */
  useEffect(() => {
    setTitulo(selected?.seo_title ?? '')
    setIntro(selected?.seo_intro ?? '')
    setFaq(selected?.seo_faq ?? [])
    // PRERRELLENO: la firma aparece ya con el autor por defecto del entorno
    // (NEXT_PUBLIC_DEFAULT_AUTHOR) y el admin puede cambiarla antes de guardar.
    setAutor(selected?.autor ?? DEFAULT_AUTHOR)
  }, [selected])

  /** Guarda los cambios manuales del hub seleccionado. */
  async function guardar(payload: {
    seo_title: string
    seo_intro: string
    seo_faq: SeoFaqItem[]
    autor: string
  }) {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/categorias/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, slug: selected.slug, ...payload }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo guardar.')
      toast.success('Contenido SEO guardado', { description: 'El hub y el sitemap se revalidaron.' })
      await cargar()
    } catch (err: any) {
      toast.error('Error guardando el SEO', { description: err?.message })
    } finally {
      setSaving(false)
    }
  }

  /** Regenera el hub completo con IA a partir del nombre de la categoría. */
  async function regenerar() {
    if (!selected) return
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/categorias/seo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, slug: selected.slug, nombre: selected.name, regenerar: true }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo regenerar.')
      toast.success('Contenido regenerado con IA')
      await cargar()
    } catch (err: any) {
      toast.error('Error regenerando con IA', { description: err?.message })
    } finally {
      setGenerating(false)
    }
  }

  // ---------- Estado de carga (skeleton) ----------
  if (loading) {
    return (
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-muted/40" />
      </div>
    )
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      {/* Lista de categorías */}
      <aside className="max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-card p-3">
        <p className="px-2 pb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Categorías</p>
        {categories.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No hay categorías.</p>
        ) : (
          <ul className="space-y-1">
            {categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full truncate rounded-xl px-3 py-2 text-left text-sm transition ${
                    c.id === selectedId ? 'bg-brand/10 text-brand-strong' : 'hover:bg-muted'
                  }`}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Editor del hub */}
      <section className="rounded-2xl border border-border bg-card p-5">
        {!selected ? (
          <div className="grid h-56 place-items-center text-center text-sm text-muted-foreground">
            Elige una categoría para editar su contenido de nicho.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <p className="text-xs text-muted-foreground">/categoria/{selected.slug}</p>
              </div>
              <button
                type="button"
                onClick={regenerar}
                disabled={generating || saving}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
              >
                {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {generating ? 'Generando…' : 'Generar con IA'}
              </button>
            </div>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Título H1 del hub</span>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder="Los mejores teclados mecánicos — Guía y comparativa"
              />
            </label>

            {/* Firma editorial del hub: viene prerrellenada con el autor por
                defecto del entorno y se puede cambiar por categoría. */}
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Autor / firma editorial</span>
              <input
                value={autor}
                onChange={(e) => setAutor(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder={DEFAULT_AUTHOR}
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Se muestra como «Por {autor}» en el hub. Por defecto viene de NEXT_PUBLIC_DEFAULT_AUTHOR.
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Guía de compra (HTML)</span>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                rows={10}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
                placeholder="<h2>Guía de compra</h2><p>…</p>"
              />
            </label>

            {faq.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  FAQ del nicho ({faq.length}) — alimenta el schema FAQPage
                </p>
                <ul className="mt-2 space-y-2">
                  {faq.map((f, i) => (
                    <li key={i} className="rounded-xl border border-border p-3 text-sm">
                      <p className="font-medium">{f.pregunta}</p>
                      <p className="mt-1 text-muted-foreground">{f.respuesta}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <FormSubmitButton
              loading={saving}
              onClick={() => guardar({ seo_title: titulo, seo_intro: intro, seo_faq: faq, autor })}
              className="gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar cambios
            </FormSubmitButton>
          </div>
        )}
      </section>
    </div>
  )
}