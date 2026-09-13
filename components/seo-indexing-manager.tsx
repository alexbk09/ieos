'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Radar,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import {
  INDEXING_CONTENT_TYPE_LABELS,
  INDEXING_DAILY_LIMIT,
  INDEXING_STATUS_LABELS,
  SEO_INDEXING_BATCH_SIZE,
} from '@/lib/constants'

/**
 * Panel "Indexación en Buscadores" (cliente).
 * ------------------------------------------------------------------
 * Consume SOLO la API RBAC /api/admin/seo-indexing (nunca Supabase ni Google).
 * Ofrece lo que pediste: ver las URLs del sitemap que siguen sin indexar,
 * enviarlas en lotes de 25 con tope diario de 100 y auditar su estado real.
 */

/** Fila de la cola de indexación (proyección que devuelve la API). */
type IndexingUrlRow = {
  id: string
  url: string
  tipo: string
  estado: string
  canal: string | null
  origen: string
  lastmod: string | null
  enviado_en: string | null
  inspeccionado_en: string | null
  intentos: number
  ultimo_error: string | null
  cobertura: string | null
  prioridad: number
}

/** Movimiento del registro de auditoría. */
type IndexingLogRow = {
  id: string
  url: string
  canal: string
  accion: string
  resultado: string
  http_status: number | null
  detalle: string | null
  created_at: string
}

/** Resumen por estado de la cola. */
type ResumenCola = {
  total: number
  pendiente: number
  enviando: number
  enviado: number
  indexado: number
  no_indexado: number
  excluido: number
  error: number
}

/** Cuota diaria de envíos. */
type Cuota = { consumidos: number; limite: number; restantes: number; agotada: boolean }

/** Panorama completo que devuelve el GET. */
type Panorama = {
  resumen: ResumenCola
  cuota: Cuota
  enviosHoy: { indexnow: number; google: number }
  google: {
    configurado: boolean
    estricto: boolean
    clientEmail: string | null
    projectId: string | null
    siteUrl: string | null
    motivo: string
  }
  indexnow: {
    habilitado: boolean
    configurado: boolean
    clave: string | null
    host: string | null
    keyLocation: string | null
    motivo: string
  }
  ultimosMovimientos: IndexingLogRow[]
}

/** Resultado de una acción por lotes. */
type ResultadoLote = {
  procesadas: number
  enviadas: number
  inspeccionadas: number
  bloqueadas: number
  conError: number
  omitidas: number
  mensajes: string[]
  cuota: Cuota
  resumen: ResumenCola
}

/** Informe del auto-diagnóstico de configuración. */
type Diagnostico = {
  indexnow: { configurado: boolean; archivoOk: boolean; archivoUrl: string | null; detalle: string }
  google: {
    configurado: boolean
    tokenOk: boolean
    clientEmail: string | null
    siteUrl: string | null
    detalle: string
  }
  cuota: Cuota
  mensajes: string[]
}

/** Filtros del listado. */
type Filtros = { estado: string; tipo: string; pendientes: boolean }

/** Llamada a la API del módulo; lanza con el mensaje de error del servidor. */
async function peticionApi(
  method: 'GET' | 'POST' | 'DELETE',
  opciones: { query?: string; body?: unknown } = {},
): Promise<any> {
  const respuesta = await fetch(`/api/admin/seo-indexing${opciones.query ?? ''}`, {
    method,
    cache: 'no-store',
    headers: method === 'GET' ? undefined : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(opciones.body ?? {}),
  })
  const datos = await respuesta.json().catch(() => ({}))
  if (!respuesta.ok) throw new Error(datos?.error ?? 'No se pudo completar la operación.')
  return datos
}

/** Color del badge según el estado de la URL. */
function claseDeEstado(estado: string): string {
  if (estado === 'indexado') return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
  if (estado === 'no_indexado') return 'bg-amber-500/10 text-amber-600 border-amber-500/30'
  if (estado === 'excluido') return 'bg-slate-500/10 text-slate-500 border-slate-500/30'
  if (estado === 'error') return 'bg-red-500/10 text-red-600 border-red-500/30'
  if (estado === 'enviado') return 'bg-blue-500/10 text-blue-600 border-blue-500/30'
  if (estado === 'enviando') return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
  return 'bg-muted text-muted-foreground border-border'
}

/** Fecha corta legible (o '—' si no hay valor). */
function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function SeoIndexingManager({
  panorama: panoramaInicial,
  colaInicial,
  totalInicial,
  canWrite,
  canDelete,
}: {
  panorama: Panorama
  colaInicial: IndexingUrlRow[]
  totalInicial: number
  canWrite: boolean
  canDelete: boolean
}) {
  const [panorama, setPanorama] = useState<Panorama>(panoramaInicial)
  const [filas, setFilas] = useState<IndexingUrlRow[]>(colaInicial)
  const [total, setTotal] = useState(totalInicial)
  const [filtros, setFiltros] = useState<Filtros>({ estado: 'todos', tipo: 'todos', pendientes: false })
  const [cargando, setCargando] = useState(false)
  const [accion, setAccion] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<{ enviadas: number; restantes: number } | null>(null)
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null)

  /** Relee el panorama y la cola con los filtros activos. */
  const refrescar = useCallback(
    async (nuevosFiltros?: Filtros) => {
      const activos = nuevosFiltros ?? filtros
      setCargando(true)
      try {
        const query = `?estado=${activos.estado}&tipo=${activos.tipo}&pendientes=${activos.pendientes ? '1' : '0'}&limit=${SEO_INDEXING_BATCH_SIZE}`
        const datos = await peticionApi('GET', { query })
        setPanorama(datos.panorama)
        setFilas(datos.cola.items)
        setTotal(datos.cola.total)
      } catch (err: any) {
        toast.error('No se pudo cargar el panel', { description: err?.message })
      } finally {
        setCargando(false)
      }
    },
    [filtros],
  )

  /** Aplica un cambio de filtro y recarga (el estado local mantiene la UI al día). */
  const cambiarFiltro = useCallback(
    (parcial: Partial<Filtros>) => {
      const siguientes = { ...filtros, ...parcial }
      setFiltros(siguientes)
      refrescar(siguientes)
    },
    [filtros, refrescar],
  )

  /** Ejecuta una acción por lotes y refresca con el resultado. */
  const ejecutarAccion = useCallback(
    async (
      nombre: 'sincronizar' | 'enviar' | 'inspeccionar' | 'sitemap' | 'diagnostico',
      limit?: number,
    ) => {
      setAccion(nombre)
      try {
        const datos = await peticionApi('POST', { body: { accion: nombre, limit } })
        return datos
      } finally {
        setAccion(null)
      }
    },
    [],
  )

  /** Sincroniza la cola con el sitemap publicado (solo AGREGA lo que falta). */
  const sincronizar = useCallback(async () => {
    try {
      const { resultado } = await ejecutarAccion('sincronizar')
      toast.success('Cola sincronizada', {
        description: `${resultado.insertadas} URL(s) nuevas de ${resultado.totalSitemap} en el sitemap (fuente: ${resultado.fuente === 'sitemap_publicado' ? 'sitemap' : 'datos internos'}).`,
      })
      await refrescar()
    } catch (err: any) {
      toast.error('No se pudo sincronizar', { description: err?.message })
    }
  }, [ejecutarAccion, refrescar])

  /** Envía UNA tanda (25 URLs) por los canales permitidos. */
  const enviarTanda = useCallback(async () => {
    try {
      const { resultado } = (await ejecutarAccion('enviar', SEO_INDEXING_BATCH_SIZE)) as {
        resultado: ResultadoLote
      }
      if (resultado.conError > 0) {
        toast.warning('Tanda enviada con incidencias', {
          description: `${resultado.enviadas} aceptada(s) · ${resultado.conError} con error · quedan ${resultado.cuota.restantes} envíos hoy.`,
        })
      } else {
        toast.success('Tanda enviada', {
          description: `${resultado.enviadas} URL(s) aceptadas · quedan ${resultado.cuota.restantes} envíos hoy.`,
        })
      }
      await refrescar()
    } catch (err: any) {
      toast.error('No se pudo enviar la tanda', { description: err?.message })
    }
  }, [ejecutarAccion, refrescar])

  /** Envía tandas seguidas hasta agotar la cuota diaria (límite 100/día). */
  const enviarTodo = useCallback(async () => {
    setProgreso({ enviadas: 0, restantes: panorama.cuota.restantes })
    let enviadas = 0
    try {
      for (let vuelta = 0; vuelta < Math.ceil(INDEXING_DAILY_LIMIT / SEO_INDEXING_BATCH_SIZE); vuelta += 1) {
        const { resultado } = (await ejecutarAccion('enviar', SEO_INDEXING_BATCH_SIZE)) as {
          resultado: ResultadoLote
        }
        enviadas += resultado.enviadas
        setProgreso({ enviadas, restantes: resultado.cuota.restantes })

        // Fin: cuota agotada, nada pendiente o tanda sin avance (evita bucles).
        if (resultado.cuota.agotada) break
        if (resultado.procesadas === 0) break
        if (resultado.enviadas === 0 && resultado.conError === 0) break
      }
      toast.success('Envío por lotes terminado', {
        description: `${enviadas} URL(s) aceptadas. La cuota se renueva a las 00:00 UTC.`,
      })
    } catch (err: any) {
      toast.error('Se detuvo el envío por lotes', { description: err?.message })
    } finally {
      setProgreso(null)
      await refrescar()
    }
  }, [ejecutarAccion, panorama.cuota.restantes, refrescar])

  /** Audita en Google una tanda de URLs (URL Inspection API, solo lectura). */
  const auditar = useCallback(async () => {
    try {
      const { resultado } = (await ejecutarAccion('inspeccionar', SEO_INDEXING_BATCH_SIZE)) as {
        resultado: ResultadoLote
      }
      toast.success('Auditoría completada', {
        description: `${resultado.inspeccionadas} URL(s) consultadas en Search Console · ${resultado.conError} sin respuesta.`,
      })
      await refrescar()
    } catch (err: any) {
      toast.error('No se pudo auditar', { description: err?.message })
    }
  }, [ejecutarAccion, refrescar])

  /** Reenvía el sitemap a Search Console (canal correcto para páginas normales). */
  const reenviarSitemap = useCallback(async () => {
    try {
      const { resultado } = await ejecutarAccion('sitemap')
      if (resultado.ok) toast.success('Sitemap reenviado a Google', { description: resultado.detalle })
      else toast.error('Google rechazó el reenvío', { description: resultado.detalle })
      await refrescar()
    } catch (err: any) {
      toast.error('No se pudo reenviar el sitemap', { description: err?.message })
    }
  }, [ejecutarAccion, refrescar])

  /** Ejecuta el diagnóstico de configuración (IndexNow + Google). */
  const ejecutarDiagnostico = useCallback(async () => {
    try {
      const { resultado } = (await ejecutarAccion('diagnostico')) as { resultado: Diagnostico }
      setDiagnostico(resultado)
      if (resultado.indexnow.archivoOk && resultado.google.tokenOk) {
        toast.success('Configuración correcta', { description: 'IndexNow y Google responden bien.' })
      } else {
        toast.warning('Hay algo por revisar', { description: resultado.mensajes.join(' ') })
      }
    } catch (err: any) {
      toast.error('No se pudo diagnosticar', { description: err?.message })
    }
  }, [ejecutarAccion])

  /** Quita una URL de la cola (no toca la web, solo el seguimiento). */
  const quitarUrl = useCallback(
    async (id: string) => {
      try {
        await peticionApi('DELETE', { body: { accion: 'quitar-urls', ids: [id] } })
        toast.success('URL quitada de la cola.')
        await refrescar()
      } catch (err: any) {
        toast.error('No se pudo quitar la URL', { description: err?.message })
      }
    },
    [refrescar],
  )

  /** Vacía el registro de auditoría (requiere permiso de borrado). */
  const limpiarRegistro = useCallback(async () => {
    if (!window.confirm('¿Borrar TODO el registro de auditoría de indexación?')) return
    try {
      await peticionApi('DELETE', { body: { accion: 'limpiar-registro' } })
      toast.success('Registro de auditoría vaciado.')
      await refrescar()
    } catch (err: any) {
      toast.error('No se pudo limpiar el registro', { description: err?.message })
    }
  }, [refrescar])

  /** Columnas de la tabla de la cola (memoizadas: no se recalculan por render). */
  const columnas = useMemo<TableColumn<IndexingUrlRow>[]>(
    () => [
      {
        key: 'url',
        header: 'URL',
        sortable: true,
        sortValue: (fila) => fila.url,
        render: (fila) => (
          <a
            href={fila.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-[380px] items-center gap-1.5 truncate text-sm text-primary hover:underline"
            title={fila.url}
          >
            {fila.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
            <ExternalLink size={12} className="shrink-0" />
          </a>
        ),
      },
      {
        key: 'tipo',
        header: 'Tipo',
        render: (fila) => (
          <span className="text-xs text-muted-foreground">
            {INDEXING_CONTENT_TYPE_LABELS[fila.tipo as keyof typeof INDEXING_CONTENT_TYPE_LABELS] ?? fila.tipo}
          </span>
        ),
      },
      {
        key: 'estado',
        header: 'Estado',
        render: (fila) => (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${claseDeEstado(fila.estado)}`}>
            {INDEXING_STATUS_LABELS[fila.estado as keyof typeof INDEXING_STATUS_LABELS] ?? fila.estado}
          </span>
        ),
      },
      {
        key: 'canal',
        header: 'Canal',
        hiddenMobile: true,
        render: (fila) => (
          <span className="text-xs text-muted-foreground">{fila.canal ?? fila.origen}</span>
        ),
      },
      {
        key: 'enviado',
        header: 'Último envío',
        hiddenMobile: true,
        sortable: true,
        sortValue: (fila) => fila.enviado_en ?? '',
        render: (fila) => <span className="text-xs text-muted-foreground">{fechaCorta(fila.enviado_en)}</span>,
      },
      {
        key: 'cobertura',
        header: 'Cobertura de Google',
        hiddenMobile: true,
        render: (fila) => (
          <span className="block max-w-[240px] truncate text-xs text-muted-foreground" title={fila.cobertura ?? fila.ultimo_error ?? ''}>
            {fila.cobertura ?? fila.ultimo_error ?? (fila.intentos > 0 ? `${fila.intentos} intento(s)` : '—')}
          </span>
        ),
      },
      {
        key: 'acciones',
        header: '',
        render: (fila) =>
          canDelete ? (
            <button
              type="button"
              onClick={() => quitarUrl(fila.id)}
              title="Quitar de la cola"
              className="inline-flex size-8 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Trash2 size={14} />
            </button>
          ) : null,
      },
    ],
    [canDelete, quitarUrl],
  )

  const puede = canWrite && !accion && !progreso

  return (
    <div className="grid gap-6">
      {/* Aviso de cumplimiento: por qué Google no recibe productos por su API */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          {panorama.google.estricto ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600">
              <ShieldCheck size={14} /> Cumplimiento estricto de Google
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-600">
              <ShieldAlert size={14} /> Modo no estricto: riesgo de política
            </span>
          )}
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            IndexNow {panorama.indexnow.configurado ? 'listo' : 'sin configurar'}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            Google Search Console {panorama.google.configurado ? 'listo' : 'sin credenciales'}
          </span>
        </div>

        <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
          <span>
            La <strong>Indexing API de Google</strong> solo admite páginas con <code>JobPosting</code> o{' '}
            <code>BroadcastEvent</code>: enviarle productos, categorías o guías va contra sus directrices y puede
            revocar el acceso. Por eso aquí cada publicación se empuja por <strong>IndexNow</strong> (Bing, Yandex,
            Seznam y Naver) y Google la recibe por el <strong>sitemap</strong> (con su <code>lastmod</code> real) más el
            reenvío desde Search Console. El estado de indexación se audita con la URL Inspection API (solo lectura).
          </span>
        </p>
        {!panorama.google.configurado || !panorama.indexnow.configurado ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {panorama.google.motivo} {panorama.indexnow.motivo}
          </p>
        ) : null}
      </section>

      {/* Tarjetas del estado de la cola */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Tarjeta icono={<Radar size={18} />} etiqueta="URLs en la cola" valor={panorama.resumen.total} />
        <Tarjeta
          icono={<Send size={18} />}
          etiqueta="Pendientes de enviar"
          valor={panorama.resumen.pendiente}
          tono={panorama.resumen.pendiente > 0 ? 'warn' : 'default'}
        />
        <Tarjeta
          icono={<CheckCircle2 size={18} />}
          etiqueta="Indexadas en Google"
          valor={panorama.resumen.indexado}
          tono="ok"
        />
        <Tarjeta
          icono={<AlertTriangle size={18} />}
          etiqueta="Sin indexar"
          valor={panorama.resumen.no_indexado}
          tono={panorama.resumen.no_indexado > 0 ? 'warn' : 'default'}
        />
        <Tarjeta
          icono={<ShieldCheck size={18} />}
          etiqueta="Envíos restantes hoy"
          valor={panorama.cuota.restantes}
          tono={panorama.cuota.agotada ? 'warn' : 'ok'}
        />
        <Tarjeta icono={<Clock size={18} />} etiqueta="Enviadas (acumulado)" valor={panorama.resumen.enviado} />
      </div>

      {/* Acciones por lotes */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Enviar a buscadores en lotes</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Tandas de {SEO_INDEXING_BATCH_SIZE} URLs con un máximo de {INDEXING_DAILY_LIMIT} al día. La cuota se
              renueva a las 00:00 UTC.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={sincronizar}
              disabled={!puede}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {accion === 'sincronizar' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Sincronizar sitemap
            </button>
            <button
              type="button"
              onClick={auditar}
              disabled={!puede}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {accion === 'inspeccionar' ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              Auditar en Google
            </button>
            <button
              type="button"
              onClick={reenviarSitemap}
              disabled={!puede}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {accion === 'sitemap' ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              Reenviar sitemap
            </button>
            <button
              type="button"
              onClick={ejecutarDiagnostico}
              disabled={!puede}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {accion === 'diagnostico' ? <Loader2 size={15} className="animate-spin" /> : <Activity size={15} />}
              Diagnóstico
            </button>
            <button
              type="button"
              onClick={enviarTanda}
              disabled={!puede || panorama.cuota.agotada}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {accion === 'enviar' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Enviar tanda ({SEO_INDEXING_BATCH_SIZE})
            </button>
            <button
              type="button"
              onClick={enviarTodo}
              disabled={!puede || panorama.cuota.agotada}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              <Send size={15} />
              Enviar todo (hasta {INDEXING_DAILY_LIMIT}/día)
            </button>
            {canDelete ? (
              <button
                type="button"
                onClick={limpiarRegistro}
                disabled={!puede}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-500/30 px-4 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <Trash2 size={15} /> Limpiar registro
              </button>
            ) : null}
          </div>
        </div>

        {/* Progreso del envío por lotes (feedback en vivo) */}
        {progreso ? (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Enviando lotes… {progreso.enviadas} URL(s) aceptadas</span>
              <span>{progreso.restantes} restantes hoy</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${Math.min(100, Math.round((progreso.enviadas / Math.max(1, panorama.cuota.restantes + progreso.enviadas)) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {/* Informe del diagnóstico (instalaciones nuevas / cambios de dominio) */}
        {diagnostico ? (
          <div className="mt-5 rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Diagnóstico de configuración
            </p>
            <ul className="mt-3 grid gap-2 text-sm">
              <li className="flex items-start gap-2">
                {diagnostico.indexnow.archivoOk ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                )}
                <span>
                  <strong>IndexNow:</strong> {diagnostico.indexnow.detalle}
                  {diagnostico.indexnow.archivoUrl ? (
                    <a
                      href={diagnostico.indexnow.archivoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-primary hover:underline"
                    >
                      ver archivo
                    </a>
                  ) : null}
                </span>
              </li>
              <li className="flex items-start gap-2">
                {diagnostico.google.tokenOk ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                )}
                <span>
                  <strong>Google:</strong> {diagnostico.google.detalle}
                  {diagnostico.google.siteUrl ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      propiedad: {diagnostico.google.siteUrl}
                    </span>
                  ) : null}
                </span>
              </li>
            </ul>
          </div>
        ) : null}
      </section>

      {/* Cola de URLs: filtros + tabla */}
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtros.estado}
            onChange={(evento) => cambiarFiltro({ estado: evento.target.value })}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          >
            <option value="todos">Todos los estados</option>
            {Object.entries(INDEXING_STATUS_LABELS).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
          <select
            value={filtros.tipo}
            onChange={(evento) => cambiarFiltro({ tipo: evento.target.value })}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring"
          >
            <option value="todos">Todos los tipos</option>
            {Object.entries(INDEXING_CONTENT_TYPE_LABELS).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => cambiarFiltro({ pendientes: !filtros.pendientes })}
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
              filtros.pendientes ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
            }`}
          >
            Solo pendientes
          </button>
          <button
            type="button"
            onClick={() => refrescar()}
            disabled={cargando}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {cargando ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Refrescar
          </button>
          <span className="text-xs text-muted-foreground">
            {total} URL(s) en este filtro · mostrando {filas.length}
          </span>
        </div>

        <DataTable
          data={filas}
          columns={columnas}
          rowKey={(fila) => fila.id}
          searchKeys={(fila) => `${fila.url} ${fila.tipo} ${fila.estado} ${fila.cobertura ?? ''} ${fila.ultimo_error ?? ''}`}
          searchPlaceholder="Buscar por URL, tipo, estado o cobertura…"
          emptyMessage="No hay URLs con esos filtros"
          noDataMessage="La cola está vacía: pulsa «Sincronizar sitemap»"
          loading={cargando}
          pageSize={10}
        />
      </section>

      {/* Últimos movimientos (auditoría) */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-cyan-500/10 text-cyan-600">
            <Clock size={20} />
          </span>
          <div>
            <h2 className="font-semibold">Últimos movimientos</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Cada envío y cada auditoría quedan registrados con su canal, código HTTP y resultado.
            </p>
          </div>
        </div>

        {panorama.ultimosMovimientos.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Aún no hay movimientos registrados.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {panorama.ultimosMovimientos.map((movimiento) => (
              <li key={movimiento.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="truncate text-xs text-muted-foreground" title={movimiento.url}>
                  <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-foreground">
                    {movimiento.canal}
                  </span>
                  {movimiento.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <span className={`rounded-full border px-2 py-0.5 ${claseDeEstado(movimiento.resultado === 'ok' ? 'indexado' : movimiento.resultado === 'error' ? 'error' : 'pendiente')}`}>
                    {movimiento.resultado}
                    {movimiento.http_status ? ` · ${movimiento.http_status}` : ''}
                  </span>
                  <span className="text-muted-foreground">{fechaCorta(movimiento.created_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Tarjeta de métrica del panel (mismo lenguaje visual que los demás módulos). */
function Tarjeta({
  icono,
  etiqueta,
  valor,
  tono = 'default',
}: {
  icono: ReactNode
  etiqueta: string
  valor: number
  tono?: 'default' | 'warn' | 'ok'
}) {
  const claseTono =
    tono === 'warn'
      ? 'text-amber-600 dark:text-amber-400'
      : tono === 'ok'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-foreground'
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary">{icono}</span>
      <p className="mt-6 font-mono text-xs uppercase tracking-widest text-muted-foreground">{etiqueta}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${claseTono}`}>{valor}</p>
    </div>
  )
}






