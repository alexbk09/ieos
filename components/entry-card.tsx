'use client'

import Image from 'next/image'
import { ArrowRight, Clock } from 'lucide-react'
import { useLocalizedPath } from '@/hooks/use-localized-path'
import { useTranslations } from '@/hooks/use-translations'

/**
 * EntryCard
 * ------------------------------------------------------------------
 * Tarjeta de una entrada SEO para el hub /guias y los bloques de "seguir
 * leyendo". Es puramente presentacional: recibe datos ya resueltos por
 * /services (capa de datos) y NO conoce Supabase.
 *
 * El enlace es un <a> normal (no onClick): así Google rastrea el cluster de
 * guías sin ejecutar JavaScript.
 */

/** Datos mínimos de una entrada para la tarjeta. */
export type EntryCardData = {
  slug: string
  /** Slug del idioma activo (fallback = slug base). */
  slugLocalizado?: string | null
  titulo: string
  resumen: string | null
  heroImageUrl: string | null
  /** Gancho editorial ("para pisos pequeños", "regalo original"). */
  angulo?: string | null
  lecturaMinutos?: number | null
}

export function EntryCard({ entry }: { entry: EntryCardData }) {
  const t = useTranslations()
  const localizedPath = useLocalizedPath()
  const href = localizedPath('/guias/' + (entry.slugLocalizado || entry.slug))

  return (
    <a
      href={href}
      className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition hover:border-brand/60 hover:shadow-lg"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {entry.heroImageUrl ? (
          <Image
            src={entry.heroImageUrl}
            alt={entry.titulo}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          // Placeholder elegante: nunca una imagen rota ni un hueco blanco.
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand/15 via-muted to-muted">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {t('entry.eyebrow')}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        {entry.angulo && (
          <span className="mb-2 self-start rounded-full bg-brand/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-brand-strong">
            {entry.angulo}
          </span>
        )}
        {/* El acento de texto usa brand-strong: --brand puro no alcanza 4.5:1
            sobre fondo claro (era el fallo de contraste del listado de guías). */}
        <h3 className="text-lg font-semibold leading-snug tracking-[-.02em] transition group-hover:text-brand-strong">
          {entry.titulo}
        </h3>
        {entry.resumen && (
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{entry.resumen}</p>
        )}
        <div className="mt-4 flex items-center justify-between pt-2 text-xs text-muted-foreground">
          {entry.lecturaMinutos ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {t('entry.readingTime', { minutes: entry.lecturaMinutos })}
            </span>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-1 font-medium text-brand-strong">
            {t('entry.guideLink')}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </div>
      </div>
    </a>
  )
}
