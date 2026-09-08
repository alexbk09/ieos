'use client'

import { useCallback, useState } from 'react'
import { Calculator, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { confirmDelete } from '@/components/confirm-dialog'
import { calcularTarifaEnvio } from '@/lib/shipping-calculator'

type RangoPeso = { id: string; zona_id: string; peso_min_kg: number; peso_max_kg: number; tarifa_usd: number }
type ZonaEnvio = {
  id: string
  nombre: string
  descripcion: string | null
  estados: string[]
  ciudades: string[]
  tarifa_flat_usd: number
  tarifa_por_kg_usd: number
  tiempo_estimado: string | null
  activo: boolean
  created_at: string
  rangos?: RangoPeso[]
}

/** Rango temporal en el formulario (sin id). */
type RangoTemp = { peso_min_kg: string; peso_max_kg: string; tarifa_usd: string }

/** Estado del formulario de zona. */
type ZonaForm = {
  id?: string
  nombre: string
  descripcion: string
  estados: string
  ciudades: string
  tarifa_flat_usd: string
  tarifa_por_kg_usd: string
  tiempo_estimado: string
  activo: boolean
  rangos: RangoTemp[]
}

/** Formulario vacío. */
const EMPTY_FORM: ZonaForm = {
  nombre: '',
  descripcion: '',
  estados: '',
  ciudades: '',
  tarifa_flat_usd: '0',
  tarifa_por_kg_usd: '2',
  tiempo_estimado: '',
  activo: true,
  rangos: [],
}

/**
 * Gestor de zonas de envío (CRUD + rangos de peso + vista previa).
 * Permite crear/editar/eliminar zonas y simular el costo de envío
 * según el peso del pedido usando la calculadora pura del sistema.
 */
export function ZonasEnvioManager({ initialZonas }: { initialZonas: ZonaEnvio[] }) {
  const [zonas, setZonas] = useState(initialZonas)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ZonaForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Vista previa de cálculo
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewZona, setPreviewZona] = useState<ZonaEnvio | null>(null)
  const [previewPeso, setPreviewPeso] = useState('5')

  /** Refresca las zonas desde el servidor. */
  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/envios', { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json()
    setZonas(result.zonas ?? [])
  }, [])

  /** Abre el modal de creación. */
  function openCreate() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  /** Abre el modal de edición con los datos de la zona. */
  function openEdit(zona: ZonaEnvio) {
    setForm({
      id: zona.id,
      nombre: zona.nombre,
      descripcion: zona.descripcion ?? '',
      estados: (zona.estados ?? []).join(', '),
      ciudades: (zona.ciudades ?? []).join(', '),
      tarifa_flat_usd: String(zona.tarifa_flat_usd),
      tarifa_por_kg_usd: String(zona.tarifa_por_kg_usd),
      tiempo_estimado: zona.tiempo_estimado ?? '',
      activo: zona.activo,
      rangos: (zona.rangos ?? []).map((r) => ({
        peso_min_kg: String(r.peso_min_kg),
        peso_max_kg: String(r.peso_max_kg),
        tarifa_usd: String(r.tarifa_usd),
      })),
    })
    setModalOpen(true)
  }

  /** Agrega una fila de rango vacía. */
  function addRango() {
    setForm({ ...form, rangos: [...form.rangos, { peso_min_kg: '', peso_max_kg: '', tarifa_usd: '' }] })
  }

  /** Actualiza un rango del formulario. */
  function setRango(index: number, patch: Partial<RangoTemp>) {
    setForm({
      ...form,
      rangos: form.rangos.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    })
  }

  /** Valida y envía la creación/edición de la zona. */
  async function save() {
    if (!form.nombre.trim()) {
      toast.error('Completa el nombre de la zona')
      return
    }

    const rangos = form.rangos
      .filter((r) => r.peso_min_kg && r.peso_max_kg && r.tarifa_usd)
      .map((r) => ({
        peso_min_kg: Number(r.peso_min_kg),
        peso_max_kg: Number(r.peso_max_kg),
        tarifa_usd: Number(r.tarifa_usd),
      }))

    setSaving(true)
    const response = await fetch('/api/admin/envios', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(form.id ? { id: form.id } : {}),
        nombre: form.nombre,
        descripcion: form.descripcion,
        estados: form.estados.split(',').map((s) => s.trim()).filter(Boolean),
        ciudades: form.ciudades.split(',').map((s) => s.trim()).filter(Boolean),
        tarifa_flat_usd: Number(form.tarifa_flat_usd) || 0,
        tarifa_por_kg_usd: Number(form.tarifa_por_kg_usd) || 0,
        tiempo_estimado: form.tiempo_estimado,
        activo: form.activo,
        rangos,
      }),
    })
    setSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo guardar la zona')
      return
    }

    setModalOpen(false)
    refresh()
    toast.success(form.id ? 'Zona actualizada' : 'Zona creada')
  }

  /** Elimina una zona. */
  async function remove(id: string) {
    const ok = await confirmDelete({
      title: '¿Eliminar esta zona?',
      description: 'Los rangos de peso asociados también se eliminarán.',
      confirmText: 'Sí, eliminar zona',
    })
    if (!ok) return

    setDeletingId(id)
    const response = await fetch(`/api/admin/envios?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo eliminar')
      return
    }

    refresh()
    toast.success('Zona eliminada')
  }

  /** Abre la vista previa de cálculo para una zona. */
  function openPreview(zona: ZonaEnvio) {
    setPreviewZona(zona)
    setPreviewPeso('5')
    setPreviewOpen(true)
  }

  /** Calcula la tarifa con la calculadora pura. */
  const previewResult = previewZona
    ? calcularTarifaEnvio(Number(previewPeso) || 0, 0, {
        tarifa_flat_usd: previewZona.tarifa_flat_usd,
        tarifa_por_kg_usd: previewZona.tarifa_por_kg_usd,
        rangos: previewZona.rangos ?? [],
      })
    : null

  const columns: TableColumn<ZonaEnvio>[] = [
    {
      key: 'zona',
      header: 'Zona',
      sortable: true,
      sortValue: (z) => z.nombre,
      render: (z) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <MapPin size={16} />
          </div>
          <div>
            <p className="font-medium">{z.nombre}</p>
            <p className="max-w-xs truncate text-xs text-muted-foreground">{z.descripcion || 'Sin descripción'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'destinos',
      header: 'Destinos',
      hiddenMobile: true,
      render: (z) => (
        <span className="text-xs text-muted-foreground">
          {[z.estados.join(', '), z.ciudades.join(', ')].filter(Boolean).join(' · ') || 'Toda la zona'}
        </span>
      ),
    },
    {
      key: 'tarifa',
      header: 'Tarifa',
      hiddenMobile: true,
      render: (z) => (
        <span className="text-sm">
          ${Number(z.tarifa_flat_usd).toFixed(2)} + ${Number(z.tarifa_por_kg_usd).toFixed(2)}/kg
        </span>
      ),
    },
    {
      key: 'tiempo',
      header: 'Tiempo',
      hiddenMobile: true,
      render: (z) => <span className="text-xs text-muted-foreground">{z.tiempo_estimado || '—'}</span>,
    },
    {
      key: 'activo',
      header: 'Estado',
      hiddenMobile: true,
      render: (z) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${z.activo ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
          {z.activo ? 'Activa' : 'Inactiva'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-36',
      cellClassName: 'text-right',
      render: (z) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openPreview(z)}
            aria-label={`Calcular envío de ${z.nombre}`}
            title="Probar cálculo"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Calculator size={14} />
          </button>
          <button onClick={() => openEdit(z)} aria-label={`Editar ${z.nombre}`} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Pencil size={14} />
          </button>
          <button
            onClick={() => remove(z.id)}
            disabled={deletingId === z.id}
            aria-label={`Eliminar ${z.nombre}`}
            className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-30"
          >
            {deletingId === z.id ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Trash2 size={14} />}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <DataTable
        data={zonas}
        columns={columns}
        rowKey={(z) => z.id}
        searchKeys={(z) => `${z.nombre} ${z.descripcion ?? ''} ${z.estados.join(' ')} ${z.ciudades.join(' ')}`}
        searchPlaceholder="Buscar zonas…"
        emptyMessage="No se encontraron zonas"
        noDataMessage="Aún no hay zonas de envío"
        toolbar={
          <button
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={15} /> Nueva zona
          </button>
        }
      />

      {/* Modal de crear/editar zona */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="xl"
        title={form.id ? 'Editar zona' : 'Nueva zona de envío'}
        description="Configura la tarifa base, el costo por kg y los rangos escalonados."
        icon={<MapPin size={18} />}
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={save}>
              {form.id ? 'Guardar cambios' : 'Crear zona'}
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Nombre de la zona" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Zona A - Caracas" autoFocus />
          <FormInput label="Tiempo estimado" value={form.tiempo_estimado} onChange={(e) => setForm({ ...form, tiempo_estimado: e.target.value })} placeholder="Ej: 1-2 días" />
          <FormInput label="Estados (separados por coma)" value={form.estados} onChange={(e) => setForm({ ...form, estados: e.target.value })} placeholder="Distrito Capital, Miranda" />
          <FormInput label="Ciudades (separadas por coma)" value={form.ciudades} onChange={(e) => setForm({ ...form, ciudades: e.target.value })} placeholder="Caracas, Los Teques" />
          <FormInput label="Tarifa base (USD)" type="number" min={0} step="0.01" value={form.tarifa_flat_usd} onChange={(e) => setForm({ ...form, tarifa_flat_usd: e.target.value })} placeholder="0" />
          <FormInput label="Tarifa por kg (USD)" type="number" min={0} step="0.01" value={form.tarifa_por_kg_usd} onChange={(e) => setForm({ ...form, tarifa_por_kg_usd: e.target.value })} placeholder="2" />
          <FormInput label="Descripción" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Describe la zona…" className="sm:col-span-2" />
        </div>

        <div className="mt-5 grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">Rangos escalonados (opcional)</span>
            <button onClick={addRango} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted">
              <Plus size={13} /> Agregar rango
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:grid">
              <span>Peso mín (kg)</span>
              <span>Peso máx (kg)</span>
              <span>Tarifa (USD)</span>
              <span />
            </div>
            <div className="divide-y divide-border/50">
              {form.rangos.length === 0 && (
                <p className="px-4 py-3 text-xs text-muted-foreground">Sin rangos. Se usará la tarifa base + por kg.</p>
              )}
              {form.rangos.map((rango, index) => (
                <div key={index} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
                  <input type="number" min={0} step="0.01" value={rango.peso_min_kg} onChange={(e) => setRango(index, { peso_min_kg: e.target.value })} placeholder="0" className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
                  <input type="number" min={0} step="0.01" value={rango.peso_max_kg} onChange={(e) => setRango(index, { peso_max_kg: e.target.value })} placeholder="5" className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
                  <input type="number" min={0} step="0.01" value={rango.tarifa_usd} onChange={(e) => setRango(index, { tarifa_usd: e.target.value })} placeholder="5" className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
                  <button
                    onClick={() => setForm({ ...form, rangos: form.rangos.filter((_, i) => i !== index) })}
                    aria-label={`Quitar rango ${index + 1}`}
                    className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal de vista previa de cálculo */}
      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        size="sm"
        title={`Cálculo de envío · ${previewZona?.nombre ?? ''}`}
        description="Simula el costo de envío según el peso del pedido."
        icon={<Calculator size={18} />}
        footer={
          <button onClick={() => setPreviewOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
            Cerrar
          </button>
        }
      >
        <div className="grid gap-4">
          <FormInput label="Peso del pedido (kg)" type="number" min={0} step="0.01" value={previewPeso} onChange={(e) => setPreviewPeso(e.target.value)} placeholder="5" />
          {previewResult && (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm">
              <div className="flex justify-between py-1"><span className="text-muted-foreground">Peso facturable</span><span className="font-mono">{previewResult.pesoFacturableKg} kg</span></div>
              <div className="flex justify-between py-1"><span className="text-muted-foreground">Tarifa base</span><span className="font-mono">${previewResult.tarifaBaseUsd.toFixed(2)}</span></div>
              {previewResult.rangoAplicado ? (
                <div className="flex justify-between py-1"><span className="text-muted-foreground">Rango aplicado</span><span className="font-mono">${previewResult.rangoAplicado.tarifa_usd.toFixed(2)}</span></div>
              ) : (
                <div className="flex justify-between py-1"><span className="text-muted-foreground">Por kg (×{previewResult.pesoFacturableKg})</span><span className="font-mono">${(previewResult.pesoFacturableKg * previewResult.tarifaPorKgUsd).toFixed(2)}</span></div>
              )}
              <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold"><span>Total envío</span><span className="font-mono text-cyan-600">${previewResult.totalUsd.toFixed(2)}</span></div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}