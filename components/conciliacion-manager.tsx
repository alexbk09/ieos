'use client'

import { useCallback, useState } from 'react'
import { CheckCircle2, Landmark, Plus, RefreshCw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { moneyUsd } from '@/lib/currency'

type Banco = {
  id: string
  nombre_banco: string
  tipo_integracion: 'manual' | 'api'
  api_endpoint: string | null
  api_key: string | null
  activo: boolean
  ultima_sincronizacion: string | null
}

type Movimiento = {
  id: string
  banco_id: string | null
  referencia: string
  fecha_movimiento: string
  monto_usd: number
  emisor: string | null
  beneficiario: string | null
  detalle: string | null
  estado: 'nuevo' | 'conciliado' | 'descartado' | 'duplicado'
  abono_id: string | null
  banco_nombre?: string | null
}

/** Etiquetas y colores de estados de movimiento. */
const ESTADO_META: Record<Movimiento['estado'], { label: string; className: string }> = {
  nuevo: { label: 'Nuevo', className: 'bg-amber-500/15 text-amber-600' },
  conciliado: { label: 'Conciliado', className: 'bg-emerald-500/15 text-emerald-600' },
  descartado: { label: 'Descartado', className: 'bg-muted text-muted-foreground' },
  duplicado: { label: 'Duplicado', className: 'bg-rose-500/15 text-rose-600' },
}

/**
 * Gestor de conciliación bancaria.
 * Permite visualizar movimientos bancarios con filtro por estado,
 * crear movimientos manuales, sincronizar con el endpoint del banco
 * y conciliar/descartar cada movimiento.
 */
export function ConciliacionManager({
  initialMovimientos,
  initialBancos,
}: {
  initialMovimientos: Movimiento[]
  initialBancos: Banco[]
}) {
  const [movimientos, setMovimientos] = useState(initialMovimientos)
  const [bancos, setBancos] = useState(initialBancos)
  const [filtroEstado, setFiltroEstado] = useState<string>('')

  // Modal de bancos (ver/crear)
  const [bancosOpen, setBancosOpen] = useState(false)
  const [bancoForm, setBancoForm] = useState({ nombre_banco: '', tipo_integracion: 'manual' as 'manual' | 'api', api_endpoint: '', api_key: '' })
  const [bancoSaving, setBancoSaving] = useState(false)

  // Modal de movimiento manual
  const [movOpen, setMovOpen] = useState(false)
  const [movForm, setMovForm] = useState({ banco_id: '', referencia: '', monto_usd: '', emisor: '', beneficiario: '', detalle: '' })
  const [movSaving, setMovSaving] = useState(false)

  // Sincronización
  const [sincronizando, setSincronizando] = useState(false)
  const [abonoBuscado, setAbonoBuscado] = useState('')

  /** Refresca los movimientos desde el servidor. */
  const refresh = useCallback(async (estado?: string) => {
    const url = estado ? `/api/admin/conciliacion?estado=${estado}` : '/api/admin/conciliacion'
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json()
    setMovimientos(result.movimientos ?? [])
  }, [])

  /** Cambia el filtro de estado. */
  function cambiarFiltro(estado: string) {
    setFiltroEstado(estado)
    refresh(estado || undefined)
  }

  /** Abre el modal de crear movimiento manual. */
  function openMovimiento() {
    setMovForm({ banco_id: '', referencia: '', monto_usd: '', emisor: '', beneficiario: '', detalle: '' })
    setMovOpen(true)
  }

  /** Guarda el movimiento manual. */
  async function saveMovimiento() {
    if (!movForm.referencia.trim() || !movForm.monto_usd) {
      toast.error('Completa la referencia y el monto')
      return
    }
    setMovSaving(true)
    const response = await fetch('/api/admin/conciliacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'crear_movimiento', ...movForm }),
    })
    setMovSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo crear el movimiento')
      return
    }
    setMovOpen(false)
    refresh(filtroEstado || undefined)
    toast.success('Movimiento creado')
  }

  /** Sincroniza con el endpoint del banco seleccionado. */
  async function sincronizar(banco: Banco) {
    setSincronizando(true)
    try {
      const response = await fetch('/api/admin/conciliacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sincronizar', banco_id: banco.id }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error(result.error ?? 'No se pudo sincronizar')
        return
      }
      toast.success(`Sincronizado: ${result.creados ?? 0} movimientos nuevos`)
      refresh(filtroEstado || undefined)
    } catch {
      toast.error('No se pudo sincronizar con el banco')
    } finally {
      setSincronizando(false)
    }
  }

  /** Concilia un movimiento contra un abono (por referencia). */
  async function conciliar(movimiento: Movimiento) {
    const abonoId = abonoBuscado.trim()
    if (!abonoId) {
      toast.error('Ingresa el ID del abono a conciliar')
      return
    }
    const response = await fetch('/api/admin/conciliacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'conciliar', movimiento_id: movimiento.id, abono_id: abonoId }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo conciliar')
      return
    }
    setAbonoBuscado('')
    refresh(filtroEstado || undefined)
    toast.success('Movimiento conciliado')
  }

  /** Descarta un movimiento. */
  async function descartar(movimiento: Movimiento) {
    const response = await fetch('/api/admin/conciliacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'descartar', movimiento_id: movimiento.id }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo descartar')
      return
    }
    refresh(filtroEstado || undefined)
    toast.success('Movimiento descartado')
  }

  /** Abre el modal de bancos. */
  function openBancos() {
    setBancoForm({ nombre_banco: '', tipo_integracion: 'manual', api_endpoint: '', api_key: '' })
    setBancosOpen(true)
  }

  /** Guarda un banco nuevo. */
  async function saveBanco() {
    if (!bancoForm.nombre_banco.trim()) {
      toast.error('Completa el nombre del banco')
      return
    }
    setBancoSaving(true)
    const response = await fetch('/api/admin/conciliacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bancoForm),
    })
    setBancoSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo crear el banco')
      return
    }
    const res = await fetch('/api/admin/conciliacion?bancos=1', { cache: 'no-store' })
    if (res.ok) {
      const result = await res.json()
      setBancos(result.bancos ?? [])
    }
    toast.success('Banco agregado')
  }

  const columns: TableColumn<Movimiento>[] = [
    {
      key: 'movimiento',
      header: 'Movimiento',
      sortable: true,
      sortValue: (m) => m.fecha_movimiento,
      render: (m) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <Landmark size={16} />
          </div>
          <div className="min-w-0">
            <p className="font-medium">{m.referencia}</p>
            <p className="truncate text-xs text-muted-foreground">{m.banco_nombre || m.emisor || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'fecha',
      header: 'Fecha',
      hiddenMobile: true,
      render: (m) => <span className="text-xs text-muted-foreground">{new Date(m.fecha_movimiento).toLocaleString('es-VE')}</span>,
    },
    {
      key: 'monto',
      header: 'Monto',
      sortable: true,
      sortValue: (m) => m.monto_usd,
      render: (m) => <span className="font-mono text-sm font-semibold">{moneyUsd(m.monto_usd)}</span>,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (m) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_META[m.estado].className}`}>
          {ESTADO_META[m.estado].label}
        </span>
      ),
    },
    {
      key: 'detalle',
      header: 'Detalle',
      hiddenMobile: true,
      render: (m) => <span className="max-w-[200px] truncate text-xs text-muted-foreground">{m.detalle || m.beneficiario || '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-24',
      cellClassName: 'text-right',
      render: (m) =>
        m.estado === 'nuevo' ? (
          <div className="flex justify-end gap-1">
            <button
              onClick={() => conciliar(m)}
              aria-label={`Conciliar ${m.referencia}`}
              title="Conciliar"
              className="grid size-8 place-items-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-500/10"
            >
              <CheckCircle2 size={14} />
            </button>
            <button
              onClick={() => descartar(m)}
              aria-label={`Descartar ${m.referencia}`}
              title="Descartar"
              className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
            >
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
      <div className="flex flex-wrap items-center gap-2">
        {['', 'nuevo', 'conciliado', 'descartado'].map((estado) => (
          <button
            key={estado || 'todos'}
            onClick={() => cambiarFiltro(estado)}
            className={`inline-flex h-9 items-center rounded-xl px-4 text-sm font-medium transition-colors ${filtroEstado === estado ? 'bg-primary text-primary-foreground' : 'border border-border bg-background hover:bg-muted'}`}
          >
            {estado ? ESTADO_META[estado as Movimiento['estado']].label : 'Todos'}
          </button>
        ))}
      </div>

      <DataTable
        data={movimientos}
        columns={columns}
        rowKey={(m) => m.id}
        searchKeys={(m) => `${m.referencia} ${m.emisor ?? ''} ${m.beneficiario ?? ''} ${m.detalle ?? ''} ${m.banco_nombre ?? ''}`}
        searchPlaceholder="Buscar movimientos…"
        emptyMessage="No se encontraron movimientos"
        noDataMessage="Aún no hay movimientos bancarios"
        toolbar={
          <div className="flex gap-2">
            <input
              value={abonoBuscado}
              onChange={(e) => setAbonoBuscado(e.target.value)}
              placeholder="ID del abono a conciliar"
              className="h-9 w-48 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <button
              onClick={openBancos}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Landmark size={15} /> Bancos
            </button>
            <button
              onClick={openMovimiento}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <Plus size={15} /> Nuevo movimiento
            </button>
          </div>
        }
      />

      {/* Modal de crear movimiento manual */}
      <Modal
        open={movOpen}
        onClose={() => setMovOpen(false)}
        size="lg"
        title="Nuevo movimiento bancario"
        description="Registra un pago móvil o transferencia manualmente."
        icon={<Landmark size={18} />}
        footer={
          <>
            <button onClick={() => setMovOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cancelar
            </button>
            <FormSubmitButton loading={movSaving} onClick={saveMovimiento}>
              Crear movimiento
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Banco</span>
            <select
              value={movForm.banco_id}
              onChange={(e) => setMovForm({ ...movForm, banco_id: e.target.value })}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="">Sin banco</option>
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre_banco}</option>
              ))}
            </select>
          </label>
          <FormInput label="Referencia" value={movForm.referencia} onChange={(e) => setMovForm({ ...movForm, referencia: e.target.value })} placeholder="N° de operación" autoFocus />
          <FormInput label="Monto (USD)" type="number" min={0.01} step="0.01" value={movForm.monto_usd} onChange={(e) => setMovForm({ ...movForm, monto_usd: e.target.value })} placeholder="0.00" />
          <FormInput label="Emisor" value={movForm.emisor} onChange={(e) => setMovForm({ ...movForm, emisor: e.target.value })} placeholder="Quien envía" />
          <FormInput label="Beneficiario" value={movForm.beneficiario} onChange={(e) => setMovForm({ ...movForm, beneficiario: e.target.value })} placeholder="Quien recibe" />
          <FormInput label="Detalle" value={movForm.detalle} onChange={(e) => setMovForm({ ...movForm, detalle: e.target.value })} placeholder="Descripción…" className="sm:col-span-2" />
        </div>
      </Modal>

      {/* Modal de bancos */}
      <Modal
        open={bancosOpen}
        onClose={() => setBancosOpen(false)}
        size="lg"
        title="Bancos e integraciones"
        description="Configura bancos manuales o por API para conciliar."
        icon={<Landmark size={18} />}
        footer={
          <>
            <button onClick={() => setBancosOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cerrar
            </button>
            <FormSubmitButton loading={bancoSaving} onClick={saveBanco}>
              Agregar banco
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput label="Nombre del banco" value={bancoForm.nombre_banco} onChange={(e) => setBancoForm({ ...bancoForm, nombre_banco: e.target.value })} placeholder="Ej: Banco de Venezuela" />
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Integración</span>
              <select
                value={bancoForm.tipo_integracion}
                onChange={(e) => setBancoForm({ ...bancoForm, tipo_integracion: e.target.value as 'manual' | 'api' })}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="manual">Manual</option>
                <option value="api">API</option>
              </select>
            </label>
            {bancoForm.tipo_integracion === 'api' && (
              <>
                <FormInput label="Endpoint API" value={bancoForm.api_endpoint} onChange={(e) => setBancoForm({ ...bancoForm, api_endpoint: e.target.value })} placeholder="https://banco.com/api/movimientos" />
                <FormInput label="API Key" value={bancoForm.api_key} onChange={(e) => setBancoForm({ ...bancoForm, api_key: e.target.value })} placeholder="Clave de acceso" />
              </>
            )}
          </div>

          <div className="grid gap-2">
            {bancos.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{b.nombre_banco}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.tipo_integracion === 'api' ? 'Integración API' : 'Manual'}
                    {b.ultima_sincronizacion ? ` · Última sinc: ${new Date(b.ultima_sincronizacion).toLocaleString('es-VE')}` : ''}
                  </p>
                </div>
                {b.tipo_integracion === 'api' && b.api_endpoint && (
                  <button
                    onClick={() => sincronizar(b)}
                    disabled={sincronizando}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={sincronizando ? 'animate-spin' : ''} /> Sincronizar
                  </button>
                )}
              </div>
            ))}
            {bancos.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay bancos configurados.</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}