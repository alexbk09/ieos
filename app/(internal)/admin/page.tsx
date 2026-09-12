import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { getDashboardOverview } from '@/services/dashboard'
import { getProductAnalytics } from '@/services/analytics'
import { getExchangeRates } from '@/services/exchange-rate'
import { DASHBOARD_ANALYTICS_DAYS } from '@/lib/constants'
import { formatRate } from '@/lib/currency'
import { BarChart, DonutChart } from '@/components/admin-dashboard-charts'
import {
  AlertTriangle,
  BadgeDollarSign,
  Bot,
  Building2,
  ExternalLink,
  FileText,
  FolderTree,
  Globe2,
  Languages,
  LineChart,
  MousePointerClick,
  Package,
  Search,
  Settings2,
  ShieldCheck,
  Tag,
  TrendingUp,
  Users,
} from 'lucide-react'

/** Milisegundos de un día (evita el número mágico en los cálculos de fecha). */
const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Estados del ciclo editorial de una entrada pSEO con su color para la dona. */
const ESTADOS_ENTRADA = [
  { key: 'publicado', label: 'Publicadas', color: '#10b981' },
  { key: 'revision', label: 'En revisión', color: '#06b6d4' },
  { key: 'borrador', label: 'Borradores', color: '#f59e0b' },
  { key: 'archivado', label: 'Archivadas', color: '#94a3b8' },
] as const

/** Módulos ACTIVOS del sistema actual (los legado están ocultos). */
const ACCESOS: { href: string; label: string; icon: typeof Package }[] = [
  { href: '/admin/productos', label: 'Productos', icon: Package },
  { href: '/admin/categorias', label: 'Nichos / Categorías', icon: FolderTree },
  { href: '/admin/marcas', label: 'Marcas', icon: Tag },
  { href: '/admin/proveedores', label: 'Proveedores', icon: Building2 },
  { href: '/admin/scraper-aliexpress', label: 'Scraper AliExpress', icon: Search },
  { href: '/admin/ali-pipeline', label: 'Pipeline AliExpress', icon: Bot },
  { href: '/admin/seo-categorias', label: 'SEO de Categorías', icon: Globe2 },
  { href: '/admin/entradas', label: 'Guías y Comparativas', icon: FileText },
  { href: '/admin/idiomas', label: 'Idiomas y Traducciones', icon: Languages },
  { href: '/admin/analytics-productos', label: 'Analítica de Productos', icon: LineChart },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { href: '/admin/roles', label: 'Roles y permisos', icon: ShieldCheck },
  { href: '/admin/configuracion', label: 'Configuración', icon: Settings2 },
]

/** Formatea un entero con separador de miles (es-VE). */
function num(value: number): string {
  return Math.round(value).toLocaleString('es-VE')
}

/** Porcentaje entero y seguro (0 cuando el total es 0). */
function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

/** Etiqueta corta dd/mm para el eje del gráfico a partir de una fecha ISO. */
function etiquetaDia(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}`
}

/** Panel admin: estado del catálogo de afiliación, pSEO y rendimiento. */
export default async function AdminPage() {
  await requireAdmin()

  const ahora = new Date()
  const desde = new Date(ahora.getTime() - (DASHBOARD_ANALYTICS_DAYS - 1) * MS_PER_DAY)
  const isoDay = (d: Date) => d.toISOString().slice(0, 10)

  const [overviewResult, analyticsResult, rates] = await Promise.all([
    getDashboardOverview(),
    getProductAnalytics({ desde: isoDay(desde), hasta: isoDay(ahora) }),
    getExchangeRates(),
  ])

  const catalogo = overviewResult.data?.catalogo
  const contenido = overviewResult.data?.contenido
  const scraper = overviewResult.data?.scraper
  const analytics = analyticsResult.data
  const summary = analytics?.summary
  const { official, parallel } = rates

  const coberturaAfiliado = pct(catalogo?.productosConAfiliado ?? 0, catalogo?.productosTotal ?? 0)
  const coberturaHubs = pct(catalogo?.categoriasConHub ?? 0, catalogo?.categoriasTotal ?? 0)

  // Distribución de entradas pSEO por estado (alimenta la dona).
  const datosEntradas = ESTADOS_ENTRADA.map((estado) => ({
    label: estado.label,
    color: estado.color,
    value:
      estado.key === 'publicado' ? contenido?.entradasPublicadas ?? 0
      : estado.key === 'revision' ? contenido?.entradasRevision ?? 0
      : estado.key === 'borrador' ? contenido?.entradasBorrador ?? 0
      : contenido?.entradasArchivadas ?? 0,
  }))

  const tendenciaVistas = (analytics?.trend ?? []).map((t) => ({ label: etiquetaDia(t.day), value: t.views_count }))
  const topProductos = (analytics?.topProducts ?? []).slice(0, 5)
  const topBusquedas = (analytics?.topSearches ?? []).slice(0, 6)

  const hayError = overviewResult.error ?? analyticsResult.error

  const kpis = [
    { icon: Package, label: 'Productos activos', value: num(catalogo?.productosActivos ?? 0), sub: `${num(catalogo?.productosTotal ?? 0)} en el catálogo` },
    { icon: FolderTree, label: 'Nichos activos', value: num(catalogo?.categoriasActivas ?? 0), sub: `${num(catalogo?.categoriasConHub ?? 0)} con hub SEO` },
    { icon: FileText, label: 'Guías publicadas', value: num(contenido?.entradasPublicadas ?? 0), sub: `${num(contenido?.entradasTotal ?? 0)} entradas en total` },
    { icon: MousePointerClick, label: `Clics a afiliado (${DASHBOARD_ANALYTICS_DAYS} días)`, value: num(summary?.total_affiliate_clicks ?? 0), sub: `Ali ${num(summary?.total_ali_clicks ?? 0)} · Amazon ${num(summary?.total_amazon_clicks ?? 0)}` },
  ] as const

  return (
<>
      <AdminPageHeader eyebrow="Panel de control" title="Resumen" description="Catálogo de afiliación, contenido pSEO y rendimiento del sitio en un vistazo." />
      <div className="p-5 sm:p-8">
        {hayError && (
          <div className="mb-5 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            Algunas métricas no se pudieron cargar: {hayError.message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="rounded-3xl border border-border bg-card p-5">
              <Icon size={20} className="text-cyan-600" />
              <p className="mt-6 text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
        {/* Catálogo de afiliación */}
        <section className="mt-6 rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Catálogo de afiliación</h2>
              <p className="mt-1 text-sm text-muted-foreground">Cobertura de enlaces de salida y enriquecimiento del catálogo.</p>
            </div>
            <Link href="/admin/productos" className="text-sm text-cyan-600">Gestionar productos</Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-muted/60 p-4">
              <div className="flex items-center gap-2"><ExternalLink size={18} className="text-cyan-600" /><p className="text-xs text-muted-foreground">Con enlace de afiliado</p></div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{num(catalogo?.productosConAfiliado ?? 0)}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {num(catalogo?.productosTotal ?? 0)}</span></p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${coberturaAfiliado}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{coberturaAfiliado}% listo para afiliación</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <div className="flex items-center gap-2"><AlertTriangle size={18} className={catalogo?.productosSinMarca ? 'text-amber-500' : 'text-cyan-600'} /><p className="text-xs text-muted-foreground">Productos sin marca</p></div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{num(catalogo?.productosSinMarca ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Asignar marca mejora el filtrado y el SEO</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <div className="flex items-center gap-2"><Tag size={18} className="text-cyan-600" /><p className="text-xs text-muted-foreground">Marcas</p></div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{num(catalogo?.marcasTotal ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Catálogo de fabricantes</p>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <div className="flex items-center gap-2"><Building2 size={18} className="text-cyan-600" /><p className="text-xs text-muted-foreground">Proveedores</p></div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{num(catalogo?.proveedoresTotal ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Origen de los productos</p>
            </div>
          </div>
        </section>

        {/* SEO & contenido (pSEO) */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-medium">Nichos con hub SEO</h2><p className="mt-1 text-sm text-muted-foreground">Landing pSEO (título largo + guía de compra + FAQ) por categoría.</p></div>
              <Link href="/admin/seo-categorias" className="text-sm text-cyan-600">Generar hubs</Link>
            </div>
            <p className="mt-6 text-4xl font-semibold tracking-tight">{num(catalogo?.categoriasConHub ?? 0)}<span className="ml-1 text-base font-normal text-muted-foreground">/ {num(catalogo?.categoriasTotal ?? 0)} nichos</span></p>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${coberturaHubs}%` }} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{coberturaHubs}% de los nichos tienen contenido editorial indexable.</p>
            <Link href="/admin/categorias" className="mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">Gestionar nichos</Link>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-medium">Guías y comparativas</h2><p className="mt-1 text-sm text-muted-foreground">Contenido informacional por estado editorial.</p></div>
              <Link href="/admin/entradas" className="text-sm text-cyan-600">Abrir editor</Link>
            </div>
            <div className="mt-6"><DonutChart data={datosEntradas} emptyMessage="Aún no hay entradas creadas" /></div>
          </section>
        </div>
        {/* Rendimiento del sistema (analítica) */}
        <section className="mt-6 rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Rendimiento de la tienda (últimos {DASHBOARD_ANALYTICS_DAYS} días)</h2>
              <p className="mt-1 text-sm text-muted-foreground">Vistas, clics a afiliado e interacción con el asistente IA.</p>
            </div>
            <Link href="/admin/analytics-productos" className="text-sm text-cyan-600">Ver analítica completa</Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { label: 'Vistas de producto', value: summary?.total_views ?? 0 },
              { label: 'Clics a afiliado', value: summary?.total_affiliate_clicks ?? 0 },
              { label: 'Agregados al carrito', value: summary?.total_add_to_cart ?? 0 },
              { label: 'Impresiones IA', value: summary?.total_ai_impressions ?? 0 },
              { label: 'Búsquedas', value: summary?.total_searches ?? 0 },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl bg-muted/60 p-4">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{num(m.value)}</p>
              </div>
            ))}
          </div>

          <div className="mt-6"><BarChart data={tendenciaVistas} emptyMessage="Sin visitas registradas todavía" /></div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Vistas de producto por día</p>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="font-medium">Productos con más interés</h2>
            <p className="mt-1 text-sm text-muted-foreground">Top 5 por interacción total en el período.</p>
            <div className="mt-5 space-y-3">
              {topProductos.map((p, i) => (
                <div key={p.product_id} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4 text-sm transition hover:bg-muted">
                  <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{num(p.views_count)} vistas · {num(p.aliexpress_clicks_count + p.amazon_clicks_count + p.store_clicks_count)} clics</span>
                </div>
              ))}
              {topProductos.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay interacciones registradas.</p>}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="font-medium">Búsquedas más frecuentes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Lo que buscan tus clientes (catálogo y asistente IA).</p>
            <div className="mt-5 space-y-3">
              {topBusquedas.map((b) => (
                <div key={`${b.source}-${b.query}`} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-4 text-sm transition hover:bg-muted">
                  <Search size={16} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{b.query}</span>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{num(b.total_queries)}</span>
                </div>
              ))}
              {topBusquedas.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aún no hay búsquedas registradas.</p>}
            </div>
          </section>
        </div>
        {/* Automatización AliExpress */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center gap-3"><Bot size={20} className="text-cyan-600" /><div><h2 className="font-medium">Scraper AliExpress</h2><p className="mt-1 text-sm text-muted-foreground">Extracciones registradas</p></div></div>
            <p className="mt-6 text-4xl font-semibold tracking-tight">{num(scraper?.total ?? 0)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{num(scraper?.exitos ?? 0)} con éxito · {num(scraper?.errores ?? 0)} con error</p>
            <Link href="/admin/scraper-aliexpress" className="mt-6 inline-flex rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">Abrir scraper</Link>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div><h2 className="font-medium">Últimas extracciones</h2><p className="mt-1 text-sm text-muted-foreground">Actividad reciente del scraper</p></div>
              <Link href="/admin/ali-pipeline" className="text-sm text-cyan-600">Pipeline</Link>
            </div>
            <div className="mt-5 space-y-2">
              {(scraper?.ultimos ?? []).map((log) => (
                <div key={`${log.url_producto}-${log.created_at}`} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 text-sm">
                  <span className={log.estado === 'exito' ? 'size-2 shrink-0 rounded-full bg-emerald-500' : log.estado === 'error' ? 'size-2 shrink-0 rounded-full bg-destructive' : 'size-2 shrink-0 rounded-full bg-amber-500'} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{log.url_producto}</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{log.estado}</span>
                </div>
              ))}
              {(scraper?.ultimos ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Todavía no se ha ejecutado el scraper.</p>}
            </div>
          </section>
        </div>

        {/* Accesos rápidos a todos los módulos del sistema actual */}
        <section className="mt-6 rounded-3xl border border-border bg-card p-6">
          <h2 className="font-medium">Accesos rápidos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Todos los módulos del sistema actual.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ACCESOS.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm transition hover:bg-muted">
                <Icon size={18} className="shrink-0 text-cyan-600" />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Tasas del día (referencia para los precios en Bs) */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-5"><BadgeDollarSign size={20} className="text-cyan-600" /><p className="mt-6 text-sm text-muted-foreground">Tasa oficial del día</p><p className="mt-1 text-2xl font-semibold tracking-tight">Bs. {formatRate(official.rate)}</p><p className="mt-1 text-xs text-muted-foreground">Fuente: dolarapi.com</p></div>
          <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5"><TrendingUp size={20} className="text-amber-600" /><p className="mt-6 text-sm text-muted-foreground">Tasa paralela del día</p><p className="mt-1 text-2xl font-semibold tracking-tight">Bs. {formatRate(parallel.rate)}</p><p className="mt-1 text-xs text-muted-foreground">Referencia del mercado</p></div>
        </div>
      </div>
</>)
}

