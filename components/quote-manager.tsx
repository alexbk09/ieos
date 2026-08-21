'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRightLeft, ClipboardList, Eye, FileText, Package, Plus, Printer, RefreshCw, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'
import { QuoteCreator } from '@/components/quote-creator'
import { QuotePrintView } from '@/components/quote-print-view'
import { QUOTE_STATUS_LABELS, QUOTE_STATUSES } from '@/lib/quote-calculator'
import { formatBolivars, moneyUsd } from '@/lib/currency'
import type { Product } from '@/services/catalog'
import type { Quote, QuoteSettings } from '@/services/quotes'
import type { SiteSettings } from '@/services/site-settings'

/** Propiedades del gestor de cotizaciones. */
type Props = {
  /** Cotizaciones iniciales. */
  initialQuotes: Quote[]
  /** Productos del catálogo para crear cotizaciones. */
  products: Product[]
  /** Tasa BCV del día. */
  exchangeRate: number
  /** Configuración de cotizaciones. */
  quoteSettings: QuoteSettings
  /** Configuración de la empresa (logo, nombre, dirección). */
  siteSettings: SiteSettings
  /** Datos fiscales del emisor (RIF y razón social para la vista impresa). */
  invoiceSettings?: { issuer_name: string; issuer_rif: string; issuer_address: string } | null
}

/** Estilos del badge de estado. */
const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  converted: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
}

/**
 * Gestor de cotizaciones con:
 * - Tabla con búsqueda, filtros y paginación (DataTable).
 * - Creación de cotizaciones con selección de productos, descuentos y envío.
 * - Detalle con vista de impresión (formato moderno de empresa).
 * - Envío por correo (SMTP configurable).
 * - Conversión a solicitud (flujo de venta).
 */
export function QuoteManager({ initialQuotes, products, exchangeRate, quoteSettings, siteSettings, invoiceSettings }: Props) {
  const [quotes, setQuotes] = useState(initialQuotes)
  const [statusFilter, setStatusFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailQuote, setDetailQuote] = useState<Quote | null>(null)
  const [converting, setConverting] = useState(false)
  const [sending, setSending] = useState(false)
  const [printing, setPrinting] = useState(false)
  /** Cotización activa para imprimir desde el portal (fuera del modal). */
  const [printQuoteData, setPrintQuoteData] = useState<Quote | null>(null)

  // ---------- Filtros ----------

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return quotes
    return quotes.filter((q) => q.status === statusFilter)
  }, [quotes, statusFilter])

  // ---------- Acciones ----------

  /** Envía la cotización por correo y la marca como enviada. */
  async function sendQuote(quote: Quote) {
    if (!quote.customer_email) {
      toast.error('El cliente no tiene correo para enviar la cotización')
      return
    }
    setSending(true)
    try {
      const response = await fetch(`/api/admin/quotes/${quote.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudo enviar', { description: result.error ?? 'Inténtalo de nuevo.' })
        return
      }
      setQuotes((current) => current.map((q) => (q.id === quote.id ? { ...q, status: 'sent', sent_at: new Date().toISOString() } : q)))
      setDetailQuote((current) => (current && current.id === quote.id ? { ...current, status: 'sent', sent_at: new Date().toISOString() } : current))
      toast.success('Cotización enviada por correo')
    } catch {
      toast.error('Error de red al enviar la cotización')
    } finally {
      setSending(false)
    }
  }

  /** Convierte la cotización a solicitud. */
  async function convertQuote(quote: Quote) {
    setConverting(true)
    try {
      const response = await fetch(`/api/admin/quotes/${quote.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'convert' }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudo convertir', { description: result.error ?? 'Inténtalo de nuevo.' })
        return
      }
      setQuotes((current) => current.map((q) => (q.id === quote.id ? { ...q, status: 'converted', converted_to_solicitud_id: result.solicitud_id } : q)))
      setDetailQuote((current) => (current && current.id === quote.id ? { ...current, status: 'converted', converted_to_solicitud_id: result.solicitud_id } : current))
      toast.success('Cotización convertida a solicitud')
    } catch {
      toast.error('Error de red al convertir la cotización')
    } finally {
      setConverting(false)
    }
  }

  /** Cancela una cotización. */
  async function cancelQuote(quote: Quote) {
    try {
      const response = await fetch(`/api/admin/quotes/${quote.id}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudo cancelar', { description: result.error ?? 'Inténtalo de nuevo.' })
        return
      }
      setQuotes((current) => current.map((q) => (q.id === quote.id ? { ...q, status: 'cancelled' } : q)))
      setDetailQuote((current) => (current && current.id === quote.id ? { ...current, status: 'cancelled' } : current))
      toast.success('Cotización cancelada')
    } catch {
      toast.error('Error de red al cancelar la cotización')
    }
  }

  /** Marca la cotización como aceptada. */
  async function acceptQuote(quote: Quote) {
    try {
      const response = await fetch(`/api/admin/quotes/${quote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudo actualizar', { description: result.error ?? 'Inténtalo de nuevo.' })
        return
      }
      setQuotes((current) => current.map((q) => (q.id === quote.id ? { ...q, status: 'accepted' } : q)))
      setDetailQuote((current) => (current && current.id === quote.id ? { ...current, status: 'accepted' } : current))
      toast.success('Cotización marcada como aceptada')
    } catch {
      toast.error('Error de red al actualizar la cotización')
    }
  }

  /**
   * Imprime la cotización.
   * Renderiza la vista en un portal directo al body (fuera del modal,
   * que tiene overflow-hidden y recorta el contenido), espera al render
   * (doble frame para que el navegador aplique las reglas @media print
   * y, sobre todo, el display:none del resto de la app) y ejecuta
   * window.print(). Al cerrar el diálogo limpia el portal.
   */
  function printQuote() {
    if (!detailQuote) return
    setPrinting(true)
    setPrintQuoteData(detailQuote)
    // Doble requestAnimationFrame: garantiza que React haya pintado el
    // portal y que el navegador haya aplicado los estilos de impresión
    // antes de abrir el diálogo de imprimir/guardar PDF.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print()
        setPrintQuoteData(null)
        setPrinting(false)
      })
    })
  }

  // ---------- Columnas ----------

  const columns: TableColumn<Quote>[] = [
    {
      key: 'quote_number',
      header: 'Cotización',
      sortable: true,
      sortValue: (q) => q.quote_number,
      render: (q) => (
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted"><FileText size={16} /></span>
          <div>
            <p className="font-mono text-xs font-medium">{q.quote_number}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(q.created_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Cliente',
      sortable: true,
      sortValue: (q) => q.customer_name,
      render: (q) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{q.customer_name}</p>
          <p className="truncate text-xs text-muted-foreground">{q.customer_email || '—'}</p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Productos',
      sortable: true,
      sortValue: (q) => q.quote_items?.length ?? 0,
      hiddenMobile: true,
      render: (q) => (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Package size={14} /> {q.quote_items?.length ?? 0}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      sortValue: (q) => Number(q.total_usd),
      render: (q) => (
        <div>
          <p className="font-medium">{moneyUsd(Number(q.total_usd))}</p>
          <p className="text-xs text-muted-foreground">{formatBolivars(Number(q.total_usd), exchangeRate)}</p>
        </div>
      ),
    },
    {
      key: 'discount',
      header: 'Desc.',
      sortable: true,
      sortValue: (q) => Number(q.discount_amount_usd),
      hiddenMobile: true,
      render: (q) => {
        const parts: string[] = []
        if (Number(q.discount_percent) > 0) parts.push(`${Number(q.discount_percent)}%`)
        if (Number(q.cash_divisa_discount_percent) > 0) parts.push(`${Number(q.cash_divisa_discount_percent)}% eff.`)
        return Number(q.discount_amount_usd) > 0
          ? <span className="text-xs font-medium text-destructive">{parts.join(' + ') || '—'}</span>
          : <span className="text-xs text-muted-foreground">—</span>
      },
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      sortValue: (q) => q.status,
      render: (q) => (
        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[q.status] ?? 'bg-muted text-muted-foreground'}`}>
          {QUOTE_STATUS_LABELS[q.status] ?? q.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (q) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setDetailQuote(q)
          }}
          aria-label="Ver detalle"
          title="Ver detalle"
          className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Eye size={15} />
        </button>
      ),
      cellClassName: 'text-right',
    },
  ]

  return (
    <section className="space-y-5">
      {/* Encabezado + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-cyan-600" />
          <div>
            <h2 className="font-medium">Gestión de cotizaciones</h2>
            <p className="text-sm text-muted-foreground">{filtered.length} cotizaciones</p>
          </div>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          <Plus size={15} /> Nueva cotización
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        >
          <option value="all">Todos los estados</option>
          {QUOTE_STATUSES.map((s) => (
            <option key={s} value={s}>{QUOTE_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey={(q) => q.id}
        searchKeys={(q) => {
          const productsStr = (q.quote_items ?? []).map((i) => i.product_name).join(' ')
          return `${q.quote_number} ${q.customer_name} ${q.customer_email ?? ''} ${q.customer_phone ?? ''} ${q.status} ${productsStr}`
        }}
        searchPlaceholder="Buscar por número, cliente, producto o estado…"
        emptyMessage="No se encontraron cotizaciones"
        noDataMessage="Aún no hay cotizaciones creadas"
        pageSize={8}
        onRowClick={(q) => setDetailQuote(q)}
      />

      {/* Modal: crear cotización */}
      {createOpen && (
        <Modal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          title="Nueva cotización"
          description={`Selecciona productos, aplica descuentos y crea la cotización. N° ${quoteSettings.quote_prefix}-${String(quoteSettings.quote_current_number + 1).padStart(quoteSettings.quote_digits, '0')}`}
          icon={<FileText size={18} />}
          size="xl"
          className="max-w-4xl"
        >
          <QuoteCreator
            products={products}
            exchangeRate={exchangeRate}
            quoteSettings={quoteSettings}
            onCreated={(quoteNumber) => {
              setCreateOpen(false)
              window.location.reload()
            }}
            onClose={() => setCreateOpen(false)}
          />
        </Modal>
      )}

      {/* Modal: detalle + impresión */}
      {detailQuote && (
        <Modal
          open={Boolean(detailQuote)}
          onClose={() => setDetailQuote(null)}
          title={detailQuote.quote_number}
          description={`${QUOTE_STATUS_LABELS[detailQuote.status] ?? detailQuote.status} · ${new Date(detailQuote.created_at).toLocaleDateString('es-VE', { dateStyle: 'long' })}`}
          icon={<FileText size={18} />}
          size="xl"
          className="max-w-4xl"
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {detailQuote.status === 'draft' && (
                <>
                  <button
                    onClick={() => sendQuote(detailQuote)}
                    disabled={sending}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
                  >
                    {sending ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                    {sending ? 'Enviando…' : 'Enviar por correo'}
                  </button>
                  <button
                    onClick={() => cancelQuote(detailQuote)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    <Trash2 size={15} /> Cancelar
                  </button>
                </>
              )}
              {detailQuote.status === 'sent' && (
                <>
                  <button
                    onClick={() => acceptQuote(detailQuote)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white transition-all hover:bg-emerald-700"
                  >
                    Aceptar cotización
                  </button>
                  <button
                    onClick={() => convertQuote(detailQuote)}
                    disabled={converting}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
                  >
                    {converting ? <RefreshCw size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
                    {converting ? 'Convirtiendo…' : 'Convertir a solicitud'}
                  </button>
                </>
              )}
              {detailQuote.status === 'accepted' && (
                <button
                  onClick={() => convertQuote(detailQuote)}
                  disabled={converting}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
                >
                  {converting ? <RefreshCw size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />}
                  {converting ? 'Convirtiendo…' : 'Convertir a solicitud'}
                </button>
              )}
              {detailQuote.status === 'converted' && detailQuote.converted_to_solicitud_id && (
                <p className="text-xs text-muted-foreground">
                  Convertida a solicitud #{detailQuote.converted_to_solicitud_id.slice(0, 8).toUpperCase()}
                </p>
              )}
              <button
                onClick={printQuote}
                disabled={printing}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                {printing ? <RefreshCw size={15} className="animate-spin" /> : <Printer size={15} />}
                {printing ? 'Preparando…' : 'Imprimir / PDF'}
              </button>
            </div>
          }
        >
          {/* Vista previa dentro del modal (no participa en la impresión) */}
          <QuotePrintView quote={detailQuote} settings={siteSettings} invoiceSettings={invoiceSettings} preview />
        </Modal>
      )}

      {/* Portal de impresión: se monta fuera del modal directamente en el body
          para que la cotización completa se imprima sin cortes. */}
      {printQuoteData &&
        createPortal(
          <div className="print-portal">
            <QuotePrintView quote={printQuoteData} settings={siteSettings} invoiceSettings={invoiceSettings} />
          </div>,
          document.body,
        )}
    </section>
  )
}