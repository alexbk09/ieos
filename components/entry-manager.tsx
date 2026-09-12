'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Bot,
  Eye,
  EyeOff,
  Languages,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { FormInput, FormTextarea } from '@/components/ui/form-field'
import { TableRowSkeleton } from '@/components/ui/skeleton'
import { confirmDelete } from '@/components/confirm-dialog'
import { EntryEditor } from '@/components/entry-editor'
import type { Entry, EntryEstado } from '@/services/entries'
import { ENTRY_TYPES } from '@/lib/constants'

/**
 * EntryManager — panel de "Guías y Comparativas" (entradas SEO).
 * ------------------------------------------------------------------
 * Flujo completo pedido: elegir nicho (o dejar que la IA decida) → generar el
 * borrador con IA → revisar/editar → publicar.
 *
 * POR QUÉ todo pasa por la API y NO por Supabase: regla de oro del proyecto
 * (los componentes son agnósticos de la persistencia). Aquí solo hay fetch a
 * /api/admin/entradas*, estados de carga visibles y errores con toast.
 */

/** Pestañas del filtro por estado editorial ('' = todos). */
const FILTROS_ESTADO: { value: '' | EntryEstado; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'borrador', label: 'Borradores' },
  { value: 'revision', label: 'En revisión' },
  { value: 'publicado', label: 'Publicadas' },
  { value: 'archivado', label: 'Archivadas' },
]

/** Etiqueta legible de cada tipo de entrada. */
const ETIQUETA_TIPO: Record<string, string> = {
  comparativa: 'Comparativa (X vs Y)',
  top_lista: 'Top / ranking',
  guia_compra: 'Guía de compra',
  caso_uso: 'Caso de uso',
  vale_la_pena: '¿Vale la pena?',
  problema_solucion: 'Problema → solución',
  mito_realidad: 'Mitos y verdades',
  regalo: 'Regalos',
}

/** Color del badge de estado (semántico: publicado = verde). */
const CLASE_ESTADO: Record<EntryEstado, string> = {
  borrador: 'bg-muted text-muted-foreground',
  revision: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  publicado: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  archivado: 'bg-destructive/10 text-destructive',
}

export function EntryManager() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<'' | EntryEstado>('')
  const [search, setSearch] = useState('')

  /** Nichos disponibles para el asistente (deja elegir categoría o IA). */
  const [categorias, setCategorias] = useState<{ id: string; name: string }[]>([])
  const [tipoNuevo, setTipoNuevo] = useState<string>(ENTRY_TYPES[0])
  const [categoriaNueva, setCategoriaNueva] = useState('')
  const [decideIA, setDecideIA] = useState(true)
  const [generando, setGenerando] = useState(false)

  /** Entrada en edición (null = editor cerrado). */
  const [editando, setEditando] = useState<Entry | null>(null)
  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null)

  /**
   * Carga la lista aplicando filtros.
   * @param silencioso TRUE para refrescar sin mostrar el skeleton (tras guardar).
   */
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setLoading(true)
      try {
        const params = new URLSearchParams()
        if (estado) params.set('estado', estado)
        if (search.trim()) params.set('search', search.trim())
        const res = await fetch('/api/admin/entradas?' + params.toString())
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error ?? 'No se pudieron cargar las entradas.')
        setEntries(body.entries ?? [])
      } catch (err: any) {
        toast.error(err?.message ?? 'Error cargando las entradas.')
      } finally {
        if (!silencioso) setLoading(false)
      }
    },
    [estado, search],
  )

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Nichos para el asistente: lectura del servicio admin ya existente.
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/categories')
        const body = await res.json()
        setCategorias((body.categories ?? []).map((c: any) => ({ id: c.id, name: c.name })))
      } catch {
        // Sin categorías el asistente seguirá funcionando en modo "IA decide".
      }
    })()
  }, [])

  /** Contador por estado (cabecera del panel). */
  const resumen = useMemo(() => {
    const conteo: Record<string, number> = { total: entries.length }
    for (const entry of entries) conteo[entry.estado] = (conteo[entry.estado] ?? 0) + 1
    return conteo
  }, [entries])

  // ---------- Acciones ----------

  /**
   * Genera un borrador con IA y lo GUARDA como borrador.
   * POR QUÉ dos pasos: /generate produce el contenido sin persistir y el POST lo
   * guarda en estado `borrador`, de modo que nada llega al público sin revisión
   * humana (lo contrario sería "publicar contenido a escala" y Google lo castiga).
   */
  async function generarBorrador() {
    setGenerando(true)
    try {
      const resGenerar = await fetch('/api/admin/entradas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: tipoNuevo,
          // Si el admin deja decidir a la IA, no se envía ningún nicho.
          categoryIds: decideIA || !categoriaNueva ? [] : [categoriaNueva],
        }),
      })
      const generado = await resGenerar.json()
      if (!resGenerar.ok) throw new Error(generado?.error ?? 'La IA no pudo generar la entrada.')

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

      toast.success('Borrador generado. Revísalo antes de publicar.')
      await cargar(true)
      setEditando(creada.entry)
    } catch (err: any) {
      toast.error(err?.message ?? 'Error generando la entrada.')
    } finally {
      setGenerando(false)
    }
  }

  /** Cambia el estado editorial (publicar / despublicar / archivar). */
  async function cambiarEstado(entry: Entry, nuevo: EntryEstado) {
    setAccionEnCurso(entry.id)
    try {
      const res = await fetch('/api/admin/entradas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, estado: nuevo }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo cambiar el estado.')
      toast.success(
        nuevo === 'publicado'
          ? 'Entrada publicada: ya está en la web y en el sitemap.'
          : nuevo === 'archivado'
            ? 'Entrada archivada.'
            : 'Entrada despublicada.',
      )
      await cargar(true)
      setEditando((actual) => (actual && actual.id === entry.id ? body.entry : actual))
    } catch (err: any) {
      toast.error(err?.message ?? 'Error cambiando el estado.')
    } finally {
      setAccionEnCurso(null)
    }
  }

  /** Traduce la entrada a los idiomas pendientes (nunca genera a medias). */
  async function traducir(entry: Entry) {
    setAccionEnCurso(entry.id)
    try {
      const res = await fetch('/api/admin/entradas/traducir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo traducir la entrada.')
      toast.success(
        body.traducidos?.length > 0
          ? 'Traducida a: ' + body.traducidos.join(', ') + '.'
          : 'La entrada ya estaba traducida.',
      )
    } catch (err: any) {
      toast.error(err?.message ?? 'Error traduciendo la entrada.')
    } finally {
      setAccionEnCurso(null)
    }
  }

  /** Elimina la entrada (con confirmación explícita: es irreversible). */
  async function eliminar(entry: Entry) {
    const confirmado = await confirmDelete({
      title: '¿Eliminar la entrada?',
      description:
        'Se borrará "' + entry.titulo + '" junto con su comparativa. Esta acción no se puede deshacer.',
    })
    if (!confirmado) return

    setAccionEnCurso(entry.id)
    try {
      const res = await fetch('/api/admin/entradas?id=' + entry.id, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo eliminar la entrada.')
      toast.success('Entrada eliminada.')
      await cargar(true)
    } catch (err: any) {
      toast.error(err?.message ?? 'Error eliminando la entrada.')
    } finally {
      setAccionEnCurso(null)
    }
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Asistente IA: crea SIEMPRE un borrador (nada se publica sin revisión). */}
      <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Bot className="h-5 w-5 text-brand" aria-hidden />
              Generar una entrada con IA
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Elige el tipo y el nicho, o deja que la IA decida. Se crea siempre como
              <strong className="font-medium text-foreground"> borrador</strong>: tú lo revisas y decides
              cuándo se publica.
            </p>
          </div>
          <Button onClick={generarBorrador} disabled={generando}>
            {generando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Generando…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden />
                Generar borrador
              </>
            )}
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Tipo de entrada</span>
            <select
              value={tipoNuevo}
              onChange={(event) => setTipoNuevo(event.target.value)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              {ENTRY_TYPES.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ETIQUETA_TIPO[tipo] ?? tipo}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Nicho</span>
            <select
              value={categoriaNueva}
              onChange={(event) => setCategoriaNueva(event.target.value)}
              disabled={decideIA}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none disabled:opacity-50 focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="">— Selecciona un nicho —</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-start gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={decideIA}
              onChange={(event) => setDecideIA(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-input"
            />
            <span>
              Deja que la IA elija
              <span className="block text-xs text-muted-foreground">
                Usa el nicho con más productos disponibles.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* Filtros y acciones de la lista */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-full border border-border bg-card p-1">
          {FILTROS_ESTADO.map((filtro) => (
            <button
              key={filtro.value || 'todos'}
              type="button"
              onClick={() => setEstado(filtro.value)}
              className={
                'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
                (estado === filtro.value
                  ? 'bg-brand text-brand-foreground'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              {filtro.label}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por título…"
          className="h-10 w-full max-w-xs rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />

        <Button className="ml-auto" onClick={() => cargar()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Actualizar
        </Button>
      </div>

      {/* Lista de entradas */}
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-3">Título</th>
                <th scope="col" className="px-4 py-3">Tipo</th>
                <th scope="col" className="px-4 py-3">Estado</th>
                <th scope="col" className="px-4 py-3">Productos</th>
                <th scope="col" className="px-4 py-3">Publicada</th>
                <th scope="col" className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowSkeleton cells={6} />
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[380px] px-4 py-3">
                      <p className="line-clamp-1 font-medium">{entry.titulo}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        /guias/{entry.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {ETIQUETA_TIPO[entry.tipo] ?? entry.tipo}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'rounded-full px-2.5 py-1 text-[11px] font-medium ' + CLASE_ESTADO[entry.estado]
                        }
                      >
                        {entry.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{entry.products.length}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {entry.publicado_en ? new Date(entry.publicado_en).toLocaleDateString('es-VE') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button className="px-2.5" onClick={() => setEditando(entry)} title="Editar">
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                        {entry.estado === 'publicado' ? (
                          <Button
                            className="px-2.5"
                            onClick={() => cambiarEstado(entry, 'borrador')}
                            disabled={accionEnCurso === entry.id}
                            title="Despublicar"
                          >
                            {accionEnCurso === entry.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <EyeOff className="h-4 w-4" aria-hidden />
                            )}
                          </Button>
                        ) : (
                          <Button
                            className="px-2.5"
                            onClick={() => cambiarEstado(entry, 'publicado')}
                            disabled={accionEnCurso === entry.id}
                            title="Publicar"
                          >
                            {accionEnCurso === entry.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <Eye className="h-4 w-4" aria-hidden />
                            )}
                          </Button>
                        )}
                        <Button
                          className="px-2.5"
                          onClick={() => traducir(entry)}
                          disabled={accionEnCurso === entry.id}
                          title="Traducir idiomas pendientes"
                        >
                          <Languages className="h-4 w-4" aria-hidden />
                        </Button>
                        <Button
                          className="px-2.5"
                          onClick={() => eliminar(entry)}
                          disabled={accionEnCurso === entry.id}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && entries.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No hay entradas con estos filtros. Genera la primera con el asistente de arriba.
          </p>
        )}
      </div>

      {/* Editor de la entrada seleccionada (organismo independiente). */}
      <EntryEditor
        entry={editando}
        onClose={() => setEditando(null)}
        onSaved={async () => {
          await cargar(true)
        }}
      />
    </div>
  )
}

