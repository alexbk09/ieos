'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Package,
  Play,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'

/**
 * Panel de control del Pipeline de Automatización AliExpress (Fase 2.2).
 * ------------------------------------------------------------------
 * Solo visible en /admin/ali-pipeline (protegido por RBAC + requireAdmin).
 *
 * El administrador escribe una "Palabra Clave Semilla" (ej: "tira led rgb")
 * y pulsa "Escanear y Optimizar Nicho". El componente:
 *   1) Abre un stream SSE contra /api/admin/ali-pipeline (POST).
 *   2) Consume los eventos "etapa" y muestra un toast en tiempo real por
 *      cada paso del pipeline (descubriendo, filtrando, extrayendo,
 *      generando enlace, procesando SEO, guardando, completado/error).
 *   3) Al recibir "fin" muestra el resumen final con los productos guardados.
 *
 * Reglas de oro:
 *  - Cero llamadas directas a Supabase: todo pasa por la API route.
 *  - Estados de carga premium (spinner + log en vivo) y manejo defensivo
 *    de errores de red con try-catch visible al usuario.
 */

type EtapaPipeline =
  | 'descubriendo'
  | 'filtrado'
  | 'extrayendo'
  | 'generando_enlace'
  | 'procesando_seo'
  | 'traduciendo'
  | 'guardando'
  | 'completado'
  | 'error'

type NotificacionEtapa = {
  etapa: EtapaPipeline
  mensaje: string
  productoId?: string | null
  index?: number
  total?: number
}

type ResultadoProducto = {
  aliasImagenTitulo: string
  aliProductId: string
  tituloGabriel: string
  guardado: boolean
  error?: string | null
  slug?: string | null
}

type ResultadoFinal = {
  success: boolean
  data?: ResultadoProducto[]
  error?: string
}

type CredencialesEstado = {
  appKeyConfigurada: boolean
  appSecretConfigurado: boolean
  trackingIdConfigurado: boolean
}

/** Etiquetas humanas por etapa para el log en vivo. */
const ETIQUETA_ETAPA: Record<EtapaPipeline, string> = {
  descubriendo: 'Descubriendo productos',
  filtrado: 'Filtrando duplicados',
  extrayendo: 'Extrayendo detalle',
  generando_enlace: 'Generando enlace',
  procesando_seo: 'Procesando SEO',
  traduciendo: 'Traduciendo el nicho',
  guardando: 'Guardando en Supabase',
  completado: 'Completado',
  error: 'Error',
}

/** Icono y color por etapa para el log en vivo. */
function IconoEtapa({ etapa }: { etapa: EtapaPipeline }) {
  if (etapa === 'error') return <XCircle size={16} className="text-red-500" />
  if (etapa === 'completado') return <CheckCircle2 size={16} className="text-emerald-500" />
  if (etapa === 'procesando_seo') return <Sparkles size={16} className="text-violet-500" />
  if (etapa === 'extrayendo' || etapa === 'guardando') return <Package size={16} className="text-cyan-500" />
  return <Search size={16} className="text-blue-500" />
}

export function AliPipelineManager() {
  const [keyword, setKeyword] = useState('')
  const [ejecutando, setEjecutando] = useState(false)
  const [credenciales, setCredenciales] = useState<CredencialesEstado | null>(null)
  const [logEnVivo, setLogEnVivo] = useState<NotificacionEtapa[]>([])
  const [resultadoFinal, setResultadoFinal] = useState<ResultadoFinal | null>(null)
  const [logExpandido, setLogExpandido] = useState(true)
  const logRef = useRef<HTMLDivElement | null>(null)

  /** Carga el estado de credenciales (diagnóstico) al montar. */
  const cargarCredenciales = useCallback(async () => {
    try {
      const respuesta = await fetch('/api/admin/ali-pipeline', { cache: 'no-store' })
      const datos = await respuesta.json()
      if (respuesta.ok && datos?.success) setCredenciales(datos.data)
    } catch {
      // Silencioso: el diagnóstico es opcional.
    }
  }, [])

  useEffect(() => { cargarCredenciales() }, [cargarCredenciales])

  /** Auto-scroll del log en vivo hacia el último evento. */
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logEnVivo])

  /** Consume el stream SSE y dispara toasts por cada etapa. */
  const ejecutarPipeline = useCallback(async () => {
    const palabra = keyword.trim()
    if (!palabra) { toast.error('Escribe una palabra clave semilla.'); return }
    if (ejecutando) return

    setEjecutando(true)
    setLogEnVivo([])
    setResultadoFinal(null)

    try {
      const respuesta = await fetch('/api/admin/ali-pipeline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyword: palabra }),
      })

      // Si la API responde JSON (no SSE) es un error temprano (403/400/500).
      const contentType = respuesta.headers.get('content-type') ?? ''
      if (!respuesta.ok || !contentType.includes('text/event-stream')) {
        const datos = await respuesta.json().catch(() => ({}))
        const mensaje = (datos as { error?: string })?.error ?? 'No se pudo iniciar el pipeline.'
        toast.error(mensaje)
        setResultadoFinal({ success: false, error: mensaje })
        return
      }

      if (!respuesta.body) throw new Error('El navegador no soporta streaming de respuesta.')

      // Lee el stream SSE línea a línea.
      const lector = respuesta.body.getReader()
      const decodificador = new TextDecoder()
      let buffer = ''

      const procesarBloque = (bloque: string) => {
        // Cada evento SSE termina con una línea en blanco (\n\n).
        const eventos = bloque.split('\n\n')
        for (const evento of eventos) {
          if (!evento.trim()) continue
          const lineas = evento.split('\n')
          let tipoEvento = 'message'
          let datosCrudos = ''
          for (const linea of lineas) {
            if (linea.startsWith('event:')) tipoEvento = linea.slice(6).trim()
            else if (linea.startsWith('data:')) datosCrudos += linea.slice(5).trim()
          }
          if (!datosCrudos) continue
          try {
            const payload = JSON.parse(datosCrudos)
            if (tipoEvento === 'etapa') {
              const notificacion = payload as NotificacionEtapa
              setLogEnVivo((prev) => [...prev, notificacion])
              // Toast informativo por etapa (no spamear en cada producto).
              if (notificacion.etapa === 'descubriendo' || notificacion.etapa === 'filtrado' || notificacion.etapa === 'completado' || notificacion.etapa === 'error') {
                if (notificacion.etapa === 'error') toast.error(notificacion.mensaje)
                else toast.info(notificacion.mensaje)
              } else if (notificacion.etapa === 'guardando') {
                toast.success(notificacion.mensaje)
              } else if (notificacion.etapa === 'procesando_seo') {
                toast.loading(notificacion.mensaje, { id: 'seo-progress' })
              } else {
                toast.loading(notificacion.mensaje, { id: 'pipeline-progress' })
              }
            } else if (tipoEvento === 'fin') {
              const fin = payload as ResultadoFinal
              setResultadoFinal(fin)
              toast.dismiss('seo-progress')
              toast.dismiss('pipeline-progress')
              if (fin.success) toast.success('Pipeline finalizado correctamente.')
              else toast.error(fin.error ?? 'El pipeline terminó con errores.')
            }
          } catch {
            // Ignora eventos malformados.
          }
        }
      }

      // Bucle de lectura del stream.
      for (;;) {
        const { done, value } = await lector.read()
        if (done) break
        buffer += decodificador.decode(value, { stream: true })
        // Procesa solo bloques completos (los que terminan en \n\n).
        const indice = buffer.lastIndexOf('\n\n')
        if (indice >= 0) {
          procesarBloque(buffer.slice(0, indice))
          buffer = buffer.slice(indice + 2)
        }
      }
      // Procesa lo que quede en el buffer.
      if (buffer.trim()) procesarBloque(buffer)
    } catch (err: any) {
      const mensaje = err?.message ?? 'Error de red al ejecutar el pipeline.'
      console.error('[AliPipelineManager] ejecutarPipeline:', mensaje)
      toast.error(mensaje)
      setResultadoFinal({ success: false, error: mensaje })
    } finally {
      setEjecutando(false)
    }
  }, [keyword, ejecutando])

  const credencialesCompletas = credenciales
    ? credenciales.appKeyConfigurada && credenciales.appSecretConfigurado && credenciales.trackingIdConfigurado
    : null

  const totalGuardados = resultadoFinal?.data?.filter((r) => r.guardado).length ?? 0
  const totalErrores = resultadoFinal?.data?.filter((r) => !r.guardado).length ?? 0

  return (
    <div className="space-y-6">
      {/* Panel de ejecución */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-violet-500/10 text-violet-600">
            <Bot size={20} />
          </span>
          <div>
            <h2 className="font-semibold">Escanear y Optimizar Nicho</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Descubre los más vendidos por keyword, extrae detalle, genera enlace de afiliado y optimiza SEO con DeepSeek.
            </p>
          </div>
        </div>

        {/* Diagnóstico de credenciales */}
        {credenciales && !credencialesCompletas && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
            <XCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Faltan credenciales de AliExpress Open Platform</p>
              <p className="mt-1 text-amber-600/90">
                Configura <code className="rounded bg-amber-500/10 px-1">ALI_APP_KEY</code>,{' '}
                <code className="rounded bg-amber-500/10 px-1">ALI_APP_SECRET</code> y{' '}
                <code className="rounded bg-amber-500/10 px-1">ALI_TRACKING_ID</code> en el .env del servidor para poder ejecutar el pipeline.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <FormInput
              label="Palabra Clave Semilla"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Ej: tira led rgb, funda iphone, reloj smartwatch..."
              onKeyDown={(e) => { if (e.key === 'Enter') ejecutarPipeline() }}
            />
          </div>
          <div className="flex items-end">
            {credencialesCompletas ? (
              <FormSubmitButton loading={ejecutando} onClick={ejecutarPipeline} className="gap-2">
                {ejecutando ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {ejecutando ? 'Optimizando nicho...' : 'Escanear y Optimizar Nicho'}
              </FormSubmitButton>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground opacity-50"
              >
                <Play size={16} />
                Escanear y Optimizar Nicho
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          El pipeline procesa hasta 5 productos nuevos por ejecución para no agotar créditos del proxy ni de DeepSeek.
        </p>
      </section>

      {/* Log en vivo */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <button
          type="button"
          onClick={() => setLogExpandido((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600">
              <Search size={20} />
            </span>
            <div>
              <h2 className="font-semibold">Progreso en vivo</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {ejecutando ? 'El pipeline está corriendo en el servidor...' : logEnVivo.length === 0 ? 'Aún no hay actividad.' : `${logEnVivo.length} eventos registrados.`}
              </p>
            </div>
          </div>
          {logExpandido ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
        </button>

        {logExpandido && (
          <div ref={logRef} className="mt-5 max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {logEnVivo.length === 0 && !ejecutando && (
              <div className="rounded-2xl bg-muted/40 p-10 text-center text-sm text-muted-foreground">
                <Bot size={36} className="mx-auto mb-3 text-muted-foreground/50" />
                Escribe una keyword y pulsa "Escanear y Optimizar Nicho" para ver el progreso aquí.
              </div>
            )}
            {logEnVivo.map((log, indice) => (
              <div key={indice} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3">
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
              <div className="flex items-center gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 px-4 py-3">
                <Loader2 size={16} className="animate-spin text-violet-500" />
                <p className="text-sm text-violet-600">Procesando... no cierres esta página.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Resultado final */}
      {resultadoFinal && (
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {resultadoFinal.success ? (
                <CheckCircle2 size={20} className="text-emerald-600" />
              ) : (
                <XCircle size={20} className="text-red-600" />
              )}
              <div>
                <h2 className="font-semibold">Resultado del pipeline</h2>
                <p className="text-xs text-muted-foreground">
                  {resultadoFinal.success
                    ? `${totalGuardados} guardados · ${totalErrores} con error`
                    : resultadoFinal.error ?? 'El pipeline no completó.'}
                </p>
              </div>
            </div>
          </div>

          {resultadoFinal.data && resultadoFinal.data.length > 0 && (
            <div className="mt-5 space-y-2">
              {resultadoFinal.data.map((producto) => (
                <div key={producto.aliProductId} className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center">
                  <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-medium ${producto.guardado ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-red-500/30 bg-red-500/10 text-red-600'}`}>
                    {producto.guardado ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {producto.guardado ? 'Guardado' : 'Error'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-muted-foreground">ID: {producto.aliProductId}</p>
                    <p className="mt-0.5 truncate text-sm text-foreground/90">{producto.aliasImagenTitulo}</p>
                    {producto.error && <p className="mt-0.5 text-xs text-red-600">{producto.error}</p>}
                    {producto.slug && (
                      <a href={`/productos/${producto.slug}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-600 hover:underline">
                        Ver ficha <ExternalLink size={11} />
                      </a>
                    )}
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
