'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, FolderTree, Languages, Loader2, Package, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

/** Resumen de pendientes que devuelve la API. */
type PendingSummary = { products: number; categories: number; total: number }

/** Metadatos de progreso mostrados durante una tanda. */
type ProgressState = { translated: number; failed: number; initial: number }

/**
 * Panel "Idiomas y Traducciones" (cliente).
 * ------------------------------------------------------------------
 * - Consume la API RBAC /api/admin/i18n/pendientes (nunca Supabase directo).
 * - Muestra cuántos productos/categorías tienen contenido sin traducir y un
 *   botón que traduce TODO lo pendiente repitiendo tandas, con progreso en vivo.
 * - Manejo defensivo: estados de carga, toasts de error y bloqueo sin permiso.
 */
export function I18nPendingManager({
  initialPending,
  canWrite,
}: {
  initialPending: PendingSummary
  canWrite: boolean
}) {
  const [pending, setPending] = useState<PendingSummary>(initialPending)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)

  /** Relee los contadores desde el servidor (tras traducir o al pulsar refrescar). */
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/i18n/pendientes', { cache: 'no-store' })
      if (!res.ok) throw new Error('No se pudo consultar los pendientes.')
      const data = await res.json()
      setPending(data.pending ?? { products: 0, categories: 0, total: 0 })
    } catch (e: any) {
      toast.error('Error al actualizar', { description: e?.message })
    } finally {
      setRefreshing(false)
    }
  }, [])

  /**
   * Traduce todo lo pendiente repitiendo tandas acotadas. Se detiene cuando no
   * queda nada o cuando una tanda no avanza (evita bucles infinitos).
   */
  const runBatch = useCallback(async () => {
    if (busy || pending.total === 0) return
    setBusy(true)
    const initialTotal = pending.total
    let translated = 0
    let failed = 0
    setProgress({ translated, failed, initial: initialTotal })

    try {
      for (;;) {
        const res = await fetch('/api/admin/i18n/pendientes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? 'No se pudo traducir.')
        }
        const data = await res.json()
        const roundTranslated = data.products.translated + data.categories.translated
        const roundFailed = data.products.failed + data.categories.failed
        translated += roundTranslated
        failed += roundFailed
        setPending(data.pending)
        setProgress({ translated, failed, initial: initialTotal })

        // Fin: no queda nada pendiente, o la tanda no avanzó (error repetido).
        if (data.pending.total === 0) break
        if (roundTranslated + roundFailed === 0) break
      }

      if (translated === 0 && failed > 0) {
        toast.error('No se pudo traducir', {
          description: 'Revisa la clave del motor de traducción (DEEPSEEK_API_KEY).',
        })
      } else if (failed > 0) {
        toast.warning('Traducción completada con incidencias', {
          description: `${translated} traducidos · ${failed} con error.`,
        })
      } else if (translated > 0) {
        toast.success('Traducción completada', { description: `${translated} contenido(s) traducidos.` })
      } else {
        toast.info('Nada que traducir', { description: 'Todo el contenido ya está internacionalizado.' })
      }
    } catch (e: any) {
      toast.error('Error al traducir', { description: e?.message })
    } finally {
      setBusy(false)
      setProgress(null)
      // Confirmar los contadores contra el servidor al terminar.
      refresh()
    }
  }, [busy, pending.total, refresh])

  const processed = progress ? Math.max(0, progress.initial - pending.total) : 0
  const progressPct =
    progress && progress.initial > 0 ? Math.min(100, Math.round((processed / progress.initial) * 100)) : 0

  return (
    <div className="grid gap-6">
      {/* Resumen de pendientes */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Package size={18} />} label="Productos sin traducir" value={pending.products} />
        <StatCard icon={<FolderTree size={18} />} label="Categorías sin traducir" value={pending.categories} />
        <StatCard
          icon={<Languages size={18} />}
          label="Total pendiente"
          value={pending.total}
          tone={pending.total > 0 ? 'warn' : 'ok'}
        />
      </div>

      {/* Acciones */}
      <div className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="text-sm font-medium">Traducción automática del catálogo</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Traduce al resto de idiomas el contenido que falte: en productos, nombre, título SEO, descripción y
              FAQ; en categorías, nombre, slug y el contenido editorial del hub. Es idempotente: lo ya traducido no
              se vuelve a procesar.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={refresh}
              disabled={busy || refreshing}
              aria-label="Actualizar pendientes"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Actualizar
            </button>
            <button
              onClick={runBatch}
              disabled={!canWrite || busy || pending.total === 0}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Traduciendo…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Traducir pendientes
                </>
              )}
            </button>
          </div>
        </div>

        {!canWrite && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle size={14} className="text-amber-500" /> No tienes permiso de escritura para ejecutar la
            traducción.
          </p>
        )}

        {/* Progreso en vivo */}
        {progress && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Traducidos: {progress.translated}
                {progress.failed > 0 ? ` · con error: ${progress.failed}` : ''}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Estado "todo listo" (solo cuando no hay una tanda en curso). */}
        {!progress && pending.total === 0 && (
          <p className="mt-4 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={16} /> Todo el contenido está internacionalizado.
          </p>
        )}
      </div>
    </div>
  )
}

/** Tarjeta de contador con icono y tono opcional (default / warn / ok). */
function StatCard({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: ReactNode
  label: string
  value: number
  tone?: 'default' | 'warn' | 'ok'
}) {
  const toneClass =
    tone === 'warn'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'ok'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-foreground'
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary">{icon}</span>
      <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  )
}
