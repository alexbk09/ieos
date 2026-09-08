'use client'

import { useCallback, useState } from 'react'
import { History, Plus, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { moneyUsd } from '@/lib/currency'

type CuentaPorCobrar = {
  id: string
  invoice_id: string
  total_usd: number
  abonado_usd: number
  saldo_usd: number
  estado: 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'cancelada'
  updated_at: string
  invoice_number?: string
  customer_name?: string | null
  customer_email?: string | null
  fecha_vencimiento?: string | null
  cliente_id?: string | null
}

type Abono = {
  id: string
  invoice_id: string
  monto_usd: number
  metodo: string
  referencia: string | null
  fecha: string
  notas: string | null
}

/** Etiquetas y colores de estados de la cuenta por cobrar. */
const ESTADO_META: Record<CuentaPorCobrar['estado'], { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-amber-500/15 text-amber-600' },
  parcial: { label: 'Parcial', className: 'bg-sky-500/15 text-sky-600' },
  pagada: { label: 'Pagada', className: 'bg-emerald-500/15 text-emerald-600' },
  vencida: { label: 'Vencida', className: 'bg-rose-500/15 text-rose-600' },
  cancelada: { label: 'Cancelada', className: 'bg-muted text-muted-foreground' },
}

/** Métodos de pago disponibles para abonos. */
const METODOS = ['transferencia', 'movil', 'efectivo', 'tarjeta', 'paypal', 'zelle'] as const

/** Etiquetas legibles de métodos de pago. */
const METODO_LABELS: Record<string, string> = {
  transferencia: 'Transferencia',
  movil: 'Pago móvil',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  paypal: 'PayPal',
  zelle: 'Zelle',
}

/**
 * Gestor de cuentas por cobrar.
 * Permite ver el estado de cada factura (pendiente, parcial, pagada,
 * vencida), registrar abonos con método/referencia, ver el historial
 * de abonos y consultar los límites de crédito por cliente.
 */
export function CuentasCobrarManager({ initialCuentas }: { initialCuentas: CuentaPorCobrar[] }) {
  const [cuentas, setCuentas] = useState(initialCuentas)

  // Modal de abono
  const [abonoOpen, setAbonoOpen] = useState(false)
  const [abonoCuenta, setAbonoCuenta] = useState<CuentaPorCobrar | null>(null)
  const [abonoForm, setAbonoForm] = useState({ monto: '', metodo: 'transferencia', referencia: '', notas: '' })
  const [abonoSaving, setAbonoSaving] = useState(false)

  // Modal de historial de abonos
  const [historialOpen, setHistorialOpen] = useState(false)
  const [historial, setHistorial] = useState<Abono[]>([])
  const [historialCuenta, setHistorialCuenta] = useState<CuentaPorCobrar | null>(null)
  const [historialLoading, setHistorialLoading] = useState(false)

  /** Refresca las cuentas desde el servidor. */
  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/cuentas-cobrar', { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json()
    setCuentas(result.cuentas ?? [])
  }, [])

  /** Abre el modal de abono para una cuenta. */
  function openAbono(cuenta: CuentaPorCobrar) {
    if (cuenta.estado === 'pagada' || cuenta.estado === 'cancelada') {
      toast.info('Esta cuenta ya está cerrada')
      return
    }
    setAbonoCuenta(cuenta)
    setAbonoForm({ monto: String(cuenta.saldo_usd), metodo: 'transferencia', referencia: '', notas: '' })
    setAbonoOpen(true)
  }

  /** Registra el abono. */
  async function saveAbono() {
    if (!abonoCuenta) return
    const monto = Number(abonoForm.monto)
    if (!monto || monto <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    setAbonoSaving(true)
    const response = await fetch('/api/admin/cuentas-cobrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'registrar_abono',
        invoice_id: abonoCuenta.invoice_id,
        monto,
        metodo: abonoForm.metodo,
        referencia: abonoForm.referencia,
        notas: abonoForm.notas,
      }),
    })
    setAbonoSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo registrar el abono')
      return
    }

    setAbonoOpen(false)
    refresh()
    toast.success('Abono registrado')
  }

  /** Abre el historial de abonos de una cuenta. */
  async function openHistorial(cuenta: CuentaPorCobrar) {
    setHistorialCuenta(cuenta)
    setHistorial([])
    setHistorialLoading(true)
    setHistorialOpen(true)
    try {
      const response = await fetch(`/api/admin/cuentas-cobrar?abonos=${cuenta.invoice_id}`, { cache: 'no-store' })
      const result = await response.json()
      setHistorial(result.abonos ?? [])
    } catch {
      toast.error('No se pudo cargar el historial')
    } finally {
      setHistorialLoading(false)
    }
  }

  const columns: TableColumn<CuentaPorCobrar>[] = [
    {
      key: 'factura',
      header: 'Factura',
      sortable: true,
      sortValue: (c) => c.invoice_number ?? '',
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <Wallet size={16} />
          </div>
          <div>
            <p className="font-medium">{c.invoice_number ?? c.invoice_id.slice(0, 8).toUpperCase()}</p>
            <p className="max-w-xs truncate text-xs text-muted-foreground">{c.customer_name || 'Cliente'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (c) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_META[c.estado].className}`}>
          {ESTADO_META[c.estado].label}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      hiddenMobile: true,
      render: (c) => <span className="font-mono text-sm">{moneyUsd(c.total_usd)}</span>,
    },
    {
      key: 'abonado',
      header: 'Abonado',
      hiddenMobile: true,
      render: (c) => <span className="font-mono text-sm text-emerald-600">{moneyUsd(c.abonado_usd)}</span>,
    },
    {
      key: 'saldo',
      header: 'Saldo',
      sortable: true,
      sortValue: (c) => c.saldo_usd,
      render: (c) => <span className="font-mono text-sm font-semibold text-rose-600">{moneyUsd(c.saldo_usd)}</span>,
    },
    {
      key: 'vencimiento',
      header: 'Vence',
      hiddenMobile: true,
      render: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString('es-VE') : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-32',
      cellClassName: 'text-right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openHistorial(c)}
            aria-label={`Historial de abonos de ${c.invoice_number ?? c.invoice_id}`}
            title="Historial de abonos"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <History size={14} />
          </button>
          {c.estado !== 'pagada' && c.estado !== 'cancelada' && (
            <button
              onClick={() => openAbono(c)}
              aria-label={`Registrar abono de ${c.invoice_number ?? c.invoice_id}`}
              title="Registrar abono"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <DataTable
        data={cuentas}
        columns={columns}
        rowKey={(c) => c.id}
        searchKeys={(c) => `${c.invoice_number ?? ''} ${c.customer_name ?? ''} ${c.customer_email ?? ''}`}
        searchPlaceholder="Buscar cuentas por cobrar…"
        emptyMessage="No se encontraron cuentas"
        noDataMessage="Aún no hay cuentas por cobrar"
      />

      {/* Modal de registrar abono */}
      <Modal
        open={abonoOpen}
        onClose={() => setAbonoOpen(false)}
        size="sm"
        title="Registrar abono"
        description={`Factura ${abonoCuenta?.invoice_number ?? ''} · Saldo ${abonoCuenta ? moneyUsd(abonoCuenta.saldo_usd) : ''}`}
        icon={<Wallet size={18} />}
        footer={
          <>
            <button onClick={() => setAbonoOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cancelar
            </button>
            <FormSubmitButton loading={abonoSaving} onClick={saveAbono}>
              Registrar abono
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <FormInput label="Monto (USD)" type="number" min={0.01} step="0.01" value={abonoForm.monto} onChange={(e) => setAbonoForm({ ...abonoForm, monto: e.target.value })} placeholder="0.00" autoFocus />
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Método de pago</span>
            <select
              value={abonoForm.metodo}
              onChange={(e) => setAbonoForm({ ...abonoForm, metodo: e.target.value })}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              {METODOS.map((m) => (
                <option key={m} value={m}>{METODO_LABELS[m]}</option>
              ))}
            </select>
          </label>
          <FormInput label="Referencia" value={abonoForm.referencia} onChange={(e) => setAbonoForm({ ...abonoForm, referencia: e.target.value })} placeholder="N° de referencia/operación" />
          <FormInput label="Notas" value={abonoForm.notas} onChange={(e) => setAbonoForm({ ...abonoForm, notas: e.target.value })} placeholder="Observaciones…" />
        </div>
      </Modal>

      {/* Modal de historial de abonos */}
      <Modal
        open={historialOpen}
        onClose={() => setHistorialOpen(false)}
        size="lg"
        title={`Abonos de ${historialCuenta?.invoice_number ?? ''}`}
        description="Historial de pagos registrados."
        icon={<History size={18} />}
        footer={
          <button onClick={() => setHistorialOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
            Cerrar
          </button>
        }
      >
        {historialLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin abonos registrados.</p>
        ) : (
          <div className="space-y-3">
            {historial.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-600">{moneyUsd(a.monto_usd)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {METODO_LABELS[a.metodo] ?? a.metodo}
                    {a.referencia ? ` · Ref: ${a.referencia}` : ''}
                    {a.notas ? ` · ${a.notas}` : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(a.fecha).toLocaleString('es-VE')}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}