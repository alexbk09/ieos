'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, Loader2, PackageX, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { consumirSSE } from '@/lib/sse-client'

/**
 * Panel de VERIFICACIÓN DE DISPONIBILIDAD de afiliados AliExpress (Fase 2.8).
 * ------------------------------------------------------------------
 * Solo visible en /admin/ali-pipeline (protegido por RBAC + requireAdmin).
 *
 * QUÉ HACE: consulta el detalle real de la API oficial de todos los productos
 * afiliados publicados y, cuando un producto ya no existe o se quedó sin precio
 * comprable, DEGRADA su ficha (OutOfStock + alternativas) SIN ocultarla: la URL
 * indexada se conserva, así el SEO no se perjudica. Si el producto vuelve,
 * restaura su disponibilidad automáticamente.
 *
 * QUÉ NO HACE (importante para el coste): NO usa IA (DeepSeek) ni el proxy de
 * scraping (ZenRows/ScraperAPI). Solo llama a la API de afiliados de AliExpress
 * por lotes de 20 IDs → 0 tokens y 0 créditos de proxy.
 *
 * Reglas de oro:
 *  - Cero llamadas directas a Supabase: todo pasa por
 *    /api/admin/ali-pipeline/availability (SSE).
 *  - Estados de carga premium (spinner + log en vivo) y errores visibles (toasts).
 */

type EtapaDisponibilidad = 'preparando' | 'consultando' | 'evaluando' | 'degradando' | 'recuperando' | 'completado' | 'error'

type NotificacionEtapa = {
  etapa: EtapaDisponibilidad
  mensaje: string
  productoId?: string | null
  index?: number
  total?: number
}

type AccionDisponibilidad = 'none' | 'sospecha' | 'marcar_no_disponible' | 'recuperar'

type ResultadoProducto = {
  id: string
  slug: string
  nombre: string
  accion: AccionDisponibilidad
  estado: 'ok' | 'unavailable'
  motivo: 'detalle_ok' | 'sin_detalle' | 'precio_invalido'
  ausencias: number
  precio: number | null
}

type ResumenVerificacion = {
  total: number
  degradados: number
  recuperados: number
  sospechas: number
  sinCambios: number
}

type ResultadoFinal = {
  success: boolean
  data?: ResultadoProducto[]
  resumen?: ResumenVerificacion
  error?: string
}

type ResumenSalud = {
  totalAfiliados: number
  noDisponibles: number
  sospechosos: number
  ultimaVerificacion: string | null
  umbralAusencias: number
}

/** Etiquetas humanas por etapa para el log en vivo. */
const ETIQUETA_ETAPA: Record<EtapaDisponibilidad, string> = {
  preparando: 'Preparando',
  consultando: 'Consultando API',
  evaluando: 'Evaluando',
  degradando: 'Degradando ficha',
  recuperando: 'Recuperando ficha',
  completado: 'Completado',
  error: 'Error',
}

/** Icono y color por etapa del log en vivo. */
function IconoEtapa({ etapa }: { etapa: EtapaDisponibilidad }) {
  if (etapa === 'error') return <XCircle size={16} className="text-red-500" />
  if (etapa === 'completado') return <CheckCircle2 size={16} className="text-emerald-500" />
  if (etapa === 'degradando') return <PackageX size={16} className="text-amber-500" />
  if (etapa === 'recuperando') return <ShieldCheck size={16} className="text-emerald-500" />
  if (etapa === 'evaluando') return <Eye size={16} className="text-slate-500" />
  return <Loader2 size={16} className="animate-spin text-blue-500" />
}

/** Etiqueta/estilo del resultado por producto (UI pura, sin lógica de datos). */
function ChipResultado({ producto }: { producto: ResultadoProducto }) {
  if (producto.accion === 'marcar_no_disponible') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700">
        <PackageX size={12} /> No disponible
      </span>
    )
  }
  if (producto.accion === 'recuperar') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
        <CheckCircle2 size={12} /> Recuperado
      </span>
    )
  }
  if (producto.accion === 'sospecha') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-700">
        <Eye size={12} /> En observación
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      Sin cambios
    </span>
  )
}

/** Convierte un ISO en fecha legible corta (o "nunca" si no hay dato). */
function fechaLegible(iso: string | null): string {
  if (!iso) return 'nunca'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return 'nunca'
  return fecha.toLocaleString()
}

export function AliAvailabilityPanel() {
  // Vacío (o 0) = tope defensivo del catálogo (los menos revisados primero).
  const [limite, setLimite] = useState('')
  const [ejecutando, setEjecutando] = useState(false)
  const [logEnVivo, setLogEnVivo] = useState<NotificacionEtapa[]>([])
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoFinal | null>(null)
  const [salud, setSalud] = useState<ResumenSalud | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  /** Carga el resumen de salud del catálogo (GET, sin llamar a AliExpress). */
  const cargarSalud = useCallback(async () => {
    try {
      const respuesta = await fetch('/api/admin/ali-pipeline/availability', { cache: 'no-store' })
      const datos = await respuesta.json()
      if (respuesta.ok && datos?.success) setSalud(datos.data as ResumenSalud)
    } catch {
      // Silencioso: el resumen es informativo.
    }
  }, [])

  useEffect(() => { cargarSalud() }, [cargarSalud])

  /** Auto-scroll del log hacia el último evento. */
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logEnVivo])

  /** Ejecuta la verificación y consume el stream SSE. */
  const ejecutar = useCallback(async () => {
    if (ejecutando) return
    setEjecutando(true)
    setLogEnVivo([])
    setResultadoFinal(null)

    try {
      const respuesta = await fetch('/api/admin/ali-pipeline/availability', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: limite.trim() === '' ? 0 : Number(limite) || 0 }),
      })

      // Si responde JSON (no SSE) es un error temprano (403/500).
      const contentType = respuesta.headers.get('content-type') ?? ''
      if (!respuesta.ok || !contentType.includes('text/event-stream')) {
        const datos = await respuesta.json().catch(() => ({}))
        const mensaje = (datos as { error?: string })?.error ?? 'No se pudo iniciar la verificación.'
        toast.error(mensaje)
        setResultadoFinal({ success: false, error: mensaje })
        return
      }

      await consumirSSE<NotificacionEtapa, ResultadoFinal>(respuesta, {
        onEtapa: (notificacion) => {
          setLogEnVivo((prev) => [...prev, notificacion])
          if (notificacion.etapa === 'degradando') toast.warning(notificacion.mensaje)
          else if (notificacion.etapa === 'recuperando') toast.success(notificacion.mensaje)
          else if (notificacion.etapa === 'error') toast.error(notificacion.mensaje)
          else toast.loading(notificacion.mensaje, { id: 'ali-availability-progress' })
        },
        onFin: (fin) => {
          setResultadoFinal(fin)
          toast.dismiss('ali-availability-progress')
          if (fin.success) {
            const r = fin.resumen
            toast.success(
              r
                ? `Verificación completada: ${r.degradados} degradados · ${r.recuperados} recuperados`
                : 'Verificación completada.',
            )
          } else {
            toast.error(fin.error ?? 'La verificación terminó con errores.')
          }
          cargarSalud()
        },
      })
    } catch (err: any) {
      const mensaje = err?.message ?? 'Error de red al verificar la disponibilidad.'
      console.error('[AliAvailabilityPanel] ejecutar:', mensaje)
      toast.error(mensaje)
      setResultadoFinal({ success: false, error: mensaje })
    } finally {
      setEjecutando(false)
    }
  }, [limite, ejecutando, cargarSalud])

  const degradados = resultadoFinal?.data?.filter((r) => r.accion === 'marcar_no_disponible') ?? []
  const recuperados = resultadoFinal?.data?.filter((r) => r.accion === 'recuperar') ?? []
  const observacion = resultadoFinal?.data?.filter((r) => r.accion === 'sospecha') ?? []
  // Solo se listan los productos con algo relevante (evita ruido en catálogos grandes).
  const destacados = [...degradados, ...recuperados, ...observacion]

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
            <PackageX size={20} />
          </span>
          <div>
            <h2 className="font-semibold">Verificar disponibilidad del catálogo</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Comprueba contra la <strong>API oficial</strong> qué productos afiliados ya no existen o quedaron sin precio.
              Sus fichas se <strong>degradan</strong> (OutOfStock + alternativas) <strong>sin ocultarlas</strong>, así no se
              pierde la URL indexada ni se perjudica el SEO. Si un producto vuelve, se restaura solo.
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Sin coste: ni IA ni scraper</p>
            <p className="mt-1 text-emerald-600/90">
              Solo consulta la API de afiliados por lotes de 20 IDs (<strong>0 tokens</strong> de DeepSeek y{' '}
              <strong>0 créditos</strong> de ZenRows/ScraperAPI).
            </p>
          </div>
        </div>

        {salud && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-muted/60 p-4">
              <p className="text-xs text-muted-foreground">Productos afiliados</p>
              <p className="mt-1 text-2xl font-semibold">{salud.totalAfiliados}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <p className="text-xs text-muted-foreground">No disponibles</p>
              <p className="mt-1 text-2xl font-semibold text-amber-600">{salud.noDisponibles}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <p className="text-xs text-muted-foreground">En observación</p>
              <p className="mt-1 text-2xl font-semibold text-blue-600">{salud.sospechosos}</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <p className="text-xs text-muted-foreground">Última verificación</p>
              <p className="mt-1 text-sm font-medium">{fechaLegible(salud.ultimaVerificacion)}</p>
            </div>
          </div>
        )}

        {salud && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle size={14} className="shrink-0 text-amber-500" />
            Un producto se degrada tras {salud.umbralAusencias} verificaciones consecutivas sin detalle/precio válido
            (protege de fallos transitorios de la API).
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <FormInput
            label="Productos a verificar"
            type="number"
            min={0}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            placeholder="Tope del catálogo"
            hint="Déjalo vacío (o 0) para verificar el lote más antiguo. Pulsa de nuevo y continúa por los pendientes."
            className="w-60"
            disabled={ejecutando}
          />
          <FormSubmitButton
            onClick={ejecutar}
            loading={ejecutando}
            loadingText="Verificando…"
            disabled={ejecutando}
          >
            <RefreshCw size={15} /> Verificar disponibilidad
          </FormSubmitButton>
        </div>
      </section>

      {/* Log en vivo */}
      {logEnVivo.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Progreso</h2>
            <span className="text-xs text-muted-foreground">{logEnVivo.length} eventos</span>
          </div>
          <div ref={logRef} className="mt-4 max-h-80 space-y-2 overflow-y-auto">
            {logEnVivo.map((log, i) => (
              <div key={i} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
                <span className="mt-0.5 shrink-0"><IconoEtapa etapa={log.etapa} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    {ETIQUETA_ETAPA[log.etapa]}
                    {log.index != null && log.total != null ? ` · ${log.index}/${log.total}` : ''}
                  </p>
                  <p className="mt-0.5 text-sm text-foreground/90">{log.mensaje}</p>
                </div>
              </div>
            ))}
            {ejecutando && (
              <div className="flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3">
                <Loader2 size={16} className="animate-spin text-cyan-500" />
                <p className="text-sm text-cyan-600">Verificando… no cierres esta página.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Resultado final */}
      {resultadoFinal && (
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            {resultadoFinal.success ? (
              <CheckCircle2 size={20} className="text-emerald-600" />
            ) : (
              <XCircle size={20} className="text-red-600" />
            )}
            <div>
              <h2 className="font-semibold">Resultado</h2>
              <p className="text-xs text-muted-foreground">
                {resultadoFinal.success
                  ? `${resultadoFinal.resumen?.degradados ?? 0} degradados · ${resultadoFinal.resumen?.recuperados ?? 0} recuperados · ${resultadoFinal.resumen?.sospechas ?? 0} en observación · ${resultadoFinal.resumen?.sinCambios ?? 0} sin cambios`
                  : resultadoFinal.error ?? 'La verificación no completó.'}
              </p>
            </div>
          </div>

          {destacados.length > 0 && (
            <div className="mt-5 space-y-2">
              {destacados.map((producto) => (
                <div key={producto.id} className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center">
                  <ChipResultado producto={producto} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground/90">{producto.nombre}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">/{producto.slug}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Motivo: {producto.motivo} · Ausencias: {producto.ausencias}
                      {producto.precio != null ? ` · Precio API: ${producto.precio}` : ' · Sin precio en la API'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {resultadoFinal.success && destacados.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Todo el lote verificado está disponible y con precio válido.
            </p>
          )}
        </section>
      )}

    </div>
  )

}

