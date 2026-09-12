'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Layers, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { ENTRY_BULK_TYPES } from '@/lib/constants'
import { elegirNichoMenosCubierto } from '@/lib/entry-rules'
import { cn } from '@/lib/utils'

/**
 * EntryNicheBatch — generador masivo de guías por nicho (3 por clic).
 * ------------------------------------------------------------------
 * Automatiza el trabajo repetitivo del módulo "Guías y Comparativas":
 *   - Un BOTÓN POR NICHO que crea el lote fijo de 3 guías (Top ventas,
 *     Regalos y ¿Vale la pena?) SIEMPRE como borrador.
 *   - Un botón "siguiente nicho" que ROTA entre nichos (elige el de menos
 *     cobertura) para que clic tras clic se cubra todo el catálogo sin repetir
 *     el mismo (anti "doorway" + mejor reparto de enlazado interno).
 *
 * POR QUÉ todo pasa por la API y NO por Supabase: regla de oro del proyecto
 * (los componentes son agnósticos de la persistencia). Aquí solo hay fetch a
 * /api/admin/entradas* y /api/admin/entradas/niches, con estados de carga
 * visibles y errores por toast.
 */

/** Nicho con su cobertura de guías (respuesta de /api/admin/entradas/niches). */
export type NichoCobertura = {
  id: string
  name: string
  slug: string
  activa: boolean
  /** Nº de entradas existentes por tipo del lote. */
  porTipo: Record<string, number>
  /** Nº total de entradas enlazadas al nicho (cualquier intención). */
  total: number
}

/** Etiqueta legible de cada tipo del lote (3 guías fijas por nicho). */
const ETIQUETA_LOTE: Record<string, string> = {
  top_lista: 'Top ventas',
  regalo: 'Regalos',
  vale_la_pena: '¿Vale la pena?',
}

/** Estado de un tipo dentro del lote que se está generando. */
type EstadoTipo = 'pendiente' | 'generando' | 'ok' | 'error'
type ProgresoTipo = { tipo: string; estado: EstadoTipo; detalle?: string }

/** Leyenda corta de cada estado (panel de progreso en vivo). */
const TEXTO_ESTADO: Record<EstadoTipo, string> = {
  pendiente: 'En cola',
  generando: 'Redactando…',
  ok: 'Borrador listo',
  error: 'Error',
}

/** Tamaño de página de la tabla de nichos (mantiene el panel compacto). */
const NICHE_PAGE_SIZE = 8

export function EntryNicheBatch({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const [nichos, setNichos] = useState<NichoCobertura[]>([])
  const [loading, setLoading] = useState(true)
  const [generando, setGenerando] = useState(false)
  /** Nicho en proceso (para el spinner de su propia fila). */
  const [activo, setActivo] = useState<string | null>(null)
  /** Progreso del lote en curso: una entrada por tipo. */
  const [progreso, setProgreso] = useState<ProgresoTipo[]>([])

  /**
   * Carga los nichos con su cobertura.
   * @param silencioso TRUE para refrescar sin skeleton (tras generar el lote).
   */
  const cargarNichos = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    try {
      const res = await fetch('/api/admin/entradas/niches', { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar los nichos.')
      setNichos(body.niches ?? [])
    } catch (err: any) {
      toast.error(err?.message ?? 'Error cargando los nichos.')
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void cargarNichos()
  }, [cargarNichos])

  /**
   * Nichos que entran en la rotación: SOLO los activos, porque un nicho inactivo
   * no tiene hub público y sus guías no generarían tráfico (evita gastar tokens).
   */
  const rotables = useMemo(() => nichos.filter((nicho) => nicho.activa), [nichos])

  /** Nicho al que apuntará "siguiente nicho": el de menor cobertura del lote. */
  const siguiente = useMemo(
    () => elegirNichoMenosCubierto(rotables, [...ENTRY_BULK_TYPES]),
    [rotables],
  )

  /**
   * Crea el lote de 3 guías de un nicho (una petición por tipo, EN SERIE).
   * ------------------------------------------------------------------
   * POR QUÉ en serie y no en paralelo: cada generación llama al LLM (~15-30 s);
   * en paralelo agotaría el límite de tiempo de la función y la cuota del
   * proveedor, y el progreso sería ilegible. Un tipo que falla NUNCA detiene el
   * lote: se marca en rojo y se continúa con el siguiente.
   */
  const crearLote = useCallback(
    async (nicho: NichoCobertura) => {
      if (generando) return
      setGenerando(true)
      setActivo(nicho.id)
      setProgreso(ENTRY_BULK_TYPES.map((tipo) => ({ tipo, estado: 'pendiente' as EstadoTipo })))

      let creadas = 0
      for (let indice = 0; indice < ENTRY_BULK_TYPES.length; indice += 1) {
        const tipo = ENTRY_BULK_TYPES[indice]
        setProgreso((prev) => prev.map((p, i) => (i === indice ? { ...p, estado: 'generando' } : p)))
        try {
          // 1) La IA redacta el borrador (no persiste nada todavía).
          const resGenerar = await fetch('/api/admin/entradas/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo, categoryIds: [nicho.id] }),
          })
          const generado = await resGenerar.json()
          if (!resGenerar.ok) throw new Error(generado?.error ?? 'La IA no pudo generar la guía.')

          // 2) Se GUARDA siempre en estado `borrador`: nada llega al público sin
          //    revisión humana (publicar a escala es justo lo que Google castiga).
          const datos = generado.entry
          const resCrear = await fetch('/api/admin/entradas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tipo: datos.tipo,
              titulo: datos.titulo,
              slug: datos.slug,
              resumen: datos.resumen,
              cuerpo_html: datos.cuerpo_html,
              comparativa: datos.comparativa,
              faq: datos.faq,
              keywords: datos.keywords,
              keyword_objetivo: datos.keyword_objetivo,
              angulo: datos.angulo,
              lectura_minutos: datos.lectura_minutos,
              productIds: datos.productIds,
              categoryIds: datos.categoryIds,
            }),
          })
          const creada = await resCrear.json()
          if (!resCrear.ok) throw new Error(creada?.error ?? 'No se pudo guardar el borrador.')

          creadas += 1
          setProgreso((prev) => prev.map((p, i) => (i === indice ? { ...p, estado: 'ok' } : p)))
        } catch (err: any) {
          // Un tipo que falla se marca y el lote continúa (defensivo).
          setProgreso((prev) =>
            prev.map((p, i) =>
              i === indice ? { ...p, estado: 'error', detalle: err?.message } : p,
            ),
          )
        }
      }

      setGenerando(false)
      setActivo(null)

      if (creadas === ENTRY_BULK_TYPES.length) {
        toast.success('3 guías creadas como borrador en "' + nicho.name + '".', {
          description: 'Revísalas y publícalas cuando estén listas.',
        })
      } else if (creadas > 0) {
        toast.warning('Lote incompleto en "' + nicho.name + '".', {
          description:
            creadas + ' de ' + ENTRY_BULK_TYPES.length + ' guías creadas. Revisa el detalle.',
        })
      } else {
        toast.error('No se pudo crear ninguna guía en "' + nicho.name + '".', {
          description: 'Revisa el detalle del lote o el nicho elegido.',
        })
      }

      // La cobertura cambió: la tabla y el "siguiente nicho" se recalculan.
      await cargarNichos(true)
      await onCreated()
    },
    [generando, cargarNichos, onCreated],
  )

  /** Columnas de la tabla de nichos: cobertura del lote + acción por fila. */
  const columnas = useMemo<TableColumn<NichoCobertura>[]>(
    () => [
      {
        key: 'nicho',
        header: 'Nicho',
        sortable: true,
        sortValue: (nicho) => nicho.name.toLowerCase(),
        render: (nicho) => (
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-medium">
              {nicho.name}
              {!nicho.activa && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  Inactivo
                </span>
              )}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">/{nicho.slug}</p>
          </div>
        ),
      },
      {
        key: 'cobertura',
        header: 'Guías del lote',
        render: (nicho) => (
          <div className="flex flex-wrap gap-1">
            {ENTRY_BULK_TYPES.map((tipo) => {
              const tiene = (nicho.porTipo[tipo] ?? 0) > 0
              return (
                <span
                  key={tipo}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    tiene
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground',
                  )}
                  title={
                    tiene
                      ? ETIQUETA_LOTE[tipo] + ': ya tiene guía'
                      : ETIQUETA_LOTE[tipo] + ': pendiente'
                  }
                >
                  {tiene ? (
                    <Check size={11} aria-hidden />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current opacity-60" />
                  )}
                  {ETIQUETA_LOTE[tipo]}
                </span>
              )
            })}
          </div>
        ),
      },
      {
        key: 'total',
        header: 'Entradas',
        sortable: true,
        sortValue: (nicho) => nicho.total,
        headerClassName: 'text-center',
        cellClassName: 'text-center',
        render: (nicho) => <span className="text-xs text-muted-foreground">{nicho.total}</span>,
      },
      {
        key: 'acciones',
        header: 'Acción',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
        render: (nicho) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void crearLote(nicho)}
            disabled={generando || !nicho.activa}
            title={
              nicho.activa
                ? 'Crear 3 guías (Top ventas, Regalos y ¿Vale la pena?) en ' + nicho.name
                : 'Nicho inactivo: actívalo para poder generar sus guías'
            }
          >
            {generando && activo === nicho.id ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            3 guías
          </Button>
        ),
      },
    ],
    [crearLote, generando, activo],
  )

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Layers className="h-5 w-5 text-brand" aria-hidden />
            Generador masivo por nicho
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Un clic crea el lote fijo de{' '}
            <strong className="font-medium text-foreground">3 guías</strong> (Top ventas · Regalos ·
            ¿Vale la pena?) en ese nicho, siempre como borrador. El botón «siguiente nicho» rota
            automáticamente al nicho con menos guías para cubrir todo el catálogo sin repetir.
          </p>
        </div>
        <Button
          onClick={() => siguiente && void crearLote(siguiente)}
          disabled={generando || !siguiente}
          title={siguiente ? 'Siguiente nicho: ' + siguiente.name : 'No hay nichos activos disponibles'}
        >
          {generando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {generando ? 'Generando…' : 'Crear 3 en el siguiente nicho'}
        </Button>
      </div>

      {/* Progreso en vivo del lote: una tarjeta por tipo generado. */}
      {progreso.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-3">
          {progreso.map((item) => (
            <li
              key={item.tipo}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs"
            >
              {item.estado === 'generando' ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-brand" aria-hidden />
              ) : item.estado === 'ok' ? (
                <Check
                  className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
              ) : item.estado === 'error' ? (
                <TriangleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden />
              ) : (
                <span className="size-3.5 shrink-0 rounded-full border border-border" aria-hidden />
              )}
              <span className="font-medium">{ETIQUETA_LOTE[item.tipo] ?? item.tipo}</span>
              <span
                className={cn(
                  'ml-auto truncate',
                  item.estado === 'error' ? 'text-destructive' : 'text-muted-foreground',
                )}
                title={item.detalle ?? TEXTO_ESTADO[item.estado]}
              >
                {TEXTO_ESTADO[item.estado]}
              </span>
            </li>
          ))}
        </ul>
      )}

      <DataTable
        data={nichos}
        columns={columnas}
        rowKey={(nicho) => nicho.id}
        searchKeys={(nicho) => nicho.name + ' ' + nicho.slug}
        searchPlaceholder="Buscar nicho…"
        emptyMessage="Ningún nicho coincide con la búsqueda"
        noDataMessage="Aún no hay nichos en el catálogo"
        loading={loading}
        pageSize={NICHE_PAGE_SIZE}
        toolbar={
          <Button variant="ghost" size="sm" onClick={() => void cargarNichos()} disabled={generando}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Actualizar nichos
          </Button>
        }
      />
    </section>
  )
}
