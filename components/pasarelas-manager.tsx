'use client'

import { useCallback, useState } from 'react'
import { CheckCircle2, CreditCard, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { moneyUsd } from '@/lib/currency'

type Pasarela = {
  id: string
  nombre: string
  activo: boolean
  llave_publica: string | null
  llave_secreta_enc: string | null
  modo: 'sandbox' | 'produccion'
  comision_porcentual: number
}

type Pago = {
  id: string
  solicitud_id: string | null
  referencia_pasarela: string | null
  monto_usd: number
  moneda: string
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'reembolsado' | 'expirado'
  created_at: string
  pasarela_nombre?: string
}

const PAGO_META: Record<Pago['estado'], { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-amber-500/15 text-amber-600' },
  aprobado: { label: 'Aprobado', className: 'bg-emerald-500/15 text-emerald-600' },
  rechazado: { label: 'Rechazado', className: 'bg-rose-500/15 text-rose-600' },
  reembolsado: { label: 'Reembolsado', className: 'bg-muted text-muted-foreground' },
  expirado: { label: 'Expirado', className: 'bg-muted text-muted-foreground' },
}

const PASARELA_LABELS: Record<string, string> = {
  paypal: 'PayPal',
  stripe: 'Stripe',
  zelle: 'Zelle',
  binance: 'Binance',
  cripto: 'Crypto',
}

/** Gestor de pasarelas de pago con configuración y listado de pagos. */
export function PasarelasManager({ initialPasarelas, initialPagos }: { initialPasarelas: Pasarela[]; initialPagos: Pago[] }) {
  const [pasarelas, setPasarelas] = useState(initialPasarelas)
  const [pagos, setPagos] = useState(initialPagos)
  const [verPagos, setVerPagos] = useState(false)

  // Modal de edición de pasarela
  const [editando, setEditando] = useState<Pasarela | null>(null)
  const [form, setForm] = useState({ llave_publica: '', llave_secreta_enc: '', modo: 'sandbox' as 'sandbox' | 'produccion', comision_porcentual: '0' })
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/pasarelas', { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json()
    setPasarelas(result.pasarelas ?? [])
  }, [])

  function toggleActiva(p: Pasarela) {
    fetch('/api/admin/pasarelas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, activo: !p.activo }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const r = await res.json().catch(() => ({}))
          toast.error(r.error ?? 'No se pudo actualizar')
          return
        }
        refresh()
        toast.success(p.activo ? 'Pasarela desactivada' : 'Pasarela activada')
      })
  }

  function openEdit(p: Pasarela) {
    setEditando(p)
    setForm({
      llave_publica: p.llave_publica ?? '',
      llave_secreta_enc: p.llave_secreta_enc ?? '',
      modo: p.modo,
      comision_porcentual: String(p.comision_porcentual),
    })
  }

  async function save() {
    if (!editando) return
    setSaving(true)
    const response = await fetch('/api/admin/pasarelas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editando.id,
        llave_publica: form.llave_publica,
        llave_secreta_enc: form.llave_secreta_enc,
        modo: form.modo,
        comision_porcentual: Number(form.comision_porcentual) || 0,
      }),
    })
    setSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo guardar')
      return
    }
    setEditando(null)
    refresh()
    toast.success('Configuración guardada')
  }

  async function confirmarPago(pago: Pago, estado: 'aprobado' | 'rechazado') {
    const response = await fetch('/api/admin/pasarelas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirmar_pago', pago_id: pago.id, estado }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo confirmar')
      return
    }
    const res = await fetch('/api/admin/pasarelas?pagos=1', { cache: 'no-store' })
    if (res.ok) {
      const result = await res.json()
      setPagos(result.pagos ?? [])
    }
    toast.success(estado === 'aprobado' ? 'Pago aprobado' : 'Pago rechazado')
  }

  const pagoColumns: TableColumn<Pago>[] = [
    {
      key: 'referencia',
      header: 'Referencia',
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <CreditCard size={16} />
          </div>
          <div>
            <p className="font-medium">{p.referencia_pasarela || p.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-xs text-muted-foreground">{p.pasarela_nombre || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'monto',
      header: 'Monto',
      render: (p) => <span className="font-mono text-sm font-semibold">{moneyUsd(p.monto_usd)} {p.moneda}</span>,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (p) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${PAGO_META[p.estado].className}`}>
          {PAGO_META[p.estado].label}
        </span>
      ),
    },
    {
      key: 'fecha',
      header: 'Fecha',
      hiddenMobile: true,
      render: (p) => <span className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString('es-VE')}</span>,
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-24',
      cellClassName: 'text-right',
      render: (p) =>
        p.estado === 'pendiente' ? (
          <div className="flex justify-end gap-1">
            <button onClick={() => confirmarPago(p, 'aprobado')} aria-label="Aprobar" title="Aprobar" className="grid size-8 place-items-center rounded-lg text-emerald-600 hover:bg-emerald-500/10">
              <CheckCircle2 size={14} />
            </button>
            <button onClick={() => confirmarPago(p, 'rechazado')} aria-label="Rechazar" title="Rechazar" className="grid size-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10">
              <XCircle size={14} />
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <div className="grid gap-6">
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Pasarelas configuradas</h2>
            <p className="mt-1 text-sm text-muted-foreground">Activa o configura las pasarelas de pago.</p>
          </div>
          <button onClick={() => setVerPagos(true)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
            <CreditCard size={15} /> Ver pagos
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {pasarelas.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3">
              <div>
                <p className="font-medium">{PASARELA_LABELS[p.nombre] ?? p.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  Modo {p.modo === 'sandbox' ? 'pruebas' : 'producción'}
                  {p.comision_porcentual > 0 ? ` · Comisión ${p.comision_porcentual}%` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActiva(p)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${p.activo ? 'bg-emerald-500' : 'bg-muted'}`}
                  aria-label={`Activar ${p.nombre}`}
                >
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${p.activo ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
                <button onClick={() => openEdit(p)} className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted">
                  Configurar
                </button>
              </div>
            </div>
          ))}
          {pasarelas.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay pasarelas configuradas.</p>}
        </div>
      </div>

      {/* Modal de configuración */}
      <Modal
        open={Boolean(editando)}
        onClose={() => setEditando(null)}
        size="md"
        title={`Configurar ${editando ? (PASARELA_LABELS[editando.nombre] ?? editando.nombre) : ''}`}
        description="Configura las llaves y el modo de operación."
        icon={<CreditCard size={18} />}
        footer={
          <>
            <button onClick={() => setEditando(null)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={save}>
              Guardar
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <FormInput label="Llave pública" value={form.llave_publica} onChange={(e) => setForm({ ...form, llave_publica: e.target.value })} placeholder="pk_..." />
          <FormInput label="Llave secreta" type="password" value={form.llave_secreta_enc} onChange={(e) => setForm({ ...form, llave_secreta_enc: e.target.value })} placeholder="sk_..." />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Modo</span>
              <select value={form.modo} onChange={(e) => setForm({ ...form, modo: e.target.value as 'sandbox' | 'produccion' })} className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30">
                <option value="sandbox">Sandbox (pruebas)</option>
                <option value="produccion">Producción</option>
              </select>
            </label>
            <FormInput label="Comisión (%)" type="number" min={0} step="0.01" value={form.comision_porcentual} onChange={(e) => setForm({ ...form, comision_porcentual: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Modal de pagos */}
      <Modal
        open={verPagos}
        onClose={() => setVerPagos(false)}
        size="xl"
        title="Pagos recibidos"
        description="Listado de pagos con estado y referencia."
        icon={<CreditCard size={18} />}
        footer={
          <button onClick={() => setVerPagos(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
            Cerrar
          </button>
        }
      >
        <DataTable
          data={pagos}
          columns={pagoColumns}
          rowKey={(p) => p.id}
          searchKeys={(p) => `${p.referencia_pasarela ?? ''} ${p.pasarela_nombre ?? ''} ${p.estado}`}
          searchPlaceholder="Buscar pagos…"
          emptyMessage="No se encontraron pagos"
          noDataMessage="Aún no hay pagos registrados"
          pageSize={8}
        />
      </Modal>
    </div>
  )
}