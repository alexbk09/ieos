'use client'

import { ArrowUpRight, Package } from 'lucide-react'
import { useTranslations } from '@/hooks/use-translations'
import { useLocalizedPath } from '@/hooks/use-localized-path'

/** Item de navegación de categoría (con conteo de productos visibles). */
export type CategoryNavItem = {
  id: string
  name: string
  slug: string
  /** Slug traducido del idioma activo (URL localizada). Fallback = slug base. */
  slug_localizado?: string
  description?: string | null
  tipo?: 'principal' | 'subcategoria'
  count: number
}

/**
 * Navegación cross-categoría ("Explora otras categorías").
 * ------------------------------------------------------------------
 * - Presentacional: recibe las categorías YA resueltas por /services
 *   (catalog.getCategoryNav), por lo que no toca Supabase.
 * - Muestra solo categorías con productos y OMITE la actual, evitando
 *   que el cliente caiga en una página vacía.
 * - Tarjetas responsive con conteo, descripción y CTA hacia /catalogo.
 */
export function CategoryNav({
  items,
  currentSlug,
  title,
  subtitle,
}: {
  items: CategoryNavItem[]
  /** Slug de la categoría actual (se excluye de la lista). */
  currentSlug?: string
  /** Título opcional: si no llega, se usa el traducido por defecto. */
  title?: string
  subtitle?: string
}) {
  const t = useTranslations()
  // Enlaces internos en el idioma activo (grafo de idiomas consistente).
  const localizedPath = useLocalizedPath()
  const resolvedTitle = title ?? t('category.exploreOthers')
  const resolvedSubtitle = subtitle ?? t('category.exploreOthersSubtitle')

  const others = (items ?? []).filter((c) => c.slug !== currentSlug)
  if (others.length === 0) return null

  return (
    <section aria-labelledby="category-nav-heading" className="mt-14 border-t border-border pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {/* H2 semántico: jerarquía de encabezados dentro de la página. */}
          <h2 id="category-nav-heading" className="text-2xl font-semibold tracking-[-.04em] sm:text-3xl">
            {resolvedTitle}
          </h2>
          {resolvedSubtitle && <p className="mt-1 text-sm text-muted-foreground">{resolvedSubtitle}</p>}
        </div>
        <a
          href={localizedPath('/catalogo')}
          className="hidden shrink-0 items-center gap-1 text-sm font-medium text-brand-strong transition hover:underline sm:inline-flex"
        >
          {t('category.viewFullCatalog')} <ArrowUpRight size={14} />
        </a>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {others.map((c) => (
          <a
            key={c.id}
            href={localizedPath(
              c.tipo === 'principal'
                ? `/${c.slug_localizado ?? c.slug}`
                : `/categoria/${c.slug_localizado ?? c.slug}`,
            )}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand hover:shadow-lg hover:shadow-brand/10"
          >
            {/* Halo decorativo que se intensifica al pasar el cursor. */}
            <span className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-brand/5 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.name}</p>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                )}
              </div>
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition group-hover:border-brand group-hover:text-brand-strong">
                <ArrowUpRight size={16} />
              </span>
            </div>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-brand-strong">
              <Package size={11} /> {c.count} {c.count !== 1 ? t('category.stockMany') : t('category.stockOne')}
            </p>
          </a>
        ))}
      </div>
    </section>
  )
}
