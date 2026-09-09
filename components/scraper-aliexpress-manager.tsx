'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, CheckCircle2, Clock, Eraser, ExternalLink, Loader2, Package, RefreshCw, Search, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'

/**
 * Panel administrativo de monitoreo y ejecución del Scraper AliExpress.
 * Solo visible en /admin/scraper-aliexpress (protegido por RBAC).
 */

type LogRow = {
  id: string
  url_producto: string
  estado: 'inicio' | 'exito' | 'error'
  mensaje: string | null
  datos_json: unknown | null
  error_json: string | null
  usuario_email: string | null
  duracion_ms: number | null
  created_at: string
}

type ResultadoScraper = {
  ali_product_id: string | null
  titulo_original: string | null
  precio_base: { minimo: number; maximo: number | null; moneda: string; texto_original: string } | null
  metadatos_fisicos: Record<string, string>
  galeria_imagenes: { color: string | null; url: string }[]
  descripcion: string | null
}

const UI_ESTADOS = {
  inicio: { clase: 'bg-blue-500/10 text-blue-600 border-blue-500/30', etiqueta: 'Inicio' },
  exito: { clase: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30', etiqueta: 'Éxito' },
  error: { clase: 'bg-red-500/10 text-red-600 border-red-500/30', etiqueta: 'Error' },
} as const

function formatearFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function ScraperAliExpressManager({ logsIniciales }: { logsIniciales?: LogRow[] }) {
  const [urlProducto, setUrlProducto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [historial, setHistorial] = useState<LogRow[]>(logsIniciales ?? [])
  const [resultado, setResultado] = useState<ResultadoScraper | null>(null)
  const [ultimoError, setUltimoError] = useState<string | null>(null)

  const cargarHistorial = useCallback(async () => {
    try {
      const respuesta = await fetch('/api/admin/scraper-aliexpress', { cache: 'no-store' })
      const datos = await respuesta.json()
      if (!respuesta.ok) throw new Error(datos?.error ?? 'No se pudo cargar el historial.')
      setHistorial(datos?.data ?? [])
    } catch (err: any) {
      console.error('[ScraperManager] cargarHistorial:', err?.message)
      toast.error(err?.message ?? 'No se pudo cargar el historial.')
    }
  }, [])

  useEffect(() => { cargarHistorial() }, [cargarHistorial])

  const ejecutarScraper = useCallback(async () => {
    if (!urlProducto.trim()) { toast.error('Pega la URL de un producto AliExpress.'); return }
    setCargando(true)
    setUltimoError(null)
    setResultado(null)
    try {
      const respuesta = await fetch('/api/admin/scraper-aliexpress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ urlProduct: urlProducto.trim() }),
      })
      const datos = await respuesta.json()
      if (!respuesta.ok) {
        setUltimoError(datos?.error || 'Error al ejecutar el scraper.')
        toast.error(datos?.error || 'Error al ejecutar el scraper.')
      } else {
        setResultado(datos?.data ?? null)
        toast.success('Scrape completado en ' + (datos?.duracionMs ?? 0) + ' ms.')
      }
    } catch (err: any) {
      const mensajeError = err?.message ?? 'Error de red al invocar el scraper.'
      setUltimoError(mensajeError)
      toast.error(mensajeError)
    } finally {
      setCargando(false)
      await cargarHistorial()
    }
  }, [urlProducto, cargarHistorial])

  const limpiarHistorial = async () => {
    if (!window.confirm('Borrar todo el historial de scraping?')) return
    try {
      const respuesta = await fetch('/api/admin/scraper-aliexpress', { method: 'DELETE' })
      const datos = await respuesta.json()
      if (!respuesta.ok) throw new Error(datos?.error ?? 'No se pudo limpiar.')
      setHistorial([])
      toast.success('Historial limpiado.')
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo limpiar.')
    }
  }

  const abrirUrlProducto = (url: string) => {
    const urlLimpia = url.split('?')[0]
    if (urlLimpia && (urlLimpia.startsWith('http://') || urlLimpia.startsWith('https://'))) {
      window.open(urlLimpia, '_blank', 'noopener')
    }
  }

  const totalExitos = historial.filter((l) => l.estado === 'exito').length
  const totalErrores = historial.filter((l) => l.estado === 'error').length
  const metadatos = resultado?.metadatos_fisicos ?? {}
  const metadatosEntries = Object.entries(metadatos).slice(0, 12)
  const galeria = resultado?.galeria_imagenes ?? []

  return (
    <div className="space-y-6">
      {/* Panel de extraccion */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600">
            <Search size={20} />
          </span>
          <div>
            <h2 className="font-semibold">Extraer producto AliExpress</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Renderiza JS via ScraperAPI/ZenRows y parsea el HTML sin IA.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <FormInput
              label="URL del producto"
              value={urlProducto}
              onChange={(e) => setUrlProducto(e.target.value)}
              placeholder="https://es.aliexpress.com/item/100500...html"
              type="url"
            />
          </div>
          <div className="flex items-end gap-2">
            <FormSubmitButton loading={cargando} onClick={ejecutarScraper} className="gap-2">
              {cargando ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
              {cargando ? 'Extrayendo...' : 'Ejecutar extraccion'}
            </FormSubmitButton>
            <button type="button" onClick={limpiarHistorial} className="inline-flex items-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-sm text-muted-foreground transition hover:bg-muted">
              <Eraser size={16} /> Limpiar logs
            </button>
          </div>
        </div>

        {ultimoError && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
            <XCircle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Error del scraper</p>
              <p className="mt-1 text-red-600/90">{ultimoError}</p>
            </div>
          </div>
        )}
      </section>

      {/* Resultado de la extraccion */}
      {resultado && (
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-emerald-600" />
              <div>
                <h2 className="font-semibold">Datos extraidos</h2>
                <p className="text-xs text-muted-foreground">Parseo semantico sin IA.</p>
              </div>
            </div>
            {resultado.ali_product_id && (
              <span className="rounded-full bg-muted px-3 py-1 font-mono text-xs text-muted-foreground">ID: {resultado.ali_product_id}</span>
            )}
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Titulo original</p>
                <p className="mt-1 font-semibold leading-relaxed">{resultado.titulo_original ?? 'No detectado'}</p>
                {resultado.descripcion && <p className="mt-2 text-sm text-muted-foreground">{resultado.descripcion}</p>}
              </div>
              {resultado.precio_base && (
                <div className="rounded-2xl bg-muted/60 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Precio base</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-cyan-600">{resultado.precio_base.texto_original}</p>
                  {resultado.precio_base.maximo ? (
                    <p className="mt-1 text-xs text-muted-foreground">Rango: USD {resultado.precio_base.minimo} a USD {resultado.precio_base.maximo}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Precio unico: USD {resultado.precio_base.minimo}</p>
                  )}
                </div>
              )}
              {metadatosEntries.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Especificaciones fisicas</p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {metadatosEntries.map(([clave, valor]) => (
                      <div key={clave} className="rounded-xl bg-muted/60 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{clave}</p>
                        <p className="mt-0.5 text-sm font-medium">{valor}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {galeria.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Galeria ({galeria.length})</p>
                <div className="mt-3 grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto">
                  {galeria.slice(0, 12).map((img, indice) => (
                    <div key={img.url + indice} className="relative aspect-square overflow-hidden rounded-xl border border-border">
                      <img src={img.url} alt={img.color ?? 'Producto'} className="h-full w-full object-cover" loading="lazy" />
                      {img.color && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[9px] text-white">{img.color}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-5">
          <Bot size={20} className="text-cyan-600" />
          <p className="mt-5 text-sm text-muted-foreground">Total intentos</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{historial.length}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5">
          <CheckCircle2 size={20} className="text-emerald-600" />
          <p className="mt-5 text-sm text-muted-foreground">Exitosas</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{totalExitos}</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5">
          <XCircle size={20} className="text-red-600" />
          <p className="mt-5 text-sm text-muted-foreground">Errores</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{totalErrores}</p>
        </div>
      </div>

      {/* Historial en vivo */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Monitoreo en vivo</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Cada intento queda persistido en scraper_logs.</p>
          </div>
          <button type="button" onClick={cargarHistorial} className="inline-flex items-center gap-2 rounded-2xl border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted">
            <RefreshCw size={15} /> Refrescar
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {historial.length === 0 && (
            <div className="rounded-2xl bg-muted/40 p-10 text-center text-sm text-muted-foreground">
              <Clock size={36} className="mx-auto mb-3 text-muted-foreground/50" />
              Aun no hay intentos. Pega una URL y ejecuta la primera extraccion.
            </div>
          )}
          {historial.map((log) => {
            const ui = UI_ESTADOS[log.estado]
            return (
              <div key={log.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center">
                <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-medium ${ui.clase}`}>
                  {log.estado === 'exito' ? <CheckCircle2 size={12} /> : log.estado === 'error' ? <XCircle size={12} /> : <Clock size={12} />}
                  {ui.etiqueta}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-muted-foreground">{log.url_producto}</p>
                  {log.mensaje && <p className="mt-0.5 text-sm text-foreground/90">{log.mensaje}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  {log.duracion_ms != null && <span>{log.duracion_ms} ms</span>}
                  <span>{log.usuario_email ?? '—'}</span>
                  <span className="hidden text-[10px] uppercase tracking-widest lg:inline">{formatearFecha(log.created_at)}</span>
                  <button type="button" onClick={() => abrirUrlProducto(log.url_producto)} title="Abrir URL" className="grid size-8 place-items-center rounded-full transition hover:bg-muted hover:text-foreground">
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
