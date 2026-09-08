'use client'

import { useState } from 'react'
import { Building2, Eye, FileText, Percent, Plus, Receipt, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import {
  formatInvoiceNumber,
  formatControlNumber,
  nextNumber,
  documentTypeLabel,
  INVOICE_STATUS_LABELS,
  validateRif,
} from '@/lib/invoice-calculator'
import { moneyUsd } from '@/lib/currency'
import type { Invoice, InvoiceSettings } from '@/services/invoicing'

// ---------- Tipos de props ----------

type Props = {
  /** Configuración inicial de facturación. */
  initialSettings: InvoiceSettings
  /** Facturas ya emitidas. */
  initialInvoices: Invoice[]
  /** Solicitudes disponibles para facturar (confirmadas/completadas). */
  availableRequests: Array<{ id: string; id_short: string; total_usd: number; full_name: string | null; email: string | null }>
}

// ---------- Secciones del sub-menú ----------

const SECTIONS = [
  { key: 'emisor', label: 'Emisor', icon: Building2 },
  { key: 'iva', label: 'IVA y Régimen', icon: Percent },
  { key: 'correlativos', label: 'Correlativos', icon: Receipt },
  { key: 'facturas', label: 'Facturas', icon: FileText },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

/** Claves de columnas editables de la configuración (texto/número/bool). */
type EditableSettings = Omit<InvoiceSettings, 'id'>

/** Estilos del badge de estado de factura. */
const STATUS_STYLES: Record<string, string> = {
  issued: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
}

// ---------- Componente principal ----------

/**
 * Administrador de facturación venezolana (SENIAT).
 * Secciones:
 *  - Emisor: razón social, RIF, domicilio fiscal, contacto.
 *  - IVA y Régimen: alícuota, si los precios incluyen IVA.
 *  - Correlativos: prefijo/serie/dígitos de factura, número de control,
 *    resolución/autorización y nota al pie.
 *  - Facturas: tabla con las facturas emitidas (emitir desde una solicitud,
 *    ver detalle y anular con motivo).
 * Toda la persistencia va por la API; la UI es independiente de Supabase.
 */
export function InvoiceSettingsManager({ initialSettings, initialInvoices, availableRequests }: Props) {
  const [form, setForm] = useState<EditableSettings>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState<SectionKey>('emisor')

  // Facturas y solicitudes disponibles.
  const [invoices, setInvoices] = useState(initialInvoices)

  // Modal de emisión.
  const [issueOpen, setIssueOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<(typeof availableRequests)[number] | null>(null)
  const [customer, setCustomer] = useState({ name: '', document_type: 'ci' as 'rif' | 'ci' | 'pasaporte', document: '', address: '', email: '', phone: '' })
  const [issuing, setIssuing] = useState(false)

  // Modal de detalle.
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)

  // Modal de anulación.
  const [cancelInvoiceId, setCancelInvoiceId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // ---------- Helpers de edición ----------

  /** Actualiza un campo de texto del formulario. */
  function setText<K extends keyof EditableSettings>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value as EditableSettings[K] }))
  }

  /** Actualiza un campo numérico del formulario. */
  function setNumber<K extends keyof EditableSettings>(key: K, value: string) {
    const parsed = value === '' ? '' : Number(value)
    setForm((f) => ({ ...f, [key]: (Number.isFinite(parsed) ? parsed : 0) as EditableSettings[K] }))
  }

  /** Actualiza un campo booleano del formulario. */
  function setBool<K extends keyof EditableSettings>(key: K, value: boolean) {
    setForm((f) => ({ ...f, [key]: value as EditableSettings[K] }))
  }

  // ---------- Persistencia ----------

  /** Guarda la configuración en la API. */
  async function save() {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/invoicing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudieron guardar los cambios', { description: result.error ?? 'Inténtalo de nuevo.' })
        return
      }
      if (result.settings) setForm(result.settings)
      toast.success('Configuración guardada')
    } catch {
      toast.error('Error de red al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  // ---------- Emisión de facturas ----------

  /** Abre el modal de emisión para la solicitud seleccionada. */
  function openIssue(request: (typeof availableRequests)[number]) {
    setSelectedRequest(request)
    setCustomer({
      name: request.full_name ?? '',
      document_type: 'ci',
      document: '',
      address: '',
      email: request.email ?? '',
      phone: '',
    })
    setIssueOpen(true)
  }

  /** Emite la factura para la solicitud seleccionada. */
  async function submitIssue() {
    if (!selectedRequest) return
    if (!customer.document.trim()) {
      toast.error('El documento fiscal del receptor es obligatorio')
      return
    }
    if (customer.document_type === 'rif') {
      const rif = validateRif(customer.document)
      if (!rif.valid) {
        toast.error('RIF del receptor inválido', { description: rif.reason })
        return
      }
    }

    setIssuing(true)
    try {
      const response = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitud_id: selectedRequest.id,
          customer: {
            name: customer.name,
            document_type: customer.document_type,
            document: customer.document,
            address: customer.address,
            email: customer.email,
            phone: customer.phone,
          },
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudo emitir la factura', { description: result.error ?? 'Inténtalo de nuevo.' })
        return
      }
      setInvoices((current) => [result.invoice, ...current])
      setIssueOpen(false)
      setActive('facturas')
      toast.success('Factura emitida', { description: `N° ${result.invoice.invoice_number}` })
    } catch {
      toast.error('Error de red al emitir la factura')
    } finally {
      setIssuing(false)
    }
  }

  // ---------- Anulación ----------

  /** Anula una factura emitida con motivo. */
  async function submitCancel() {
    if (!cancelInvoiceId) return
    if (!cancelReason.trim()) {
      toast.error('El motivo de anulación es obligatorio')
      return
    }
    setCancelling(true)
    try {
      const response = await fetch('/api/admin/invoices', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cancelInvoiceId, reason: cancelReason }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudo anular la factura', { description: result.error ?? 'Inténtalo de nuevo.' })
        return
      }
      setInvoices((current) => current.map((inv) => (inv.id === cancelInvoiceId ? result.invoice : inv)))
      setCancelInvoiceId(null)
      setCancelReason('')
      toast.success('Factura anulada')
    } catch {
      toast.error('Error de red al anular la factura')
    } finally {
      setCancelling(false)
    }
  }

  // ---------- Render de secciones ----------

  /** Sección: Emisor. */
  function renderEmisor() {
    return (
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Razón social" value={form.issuer_name} onChange={(e) => setText('issuer_name', e.target.value)} />
          <FormInput label="RIF" value={form.issuer_rif} onChange={(e) => setText('issuer_rif', e.target.value)} placeholder="J-12345678-5" hint="Formato: letra-8 dígitos-DV" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Dirección fiscal" value={form.issuer_address} onChange={(e) => setText('issuer_address', e.target.value)} />
          <FormInput label="Ciudad" value={form.issuer_city} onChange={(e) => setText('issuer_city', e.target.value)} />
          <FormInput label="Estado" value={form.issuer_state} onChange={(e) => setText('issuer_state', e.target.value)} />
          <FormInput label="Teléfono" value={form.issuer_phone} onChange={(e) => setText('issuer_phone', e.target.value)} placeholder="+584122649707" />
        </div>
        <FormInput label="Correo" value={form.issuer_email} onChange={(e) => setText('issuer_email', e.target.value)} placeholder="hola@ilumax.ve" />
      </div>
    )
  }

  /** Sección: IVA y régimen. */
  function renderIva() {
    return (
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Régimen fiscal</span>
            <select
              value={form.regimen}
              onChange={(e) => setText('regimen', e.target.value as EditableSettings['regimen'])}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="contribuyente_formal">Contribuyente Formal</option>
              <option value="no_contribuyente">No Contribuyente</option>
            </select>
            <span className="text-xs text-muted-foreground">Determina si la factura debe desglosar IVA.</span>
          </label>
          <FormInput label="Alícuota de IVA (%)" type="number" min={0} max={100} step={0.01} value={String(form.iva_rate)} onChange={(e) => setNumber('iva_rate', e.target.value)} hint="General 16% desde marzo 2024" />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
          <input
            type="checkbox"
            checked={Boolean(form.prices_include_iva)}
            onChange={(e) => setBool('prices_include_iva', e.target.checked)}
            className="mt-0.5 accent-cyan-500"
          />
          <div>
            <p className="text-sm font-medium">Los precios del catálogo incluyen IVA</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Si está activado, la base imponible se calcula desglosando el IVA contenido en el precio (como exige el SENIAT).
              Si está desactivado, el IVA se suma al precio neto.
            </p>
          </div>
        </label>
      </div>
    )
  }

  /** Sección: Correlativos. */
  function renderCorrelativos() {
    const previewNumber = formatInvoiceNumber(form.invoice_prefix, form.invoice_series, nextNumber(Number(form.invoice_current_number)), Number(form.invoice_digits))
    const previewControl = formatControlNumber(form.control_series, nextNumber(Number(form.control_current_number)), Number(form.invoice_digits))

    return (
      <div className="grid gap-5">
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600">Siguientes números</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Próxima factura</p>
              <p className="mt-1 font-mono text-sm font-semibold">{previewNumber}</p>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs text-muted-foreground">Próximo control</p>
              <p className="mt-1 font-mono text-sm font-semibold">{previewControl}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormInput label="Prefijo factura" value={form.invoice_prefix} onChange={(e) => setText('invoice_prefix', e.target.value)} placeholder="FAC" />
          <FormInput label="Serie / punto de emisión" value={form.invoice_series} onChange={(e) => setText('invoice_series', e.target.value)} placeholder="0001" />
          <FormInput label="Dígitos del correlativo" type="number" min={4} max={12} value={String(form.invoice_digits)} onChange={(e) => setNumber('invoice_digits', e.target.value)} hint="Entre 4 y 12" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Correlativo actual (facturas)" type="number" min={0} value={String(form.invoice_current_number)} onChange={(e) => setNumber('invoice_current_number', e.target.value)} hint="Número de la última factura emitida" />
          <FormInput label="Serie número de control" value={form.control_series} onChange={(e) => setText('control_series', e.target.value)} placeholder="B" hint="Serie asignada por la imprenta autorizada" />
        </div>
        <FormInput label="Número de control actual" type="number" min={0} value={String(form.control_current_number)} onChange={(e) => setNumber('control_current_number', e.target.value)} hint="Último número de control usado" />

        <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <FormInput label="Resolución / autorización" value={form.resolution_number ?? ''} onChange={(e) => setText('resolution_number', e.target.value)} placeholder="SNAT/2026/0001" hint="Opcional" />
          <FormInput label="Fecha de resolución" type="date" value={form.resolution_date ?? ''} onChange={(e) => setText('resolution_date', e.target.value)} />
        </div>

        <FormInput label="Nota al pie / leyenda" value={form.footer_note} onChange={(e) => setText('footer_note', e.target.value)} placeholder="Gracias por su compra." />

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
          <input
            type="checkbox"
            checked={Boolean(form.show_rate_on_invoice)}
            onChange={(e) => setBool('show_rate_on_invoice', e.target.checked)}
            className="mt-0.5 accent-cyan-500"
          />
          <div>
            <p className="text-sm font-medium">Mostrar tasa de cambio en la factura</p>
            <p className="mt-1 text-xs text-muted-foreground">Muestra la tasa BCV cuando la factura se emite en divisas.</p>
          </div>
        </label>
      </div>
    )
  }

  /** Sección: Facturas emitidas. */
  function renderFacturas() {
    const columns: TableColumn<Invoice>[] = [
      {
        key: 'invoice_number',
        header: 'Factura',
        sortable: true,
        sortValue: (inv) => inv.invoice_number,
        render: (inv) => (
          <div>
            <p className="font-mono text-xs font-medium">{inv.invoice_number}</p>
            <p className="text-xs text-muted-foreground">{inv.control_number ?? '—'}</p>
          </div>
        ),
      },
      {
        key: 'issued_at',
        header: 'Fecha',
        sortable: true,
        sortValue: (inv) => inv.issued_at,
        hiddenMobile: true,
        render: (inv) => <span className="text-xs text-muted-foreground">{new Date(inv.issued_at).toLocaleDateString('es-VE')}</span>,
      },
      {
        key: 'customer',
        header: 'Cliente',
        sortable: true,
        sortValue: (inv) => inv.customer_name ?? '',
        render: (inv) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{inv.customer_name || 'Consumidor Final'}</p>
            <p className="text-xs text-muted-foreground">
              {inv.customer_document ? `${documentTypeLabel(inv.customer_document_type ?? '')} ${inv.customer_document}` : '—'}
            </p>
          </div>
        ),
      },
      {
        key: 'total',
        header: 'Total',
        sortable: true,
        sortValue: (inv) => Number(inv.total),
        render: (inv) => (
          <div>
            <p className="font-medium">{moneyUsd(Number(inv.total))}</p>
            <p className="text-xs text-muted-foreground">{inv.currency === 'VES' ? 'Bs.' : 'USD'}</p>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Estado',
        sortable: true,
        sortValue: (inv) => inv.status,
        render: (inv) => (
          <span className={cn('inline-block rounded-full px-2.5 py-1 text-xs font-medium', STATUS_STYLES[inv.status] ?? 'bg-muted text-muted-foreground')}>
            {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        render: (inv) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setDetailInvoice(inv) }}
              aria-label="Ver detalle"
              className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Eye size={15} />
            </button>
            {inv.status === 'issued' && (
              <button
                onClick={(e) => { e.stopPropagation(); setCancelInvoiceId(inv.id); setCancelReason('') }}
                aria-label="Anular factura"
                className="grid size-8 place-items-center rounded-lg border border-destructive/30 text-destructive transition hover:bg-destructive/10"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ),
        cellClassName: 'text-right',
      },
    ]

    return (
      <div className="grid gap-5">
        {/* Botón y selector para emitir factura desde una solicitud */}
        <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-border p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Emitir factura desde solicitud</span>
              <select
                value={selectedRequest?.id ?? ''}
                onChange={(e) => {
                  const req = availableRequests.find((r) => r.id === e.target.value)
                  if (req) openIssue(req)
                }}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="">Selecciona una solicitud confirmada…</option>
                {availableRequests.map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id_short} · {r.full_name ?? 'Sin nombre'} · {moneyUsd(Number(r.total_usd))}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            onClick={() => { const first = availableRequests[0]; if (first) openIssue(first) }}
            disabled={availableRequests.length === 0}
            className="inline-flex h-10 items-center gap-2 self-end rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus size={15} /> Emitir factura
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {availableRequests.length} solicitud(es) disponible(s) para facturar · El correlativo se asigna automáticamente.
        </p>

        <DataTable
          data={invoices}
          columns={columns}
          rowKey={(inv) => inv.id}
          searchKeys={(inv) => `${inv.invoice_number} ${inv.control_number ?? ''} ${inv.customer_name ?? ''} ${inv.customer_document ?? ''} ${inv.customer_email ?? ''} ${inv.status}`}
          searchPlaceholder="Buscar por número, cliente, RIF o estado…"
          emptyMessage="No se encontraron facturas"
          noDataMessage="Aún no hay facturas emitidas"
          pageSize={8}
          onRowClick={(inv) => setDetailInvoice(inv)}
        />
      </div>
    )
  }

  /** Renderiza la sección activa. */
  function renderSection() {
    switch (active) {
      case 'emisor': return renderEmisor()
      case 'iva': return renderIva()
      case 'correlativos': return renderCorrelativos()
      case 'facturas': return renderFacturas()
    }
  }

  /** Solicitud seleccionada para el modal de emisión. */
  const issueSolicitud = selectedRequest

  return (
    <div className="grid gap-6">
      {/* Sub-menú de facturación */}
      <aside className="h-fit rounded-3xl border border-border bg-card p-3">
        <nav className="grid gap-1 sm:grid-cols-4">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                active === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Contenido de la sección activa */}
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="border-b border-border px-6 py-5">
          <h2 className="font-semibold tracking-tight">{SECTIONS.find((s) => s.key === active)?.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {active === 'facturas'
              ? 'Consulta, emite y anula facturas electrónicas.'
              : 'Configura los datos que aparecen en las facturas emitidas.'}
          </p>
        </div>
        <div className="p-6">{renderSection()}</div>
        {active !== 'facturas' && (
          <div className="flex items-center justify-end gap-3 border-t border-border bg-muted/30 px-6 py-4">
            <FormSubmitButton loading={saving} onClick={save}>
              <Save size={15} /> Guardar cambios
            </FormSubmitButton>
          </div>
        )}
      </div>

      {/* Modal: emitir factura */}
      {issueOpen && issueSolicitud && (
        <Modal
          open={issueOpen}
          onClose={() => setIssueOpen(false)}
          title="Emitir factura"
          description={`Solicitud #${issueSolicitud.id_short} · Total ${moneyUsd(Number(issueSolicitud.total_usd))}`}
          icon={<Receipt size={18} />}
          size="lg"
          preventBackdropClose={issuing}
          footer={
            <>
              <button onClick={() => setIssueOpen(false)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted">
                Cancelar
              </button>
              <FormSubmitButton loading={issuing} onClick={submitIssue} loadingText="Emitiendo…">
                <FileText size={15} /> Emitir factura
              </FormSubmitButton>
            </>
          }
        >
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput label="Nombre / Razón social del receptor" value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} placeholder="Nombre o razón social" />
              <label className="grid gap-2 text-sm">
                <span className="font-medium">Tipo de documento</span>
                <select
                  value={customer.document_type}
                  onChange={(e) => setCustomer((c) => ({ ...c, document_type: e.target.value as typeof c.document_type }))}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                >
                  <option value="rif">RIF</option>
                  <option value="ci">C.I.</option>
                  <option value="pasaporte">Pasaporte</option>
                </select>
              </label>
            </div>
            <FormInput
              label="Documento fiscal (RIF / C.I. / Pasaporte)"
              value={customer.document}
              onChange={(e) => setCustomer((c) => ({ ...c, document: e.target.value }))}
              placeholder={customer.document_type === 'rif' ? 'J-12345678-5' : 'V-12345678'}
              hint={customer.document_type === 'rif' ? 'Se valida el dígito verificador del SENIAT' : 'Documento de identidad del receptor'}
            />
            <FormInput label="Dirección" value={customer.address} onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput label="Correo" value={customer.email} onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))} />
              <FormInput label="Teléfono" value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} />
            </div>
            <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              El correlativo <span className="font-mono font-medium">{formatInvoiceNumber(form.invoice_prefix, form.invoice_series, nextNumber(Number(form.invoice_current_number)), Number(form.invoice_digits))}</span>{' '}
              se asignará automáticamente. El IVA se calcula con la configuración actual ({form.iva_rate}%).
            </p>
          </div>
        </Modal>
      )}

      {/* Modal: detalle de factura */}
      {detailInvoice && (
        <Modal
          open={Boolean(detailInvoice)}
          onClose={() => setDetailInvoice(null)}
          title={`Factura ${detailInvoice.invoice_number}`}
          description={`${INVOICE_STATUS_LABELS[detailInvoice.status] ?? detailInvoice.status} · Emitida ${new Date(detailInvoice.issued_at).toLocaleDateString('es-VE')}`}
          icon={<Receipt size={18} />}
          size="xl"
          className="max-w-3xl"
          footer={
            detailInvoice.status === 'issued' ? (
              <button
                onClick={() => { setCancelInvoiceId(detailInvoice.id); setCancelReason('') }}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-medium text-white transition-all hover:bg-destructive/90"
              >
                <Trash2 size={15} /> Anular factura
              </button>
            ) : undefined
          }
        >
          <div className="grid gap-5">
            {/* Datos del emisor */}
            <section className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Emisor</p>
              <div className="mt-2 grid gap-1 text-sm">
                <p className="font-medium">{detailInvoice.issuer_name}</p>
                <p className="text-muted-foreground">RIF: {detailInvoice.issuer_rif}</p>
                {detailInvoice.issuer_address && <p className="text-muted-foreground">{detailInvoice.issuer_address}</p>}
              </div>
            </section>

            {/* Datos del receptor */}
            <section className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Receptor</p>
              <div className="mt-2 grid gap-1 text-sm">
                <p className="font-medium">{detailInvoice.customer_name || 'Consumidor Final'}</p>
                {detailInvoice.customer_document && (
                  <p className="text-muted-foreground">
                    {documentTypeLabel(detailInvoice.customer_document_type ?? '')} {detailInvoice.customer_document}
                  </p>
                )}
                {detailInvoice.customer_email && <p className="text-muted-foreground">{detailInvoice.customer_email}</p>}
              </div>
            </section>

            {/* Ítems */}
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Productos</p>
              <div className="space-y-2">
                {(detailInvoice.items ?? []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">Cantidad: {item.quantity}</p>
                    </div>
                    <p className="font-medium">{moneyUsd(Number(item.unit_price_usd))}</p>
                  </div>
                ))}
                {!detailInvoice.items?.length && <p className="text-sm text-muted-foreground">Sin ítems.</p>}
              </div>
            </section>

            {/* Totales */}
            <section className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Base imponible</span>
                <span>{moneyUsd(Number(detailInvoice.subtotal))}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">IVA ({Number(detailInvoice.iva_rate)}%)</span>
                <span>{moneyUsd(Number(detailInvoice.iva_amount))}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2">
                <span className="font-medium">Total</span>
                <span className="text-lg font-semibold">{moneyUsd(Number(detailInvoice.total))}</span>
              </div>
              {Number(detailInvoice.exchange_rate) > 0 && detailInvoice.currency === 'USD' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tasa BCV: Bs. {Number(detailInvoice.exchange_rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USD
                </p>
              )}
            </section>

            {/* Anulación */}
            {detailInvoice.status === 'cancelled' && detailInvoice.cancelled_reason && (
              <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-destructive">Anulada</p>
                <p className="mt-1 text-sm text-destructive/90">{detailInvoice.cancelled_reason}</p>
                {detailInvoice.cancelled_at && (
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(detailInvoice.cancelled_at).toLocaleString('es-VE')}</p>
                )}
              </section>
            )}
          </div>
        </Modal>
      )}

      {/* Modal: anular factura */}
      {cancelInvoiceId && (
        <Modal
          open={Boolean(cancelInvoiceId)}
          onClose={() => { if (!cancelling) setCancelInvoiceId(null) }}
          title="Anular factura"
          description="La factura quedará marcada como anulada y no podrá reutilizarse su número."
          icon={<Trash2 size={18} />}
          preventBackdropClose={cancelling}
          footer={
            <>
              <button onClick={() => setCancelInvoiceId(null)} disabled={cancelling} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50">
                Cancelar
              </button>
              <FormSubmitButton loading={cancelling} onClick={submitCancel} loadingText="Anulando…" className="bg-destructive hover:bg-destructive/90">
                <Trash2 size={15} /> Confirmar anulación
              </FormSubmitButton>
            </>
          }
        >
          <FormInput label="Motivo de la anulación" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Ej: Anulación por solicitud del cliente" />
        </Modal>
      )}
    </div>
  )
}