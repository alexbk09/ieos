'use client'

import { useMemo, useState } from 'react'
import { Activity, BarChart3, Bot, ExternalLink, Eye, MousePointerClick, RefreshCw, Search, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'

type MetricRow = {
  product_id: string
  name: string
  slug: string
  image_url: string | null
  views_count: number
  card_clicks_count: number
  add_to_cart_count: number
  aliexpress_clicks_count: number
  amazon_clicks_count: number
  store_clicks_count: number
  ai_impressions_count: number
  total_interactions: number
}

type SearchRow = {
  query: string
  source: string
  total_queries: number
}

type DailyTrend = {
  day: string
  views_count: number
  card_clicks_count: number
  add_to_cart_count: number
  affiliate_clicks_count: number
  ai_impressions_count: number
}

type AnalyticsResult = {
  desde: string
  hasta: string
  summary: {
    total_views: number
    total_card_clicks: number
    total_add_to_cart: number
    total_affiliate_clicks: number
    total_ai_impressions: number
    total_searches: number
    total_ali_clicks: number
    total_amazon_clicks: number
    total_store_clicks: number
  }
  topProducts: MetricRow[]
  topSearches: SearchRow[]
  trend: DailyTrend[]
}

const SOURCE_LABELS: Record<string, string> = {
  catalog_filter: 'Catálogo',
  agent: 'Asistente IA',
}

/** Etiqueta legible según el origen de búsqueda. */
function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source
}

/** Barras de tendencia SVG puras (sin dependencias externas). */
function TrendBars({ data }: { data: DailyTrend[] }) {
  const max = Math.max(...data.map((d) => d.views_count), 1)
  return (
    <div className="flex h-36 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.day} className="group flex flex-1 flex-col items-center gap-1">
          <span className="text-[9px] font-medium text-muted-foreground opacity-0 transition group-hover:opacity-100">{d.views_count}</span>
          <div
            className="w-full rounded-t-md bg-gradient-to-t from-cyan-600 to-cyan-400"
            style={{ height: `${Math.max((d.views_count / max) * 100, 4)}%` }}
            title={`${d.day}: ${d.views_count} vistas`}
          />
          <span className="text-[9px] text-muted-foreground">{d.day.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Gestor del panel de Analítica de Productos.
 * Permite filtrar por período y muestra:
 * - KPIs de interacción (vistas, clics card, carritos, afiliados, IA).
 * - Ranking Top de productos con sus métricas (vistas, carrito, AliExpress/Amazon).
 * - Términos de búsqueda (catálogo e IA).
 * - Tendencia diaria de visitas/afiliados.
 */
export function ProductAnalyticsManager() {
  const hoy = new Date()
  const hace7 = new Date(hoy)
  hace7.setDate(hoy.getDate() - 6)

  const [desde, setDesde] = useState(hace7.toISOString().slice(0, 10))
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10))
  const [cargando, setCargando] = useState(false)
  const [result, setResult] = useState<AnalyticsResult | null>(null)

  /** Carga el reporte del período indicado desde /api/admin/analytics-productos. */
  async function cargar() {
    if (!desde || !hasta) {
      toast.error('Selecciona el período del reporte')
      return
    }
    if (desde > hasta) {
      toast.error('La fecha de inicio no puede ser mayor que la de fin')
      return
    }

    setCargando(true)
    try {
      const response = await fetch(`/api/admin/analytics-productos?desde=${desde}&hasta=${hasta}`, { cache: 'no-store' })
      if (!response.ok) {
        const resultado = await response.json().catch(() => ({}))
        toast.error(resultado.error ?? 'No se pudo cargar la analítica')
        return
      }
      const data = await response.json()
      setResult(data)
    } catch {
      toast.error('No se pudo cargar la analítica')
    } finally {
      setCargando(false)
    }
  }

  const summary = result?.summary

  // Columnas de la tabla de productos.
  const productColumns: TableColumn<MetricRow>[] = [
    {
      key: 'producto',
      header: 'Producto',
      render: (r) => (
        <div className="flex min-w-0 items-center gap-3">
          {r.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.image_url} alt="" className="size-9 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><ShoppingBag size={15} /></div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{r.name}</p>
            <p className="font-mono text-[10px] text-muted-foreground">/{r.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'vistas',
      header: 'Vistas',
      sortable: true,
      sortValue: (r) => r.views_count,
      render: (r) => <span className="font-mono text-sm">{r.views_count}</span>,
    },
    {
      key: 'clics_card',
      header: 'Clics card',
      hiddenMobile: true,
      sortable: true,
      sortValue: (r) => r.card_clicks_count,
      render: (r) => <span className="font-mono text-sm text-muted-foreground">{r.card_clicks_count}</span>,
    },
    {
      key: 'carrito',
      header: 'Carrito',
      sortable: true,
      sortValue: (r) => r.add_to_cart_count,
      render: (r) => (
        <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 font-mono text-xs font-medium text-cyan-600 dark:text-cyan-400">
          {r.add_to_cart_count}
        </span>
      ),
    },
    {
      key: 'afiliados',
      header: 'Ali/Amazon/Tienda',
      hiddenMobile: true,
      sortable: true,
      sortValue: (r) => r.aliexpress_clicks_count + r.amazon_clicks_count + r.store_clicks_count,
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-orange-500/10 px-2 py-0.5 font-mono text-[11px] text-orange-600 dark:text-orange-400">{r.aliexpress_clicks_count}</span>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-700 dark:text-amber-400">{r.amazon_clicks_count}</span>
          <span className="rounded-full bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] text-sky-700 dark:text-sky-400">{r.store_clicks_count}</span>
        </div>
      ),
    },
    {
      key: 'ia',
      header: 'IA',
      hiddenMobile: true,
      sortable: true,
      sortValue: (r) => r.ai_impressions_count,
      render: (r) => (
        <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <Bot size={12} /> {r.ai_impressions_count}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      sortValue: (r) => r.total_interactions,
      render: (r) => <span className="font-mono text-sm font-semibold">{r.total_interactions}</span>,
    },
  ]

  const searchColumns: TableColumn<SearchRow>[] = [
    {
      key: 'termino',
      header: 'Término',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Search size={14} /></span>
          <span className="font-medium">{r.query}</span>
        </div>
      ),
    },
    {
      key: 'origen',
      header: 'Origen',
      render: (r) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.source === 'agent' ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'}`}>
          {sourceLabel(r.source)}
        </span>
      ),
    },
    {
      key: 'veces',
      header: 'Veces',
      sortable: true,
      sortValue: (r) => r.total_queries,
      render: (r) => <span className="font-mono text-sm font-semibold">{r.total_queries}</span>,
    },
  ]

  const top5 = useMemo(() => (result?.topProducts ?? []).slice(0, 5), [result])
  const maxInteractions = useMemo(() => Math.max(...top5.map((p) => p.total_interactions), 1), [top5])

  const kpis = [
    { icon: Eye, label: 'Vistas de producto', value: summary?.total_views ?? 0, sub: 'Modal y página /productos', color: 'text-cyan-600' },
    { icon: MousePointerClick, label: 'Clics en card', value: summary?.total_card_clicks ?? 0, sub: 'Detalle desde catálogo/portada', color: 'text-sky-600' },
    { icon: ShoppingBag, label: 'Agregados al carrito', value: summary?.total_add_to_cart ?? 0, sub: 'Solicitud híbrida', color: 'text-indigo-600' },
    { icon: ExternalLink, label: 'Clics afiliado', value: summary?.total_affiliate_clicks ?? 0, sub: `Ali ${summary?.total_ali_clicks ?? 0} · Amazon ${summary?.total_amazon_clicks ?? 0} · Tienda ${summary?.total_store_clicks ?? 0}`, color: 'text-amber-600' },
    { icon: Bot, label: 'Impresiones IA', value: summary?.total_ai_impressions ?? 0, sub: 'Resultados del asistente', color: 'text-violet-600' },
    { icon: Search, label: 'Búsquedas', value: summary?.total_searches ?? 0, sub: 'Filtro catálogo + IA', color: 'text-emerald-600' },
  ]

  return (
    <div className="grid gap-6">
      {/* Filtro de período */}
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <FormInput label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <FormInput label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <FormSubmitButton loading={cargando} onClick={cargar} loadingText="Cargando…">
            <BarChart3 size={15} /> Ver analítica
          </FormSubmitButton>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Activity size={13} className="text-brand-strong" />
          Los eventos se registran automáticamente cuando un cliente ve un producto, clickea, agrega al carrito o sale a AliExpress/Amazon.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="rounded-3xl border border-border bg-card p-5">
            <div className="flex items-center gap-2"><Icon size={18} className={color} /><p className="text-sm text-muted-foreground">{label}</p></div>
            <p className="mt-4 text-4xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      {/* Tendencia diaria + Top 5 */}
      {result && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-3xl border border-border bg-card p-6">
            <div>
              <h2 className="flex items-center gap-2 font-medium"><Eye size={16} className="text-cyan-600" /> Tendencia de vistas</h2>
              <p className="mt-1 text-sm text-muted-foreground">Visitas diarias en el período</p>
            </div>
            {result.trend.length > 0 ? (
              <div className="mt-6"><TrendBars data={result.trend} /></div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">No hay registros en este período.</p>
            )}
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="flex items-center gap-2 font-medium"><BarChart3 size={16} className="text-cyan-600" /> Top 5 productos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Mayor interacciones combinadas</p>
            <div className="mt-5 space-y-3">
              {top5.map((p, i) => (
                <div key={p.product_id} className="rounded-2xl bg-muted/60 p-4 transition hover:bg-muted">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="ml-auto font-mono text-xs">{p.total_interactions}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400" style={{ width: `${(p.total_interactions / maxInteractions) * 100}%` }} />
                  </div>
                </div>
              ))}
              {top5.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aún no hay interacciones.</p>}
            </div>
          </section>
        </div>
      )}

      {/* Tabla de productos */}
      <DataTable
        data={result?.topProducts ?? []}
        columns={productColumns}
        rowKey={(r) => r.product_id}
        searchKeys={(r) => `${r.name} ${r.slug}`}
        searchPlaceholder="Buscar producto…"
        noDataMessage="Aplica el período para ver los productos"
        emptyMessage="No hay productos con esas métricas"
        pageSize={8}
      />

      {/* Búsquedas */}
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-medium"><Search size={16} className="text-brand-strong" /> Qué buscan los clientes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Términos del filtro de catálogo y del asistente IA</p>
          </div>
          <RefreshCw size={15} className="text-muted-foreground" />
        </div>
        <DataTable
          data={result?.topSearches ?? []}
          columns={searchColumns}
          rowKey={(r) => `${r.source}::${r.query}`}
          searchKeys={(r) => `${r.query} ${sourceLabel(r.source)}`}
          searchPlaceholder="Buscar término…"
          noDataMessage="Aplica el período para ver las búsquedas"
          emptyMessage="No hay búsquedas con esos términos"
          pageSize={6}
        />
      </section>
    </div>
  )
}