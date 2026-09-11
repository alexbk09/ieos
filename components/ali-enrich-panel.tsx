'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { ALI_ENRICH_BATCH_SIZE, ALI_ENRICH_MAX_PRODUCTS } from '@/lib/constants'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'

/**
 * Panel de RE-ENRIQUECIMIENTO de productos AliExpress (Fase 2.6).
 * ------------------------------------------------------------------
 * Solo visible en /admin/ali-pipeline (protegido por RBAC + requireAdmin).
 *
 * POR QUÉ existe: los precios y las valoraciones cambian. Con un clic, el admin
 * vuelve a extraer el detalle real de los últimos N productos afiliados y
 * actualiza precio, disponibilidad, especificaciones, marca, valoración y
 * opiniones — SIN tocar el SEO ya indexado.
 *
 * Reglas de oro:
 *  - Cero llamadas directas a Supabase: todo pasa por /api/admin/ali-pipeline/enrich.
 *  - Estados de carga premium (spinner + log en vivo) y errores visibles (toasts).
 */

type EtapaEnriquecimiento = 'preparando' | 'extrayendo' | 'actualizando' | 'completado' | 'error'

type NotificacionEtapa = {
  etapa: EtapaEnriquecimiento
  mensaje: string
  productoId?: string | null
  index?: number
  total?: number
}

type ResultadoProducto = {
  id: string
  slug: string
  nombre: string
  actualizado: boolean
  campos: string[]
  error?: string | null
}

type ResultadoFinal = {
  success: boolean
  data?: ResultadoProducto[]
  error?: string
}

/** Etiquetas humanas por etapa para el log en vivo. */
const ETIQUETA_ETAPA: Record<EtapaEnriquecimiento, string> = {
  preparando: 'Preparando',
  extrayendo: 'Extrayendo detalle',
  actualizando: 'Actualizando',
  completado: 'Completado',
  error: 'Error',
}

/** Icono y color por etapa del log en vivo. */
function IconoEtapa({ etapa }: { etapa: EtapaEnriquecimiento }) {
  if (etapa === 'error') return <XCircle size={16} className="text-red-500" />
  if (etapa === 'completado') return <CheckCircle2 size={16} className="text-emerald-500" />
  if (etapa === 'actualizando') return <RefreshCw size={16} className="text-cyan-500" />
  return <Loader2 size={16} className="animate-spin text-blue-500" />
}

/**
 * Consume un stream SSE línea a línea y despacha cada evento.
 * Se aísla aquí para mantener el componente legible y sin duplicar la lectura.
 */
async function consumirSSE(
  respuesta: Response,
  handlers: { onEtapa: (n: NotificacionEtapa) => void; onFin: (fin: ResultadoFinal) => void },
) {
  if (!respuesta.body) throw new Error('El navegador no soporta streaming de respuesta.')
  const lector = respuesta.body.getReader()
  const decodificador = new TextDecoder()
  let buffer = ''

  const procesar = (bloque: string) => {
    for (const evento of bloque.split('\n\n')) {
      if (!evento.trim()) continue
      let tipo = 'message'
      let datos = ''
      for (const linea of evento.split('\n')) {
        if (linea.startsWith('event:')) tipo = linea.slice(6).trim()
        else if (linea.startsWith('data:')) datos += linea.slice(5).trim()
      }
      if (!datos) continue
      try {
        const payload = JSON.parse(datos)
        if (tipo === 'etapa') handlers.onEtapa(payload as NotificacionEtapa)
        else if (tipo === 'fin') handlers.onFin(payload as ResultadoFinal)
      } catch {
        // Ignora eventos malformados.
      }
    }
  }

  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    buffer += decodificador.decode(value, { stream: true })
    const indice = buffer.lastIndexOf('\n\n')
    if (indice >= 0) {
      procesar(buffer.slice(0, indice))
      buffer = buffer.slice(indice + 2)
    }
  }
  if (buffer.trim()) procesar(buffer)
}

export function AliEnrichPanel() {
  const [limite, setLimite] = useState(String(ALI_ENRICH_BATCH_SIZE))
  const [ejecutando, setEjecutando] = useState(false)
  const [credenciales, setCredenciales] = useState<{ zenrowsConfigurado: boolean; scraperApiConfigurada: boolean } | null>(null)
  const [logEnVivo, setLogEnVivo] = useState<NotificacionEtapa[]>([])
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoFinal | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  /** Carga el diagnóstico de credenciales del scraper al montar. */
  const cargarCredenciales = useCallback(async () => {
    try {
      const respuesta = await fetch('/api/admin/ali-pipeline/enrich', { cache: 'no-store' })
      const datos = await respuesta.json()
      if (respuesta.ok && datos?.success) setCredenciales(datos.data)
    } catch {
      // Silencioso: el diagnóstico es opcional.
    }
  }, [])

  useEffect(() => { cargarCredenciales() }, [cargarCredenciales])

  /** Auto-scroll del log hacia el último evento. */
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logEnVivo])

  /** Ejecuta el re-enriquecimiento y consume el stream SSE. */
  const ejecutar = useCallback(async () => {
    if (ejecutando) return
    setEjecutando(true)
    setLogEnVivo([])
    setResultadoFinal(null)

    try {
      const respuesta = await fetch('/api/admin/ali-pipeline/enrich', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ limit: Number(limite) || ALI_ENRICH_BATCH_SIZE }),
      })

      // Si responde JSON (no SSE) es un error temprano (403/400/500).
      const contentType = respuesta.headers.get('content-type') ?? ''
      if (!respuesta.ok || !contentType.includes('text/event-stream')) {
        const datos = await respuesta.json().catch(() => ({}))
        const mensaje = (datos as { error?: string })?.error ?? 'No se pudo iniciar el re-enriquecimiento.'
        toast.error(mensaje)
        setResultadoFinal({ success: false, error: mensaje })
        return
      }

      await consumirSSE(respuesta, {
        onEtapa: (notificacion) => {
          setLogEnVivo((prev) => [...prev, notificacion])
          if (notificacion.etapa === 'error') toast.error(notificacion.mensaje)
          else if (notificacion.etapa === 'actualizando') toast.success(notificacion.mensaje)
          else toast.loading(notificacion.mensaje, { id: 'enrich-progress' })
        },
        onFin: (fin) => {
          setResultadoFinal(fin)
          toast.dismiss('enrich-progress')
          if (fin.success) toast.success('Re-enriquecimiento finalizado correctamente.')
          else toast.error(fin.error ?? 'El re-enriquecimiento terminó con errores.')
        },
      })
    } catch (err: any) {
      const mensaje = err?.message ?? 'Error de red al re-enriquecer productos.'
      console.error('[AliEnrichPanel] ejecutar:', mensaje)
      toast.error(mensaje)
      setResultadoFinal({ success: false, error: mensaje })
    } finally {
      setEjecutando(false)
    }
  }, [limite, ejecutando])

  const credencialesOk = credenciales
    ? credenciales.zenrowsConfigurado || credenciales.scraperApiConfigurada
    : null

  const totalActualizados = resultadoFinal?.data?.filter((r) => r.actualizado).length ?? 0
  const totalErrores = resultadoFinal?.data?.filter((r) => r.error).length ?? 0

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600">
            <RefreshCw size={20} />
          </span>
          <div>
            <h2 className="font-semibold">Actualizar precios y datos</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Re-extrae el detalle real de los últimos productos publicados: precio, stock, especificaciones,
              marca, valoración y opiniones. No modifica el SEO ya generado.
            </p>
          </div>
        </div>

        {credenciales && !credencialesOk && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
            <XCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Falta el proxy de scraping</p>
              <p className="mt-1 text-amber-600/90">
                Configura <code className="rounded bg-amber-500/10 px-1">ZENROWS_API_KEY</code> o{' '}
                <code className="rounded bg-amber-500/10 px-1">SCRAPERAPI_API_KEY</code> en el .env del servidor.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <FormInput
            label="Cantidad a actualizar"
            type="number"
            min={1}
            max={ALI_ENRICH_MAX_PRODUCTS}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            hint={`Entre 1 y ${ALI_ENRICH_MAX_PRODUCTS} productos por ejecución.`}
            className="w-44"
            disabled={ejecutando}
          />
          <FormSubmitButton
            onClick={ejecutar}
            loading={ejecutando}
            loadingText="Actualizando…"
            disabled={ejecutando || credencialesOk === false}
          >
            <RefreshCw size={15} /> Actualizar ahora
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
                <p className="text-sm text-cyan-600">Procesando… no cierres esta página.</p>
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
                  ? `${totalActualizados} actualizados · ${totalErrores} con error`
                  : resultadoFinal.error ?? 'El re-enriquecimiento no completó.'}
              </p>
            </div>
          </div>

          {resultadoFinal.data && resultadoFinal.data.length > 0 && (
            <div className="mt-5 space-y-2">
              {resultadoFinal.data.map((producto) => (
                <div key={producto.id} className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center">
                  <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-medium ${producto.actualizado ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : producto.error ? 'border-red-500/30 bg-red-500/10 text-red-600' : 'border-border bg-muted text-muted-foreground'}`}>
                    {producto.actualizado ? <CheckCircle2 size={12} /> : producto.error ? <XCircle size={12} /> : null}
                    {producto.actualizado ? 'Actualizado' : producto.error ? 'Error' : 'Sin cambios'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground/90">{producto.nombre}</p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">/{producto.slug}</p>
                    {producto.campos.length > 0 && (
                      <p className="mt-0.5 text-xs text-emerald-600">Campos: {producto.campos.join(', ')}</p>
                    )}
                    {producto.error && <p className="mt-0.5 text-xs text-red-600">{producto.error}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

