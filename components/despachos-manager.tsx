'use client'

import { useCallback, useState } from 'react'
import { ArrowRight, History, Plus, Truck, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { SearchableSelect } from '@/components/ui/select-search'

type Transportista = {
  id: string
  nombre: string
  tipo: 'interno' | 'externo'
  telefono: string | null
  vehiculo: string | null
  placa: string | null
  activo: boolean
  created_at: string
}

type Almacen = { id: string; nombre: string; codigo: string }

type SolicitudDespachable = {
  id: string
  id_short: string
  total_usd: number
  status: string
  full_name: string | null
  direccion_entrega: string | null
  telefono_entrega: string | null
}

type Despacho = {
  id: string
  solicitud_id: string
  solicitud_id_short?: string
  almacen_origen: string | null
  transportista_id: string | null
  ruta: string | null
  estado: 'programado' | 'en_ruta' | 'entregado' | 'fallido'
  fecha_programada: string | null
  fecha_entrega: string | null
  notas: string | null
  created_at: string
  cliente_nombre?: string | null
  almacen_nombre?: string | null
  transportista_nombre?: string | null
}

/** Etiquetas y colores de estados de despacho. */
const ESTADO_META: Record<Despacho['estado'], { label: string; className: string }> = {
  programado: { label: 'Programado', className: 'bg-sky-500/15 text-sky-600' },
  en_ruta: { label: 'En ruta', className: 'bg-amber-500/15 text-amber-600' },
  entregado: { label: 'Entregado', className: 'bg-emerald-500/15 text-emerald-600' },
  fallido: { label: 'Fallido', className: 'bg-rose-500/15 text-rose-600' },
}

/**
 * Gestor de despacho y rutas.
 * Permite crear despachos desde solicitudes, asignar transportistas,
 * avanzar estados (programado → en_ruta → entregado/fallido) y ver
 * el historial de cada despacho.
 */
export function DespachosManager({
  initialDespachos,
  initialSolicitudes,
  initialTransportistas,
  initialAlmacenes,
}: {
  initialDespachos: Despacho[]
  initialSolicitudes: SolicitudDespachable[]
  initialTransportistas: Transportista[]
  initialAlmacenes: Almacen[]
}) {
  const [despachos, setDespachos] = useState(initialDespachos)
  const [solicitudes, setSolicitudes] = useState(initialSolicitudes)
  const [transportistas, setTransportistas] = useState(initialTransportistas)
  const [almacenes, setAlmacenes] = useState(initialAlmacenes)

  // Modal de creación de despacho
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ solicitud_id: '', almacen_origen: '', transportista_id: '', ruta: '', fecha_programada: '', notas: '' })
  const [createSaving, setCreateSaving] = useState(false)

  // Modal de asignar transportista
  const [asignarOpen, setAsignarOpen] = useState(false)
  const [asignarDespacho, setAsignarDespacho] = useState<Despacho | null>(null)
  const [asignarTransportistaId, setAsignarTransportistaId] = useState('')
  const [asignarSaving, setAsignarSaving] = useState(false)

  // Modal de avanzar estado
  const [avanzarOpen, setAvanzarOpen] = useState(false)
  const [avanzarDespacho, setAvanzarDespacho] = useState<Despacho | null>(null)
  const [avanzarForm, setAvanzarForm] = useState({ estado: 'en_ruta' as Despacho['estado'], ubicacion: '', observaciones: '' })
  const [avanzarSaving, setAvanzarSaving] = useState(false)

  // Modal de historial
  const [historialOpen, setHistorialOpen] = useState(false)
  const [historial, setHistorial] = useState<Array<{ id: string; estado_nuevo: string; estado_anterior: string | null; ubicacion: string | null; observaciones: string | null; created_at: string }>>([])
  const [historialLoading, setHistorialLoading] = useState(false)

  // Modal de transportistas
  const [transpOpen, setTranspOpen] = useState(false)
  const [transpForm, setTranspForm] = useState({ nombre: '', tipo: 'externo' as 'interno' | 'externo', telefono: '', vehiculo: '', placa: '' })
  const [transpSaving, setTranspSaving] = useState(false)

  /** Refresca despachos y solicitudes disponibles. */
  const refresh = useCallback(async () => {
    const [despachosRes, solicitudesRes] = await Promise.all([
      fetch('/api/admin/despachos', { cache: 'no-store' }),
      fetch('/api/admin/despachos?tipo=solicitudes', { cache: 'no-store' }),
    ])
    if (despachosRes.ok) {
      const result = await despachosRes.json()
      setDespachos(result.despachos ?? [])
    }
    if (solicitudesRes.ok) {
      const result = await solicitudesRes.json()
      setSolicitudes(result.solicitudes ?? [])
    }
  }, [])

  /** Abre el modal de crear despacho. */
  function openCreate() {
    setCreateForm({ solicitud_id: '', almacen_origen: '', transportista_id: '', ruta: '', fecha_programada: new Date().toISOString().slice(0, 10), notas: '' })
    setCreateOpen(true)
  }

  /** Guarda el despacho nuevo. */
  async function saveCreate() {
    if (!createForm.solicitud_id) {
      toast.error('Selecciona una solicitud')
      return
    }
    setCreateSaving(true)
    const response = await fetch('/api/admin/despachos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'crear_despacho', ...createForm }),
    })
    setCreateSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo crear el despacho')
      return
    }
    setCreateOpen(false)
    refresh()
    toast.success('Despacho creado')
  }

  /** Abre el modal para asignar transportista. */
  function openAsignar(despacho: Despacho) {
    setAsignarDespacho(despacho)
    setAsignarTransportistaId(despacho.transportista_id ?? '')
    setAsignarOpen(true)
  }

  /** Guarda la asignación de transportista. */
  async function saveAsignar() {
    if (!asignarDespacho) return
    setAsignarSaving(true)
    const response = await fetch('/api/admin/despachos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'asignar_transportista', despacho_id: asignarDespacho.id, transportista_id: asignarTransportistaId || null }),
    })
    setAsignarSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo asignar')
      return
    }
    setAsignarOpen(false)
    refresh()
    toast.success('Transportista asignado')
  }

  /** Abre el modal para avanzar estado. */
  function openAvanzar(despacho: Despacho) {
    setAvanzarDespacho(despacho)
    setAvanzarForm({ estado: despacho.estado === 'programado' ? 'en_ruta' : 'entregado', ubicacion: '', observaciones: '' })
    setAvanzarOpen(true)
  }

  /** Guarda el avance de estado. */
  async function saveAvanzar() {
    if (!avanzarDespacho) return
    setAvanzarSaving(true)
    const response = await fetch('/api/admin/despachos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'avanzar_estado', despacho_id: avanzarDespacho.id, ...avanzarForm }),
    })
    setAvanzarSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo actualizar el estado')
      return
    }
    setAvanzarOpen(false)
    refresh()
    toast.success('Estado actualizado')
  }

  /** Abre el historial de un despacho. */
  async function openHistorial(despacho: Despacho) {
    setHistorialOpen(true)
    setHistorial([])
    setHistorialLoading(true)
    try {
      const response = await fetch(`/api/admin/despachos?historial=${despacho.id}`, { cache: 'no-store' })
      const result = await response.json()
      setHistorial(result.historial ?? [])
    } catch {
      toast.error('No se pudo cargar el historial')
    } finally {
      setHistorialLoading(false)
    }
  }

  /** Abre el modal de transportistas. */
  function openTransportistas() {
    setTranspForm({ nombre: '', tipo: 'externo', telefono: '', vehiculo: '', placa: '' })
    setTranspOpen(true)
  }

  /** Guarda un transportista nuevo. */
  async function saveTransportista() {
    if (!transpForm.nombre.trim()) {
      toast.error('Completa el nombre del transportista')
      return
    }
    setTranspSaving(true)
    const response = await fetch('/api/admin/despachos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transpForm),
    })
    setTranspSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo crear el transportista')
      return
    }
    // Refrescar transportistas
    const res = await fetch('/api/admin/despachos?tipo=transportistas', { cache: 'no-store' })
    if (res.ok) {
      const result = await res.json()
      setTransportistas(result.transportistas ?? [])
    }
    toast.success('Transportista creado')
  }

  const ESTADO_LABELS: Record<string, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    shipped: 'Enviada',
    completed: 'Completada',
    cancelled: 'Cancelada',
  }

  const columns: TableColumn<Despacho>[] = [
    {
      key: 'despacho',
      header: 'Despacho',
      sortable: true,
      sortValue: (d) => d.created_at,
      render: (d) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <Truck size={16} />
          </div>
          <div>
            <p className="font-medium">{d.solicitud_id_short ?? d.solicitud_id.slice(0, 8).toUpperCase()}</p>
            <p className="text-xs text-muted-foreground">{d.cliente_nombre || 'Cliente'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (d) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_META[d.estado].className}`}>
          {ESTADO_META[d.estado].label}
        </span>
      ),
    },
    {
      key: 'almacen',
      header: 'Almacén',
      hiddenMobile: true,
      render: (d) => <span className="text-sm text-muted-foreground">{d.almacen_nombre || '—'}</span>,
    },
    {
      key: 'transportista',
      header: 'Transportista',
      hiddenMobile: true,
      render: (d) => <span className="text-sm text-muted-foreground">{d.transportista_nombre || '—'}</span>,
    },
    {
      key: 'ruta',
      header: 'Ruta',
      hiddenMobile: true,
      render: (d) => <span className="text-xs text-muted-foreground">{d.ruta || '—'}</span>,
    },
    {
      key: 'fecha',
      header: 'Programado',
      hiddenMobile: true,
      render: (d) => (
        <span className="text-xs text-muted-foreground">
          {d.fecha_programada ? new Date(d.fecha_programada).toLocaleDateString('es-VE') : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-40',
      cellClassName: 'text-right',
      render: (d) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openHistorial(d)}
            aria-label={`Historial de ${d.solicitud_id_short}`}
            title="Historial"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <History size={14} />
          </button>
          <button
            onClick={() => openAsignar(d)}
            aria-label={`Asignar transportista a ${d.solicitud_id_short}`}
            title="Asignar transportista"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <UserPlus size={14} />
          </button>
          {d.estado !== 'entregado' && d.estado !== 'fallido' && (
            <button
              onClick={() => openAvanzar(d)}
              aria-label={`Avanzar estado de ${d.solicitud_id_short}`}
              title="Avanzar estado"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <DataTable
        data={despachos}
        columns={columns}
        rowKey={(d) => d.id}
        searchKeys={(d) => `${d.solicitud_id_short ?? ''} ${d.cliente_nombre ?? ''} ${d.ruta ?? ''} ${d.transportista_nombre ?? ''}`}
        searchPlaceholder="Buscar despachos…"
        emptyMessage="No se encontraron despachos"
        noDataMessage="Aún no hay despachos"
        toolbar={
          <div className="flex gap-2">
            <button
              onClick={openTransportistas}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              <UserPlus size={15} /> Transportistas
            </button>
            <button
              onClick={openCreate}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <Plus size={15} /> Nuevo despacho
            </button>
          </div>
        }
      />

      {/* Modal de crear despacho */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="lg"
        title="Nuevo despacho"
        description="Crea un despacho desde una solicitud confirmada o completada."
        icon={<Truck size={18} />}
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cancelar
            </button>
            <FormSubmitButton loading={createSaving} onClick={saveCreate}>
              Crear despacho
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Solicitud</span>
            <select
              value={createForm.solicitud_id}
              onChange={(e) => setCreateForm({ ...createForm, solicitud_id: e.target.value })}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="">Seleccionar…</option>
              {solicitudes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id_short} · {s.full_name || 'Cliente'} · ${Number(s.total_usd).toFixed(2)} · {ESTADO_LABELS[s.status]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Almacén de origen</span>
              <select
                value={createForm.almacen_origen}
                onChange={(e) => setCreateForm({ ...createForm, almacen_origen: e.target.value })}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="">Seleccionar…</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Transportista</span>
              <SearchableSelect
                value={createForm.transportista_id}
                onChange={(v) => setCreateForm({ ...createForm, transportista_id: v })}
                options={[
                  { value: '', label: 'Sin asignar' },
                  ...transportistas.filter((t) => t.activo).map((t) => ({
                    value: t.id,
                    label: t.nombre,
                    sublabel: t.placa ? `${t.vehiculo ?? 'Vehículo'} · ${t.placa}` : (t.vehiculo ?? undefined),
                  })),
                ]}
                placeholder="Buscar transportista…"
                searchPlaceholder="Escribe para buscar…"
              />
            </label>
          </div>
          <FormInput label="Ruta" value={createForm.ruta} onChange={(e) => setCreateForm({ ...createForm, ruta: e.target.value })} placeholder="Ej: Este - Catia" />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput label="Fecha programada" type="date" value={createForm.fecha_programada} onChange={(e) => setCreateForm({ ...createForm, fecha_programada: e.target.value })} />
            <FormInput label="Notas" value={createForm.notas} onChange={(e) => setCreateForm({ ...createForm, notas: e.target.value })} placeholder="Instrucciones…" />
          </div>
        </div>
      </Modal>

      {/* Modal de asignar transportista */}
      <Modal
        open={asignarOpen}
        onClose={() => setAsignarOpen(false)}
        size="sm"
        title="Asignar transportista"
        description={`Despacho ${asignarDespacho?.solicitud_id_short ?? ''}`}
        icon={<UserPlus size={18} />}
        footer={
          <>
            <button onClick={() => setAsignarOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cancelar
            </button>
            <FormSubmitButton loading={asignarSaving} onClick={saveAsignar}>
              Asignar
            </FormSubmitButton>
          </>
        }
      >
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Transportista</span>
          <SearchableSelect
            value={asignarTransportistaId}
            onChange={setAsignarTransportistaId}
            options={[
              { value: '', label: 'Sin asignar' },
              ...transportistas.filter((t) => t.activo).map((t) => ({
                value: t.id,
                label: t.nombre,
                sublabel: t.placa ? `${t.vehiculo ?? 'Vehículo'} · ${t.placa}` : (t.vehiculo ?? undefined),
              })),
            ]}
            placeholder="Buscar transportista…"
            searchPlaceholder="Escribe para buscar…"
          />
        </label>
      </Modal>

      {/* Modal de avanzar estado */}
      <Modal
        open={avanzarOpen}
        onClose={() => setAvanzarOpen(false)}
        size="sm"
        title="Avanzar estado"
        description={`Despacho ${avanzarDespacho?.solicitud_id_short ?? ''}`}
        icon={<ArrowRight size={18} />}
        footer={
          <>
            <button onClick={() => setAvanzarOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cancelar
            </button>
            <FormSubmitButton loading={avanzarSaving} onClick={saveAvanzar}>
              Actualizar
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Nuevo estado</span>
            <select
              value={avanzarForm.estado}
              onChange={(e) => setAvanzarForm({ ...avanzarForm, estado: e.target.value as Despacho['estado'] })}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="en_ruta">En ruta</option>
              <option value="entregado">Entregado</option>
              <option value="fallido">Fallido</option>
            </select>
          </label>
          <FormInput label="Ubicación" value={avanzarForm.ubicacion} onChange={(e) => setAvanzarForm({ ...avanzarForm, ubicacion: e.target.value })} placeholder="Ej: Salió de Catia" />
          <FormInput label="Observaciones" value={avanzarForm.observaciones} onChange={(e) => setAvanzarForm({ ...avanzarForm, observaciones: e.target.value })} placeholder="Notas del envío…" />
          {avanzarForm.estado === 'entregado' && (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600">
              Al marcar «Entregado» la solicitud se completará automáticamente y se descontará el stock.
            </p>
          )}
        </div>
      </Modal>

      {/* Modal de historial */}
      <Modal
        open={historialOpen}
        onClose={() => setHistorialOpen(false)}
        size="lg"
        title="Historial del despacho"
        description="Cambios de estado en tiempo real."
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
          <p className="py-6 text-center text-sm text-muted-foreground">Sin registros de historial.</p>
        ) : (
          <div className="space-y-3">
            {historial.map((h) => (
              <div key={h.id} className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent/20 text-accent-foreground">
                  <ArrowRight size={12} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {h.estado_anterior ? ESTADO_META[h.estado_anterior as Despacho['estado']]?.label ?? h.estado_anterior : 'Inicio'} → {ESTADO_META[h.estado_nuevo as Despacho['estado']]?.label ?? h.estado_nuevo}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString('es-VE')}
                    {h.ubicacion ? ` · ${h.ubicacion}` : ''}
                    {h.observaciones ? ` · ${h.observaciones}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal de transportistas */}
      <Modal
        open={transpOpen}
        onClose={() => setTranspOpen(false)}
        size="lg"
        title="Transportistas"
        description="Gestiona los transportistas del sistema."
        icon={<UserPlus size={18} />}
        footer={
          <>
            <button onClick={() => setTranspOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cerrar
            </button>
            <FormSubmitButton loading={transpSaving} onClick={saveTransportista}>
              Agregar transportista
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput label="Nombre" value={transpForm.nombre} onChange={(e) => setTranspForm({ ...transpForm, nombre: e.target.value })} placeholder="Ej: Juan Pérez" />
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Tipo</span>
              <select
                value={transpForm.tipo}
                onChange={(e) => setTranspForm({ ...transpForm, tipo: e.target.value as 'interno' | 'externo' })}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="interno">Interno</option>
                <option value="externo">Externo</option>
              </select>
            </label>
            <FormInput label="Teléfono" value={transpForm.telefono} onChange={(e) => setTranspForm({ ...transpForm, telefono: e.target.value })} placeholder="0412-0000000" />
            <FormInput label="Vehículo" value={transpForm.vehiculo} onChange={(e) => setTranspForm({ ...transpForm, vehiculo: e.target.value })} placeholder="Ej: Camión 350" />
            <FormInput label="Placa" value={transpForm.placa} onChange={(e) => setTranspForm({ ...transpForm, placa: e.target.value })} placeholder="Ej: AB123CD" />
          </div>

          <div className="grid gap-2">
            {transportistas.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{t.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.tipo === 'interno' ? 'Interno' : 'Externo'}
                    {t.vehiculo ? ` · ${t.vehiculo}` : ''}
                    {t.placa ? ` · ${t.placa}` : ''}
                    {t.telefono ? ` · ${t.telefono}` : ''}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${t.activo ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                  {t.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            ))}
            {transportistas.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay transportistas.</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}