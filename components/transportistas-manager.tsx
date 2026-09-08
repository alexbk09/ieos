'use client'

import { useCallback, useState } from 'react'
import { Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { confirmDelete } from '@/components/confirm-dialog'

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

/**
 * Gestor de transportistas (módulo independiente).
 * Permite listar, buscar, crear, editar y eliminar transportistas.
 * La lógica de datos se delega en la API /api/admin/transportistas.
 */
export function TransportistasManager({ initialTransportistas }: { initialTransportistas: Transportista[] }) {
  const [transportistas, setTransportistas] = useState(initialTransportistas)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transportista | null>(null)
  const [form, setForm] = useState({ nombre: '', tipo: 'externo' as 'interno' | 'externo', telefono: '', vehiculo: '', placa: '', activo: true })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  /** Refresca la lista desde el servidor. */
  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/transportistas', { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json()
    setTransportistas(result.transportistas ?? [])
  }, [])

  /** Abre el modal de creación. */
  function openCreate() {
    setEditing(null)
    setForm({ nombre: '', tipo: 'externo', telefono: '', vehiculo: '', placa: '', activo: true })
    setModalOpen(true)
  }

  /** Abre el modal de edición con los datos del transportista. */
  function openEdit(t: Transportista) {
    setEditing(t)
    setForm({
      nombre: t.nombre,
      tipo: t.tipo,
      telefono: t.telefono ?? '',
      vehiculo: t.vehiculo ?? '',
      placa: t.placa ?? '',
      activo: t.activo,
    })
    setModalOpen(true)
  }

  /** Guarda la creación/edición. */
  async function save() {
    if (!form.nombre.trim()) {
      toast.error('Completa el nombre del transportista')
      return
    }

    setSaving(true)
    const response = await fetch('/api/admin/transportistas', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
    })
    setSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo guardar el transportista')
      return
    }

    setModalOpen(false)
    refresh()
    toast.success(editing ? 'Transportista actualizado' : 'Transportista creado')
  }

  /** Elimina un transportista. */
  async function remove(id: string) {
    const ok = await confirmDelete({
      title: '¿Eliminar este transportista?',
      description: 'Los despachos asociados quedarán sin transportista asignado.',
      confirmText: 'Sí, eliminar',
    })
    if (!ok) return

    setDeletingId(id)
    const response = await fetch(`/api/admin/transportistas?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo eliminar')
      return
    }

    refresh()
    toast.success('Transportista eliminado')
  }

  const columns: TableColumn<Transportista>[] = [
    {
      key: 'nombre',
      header: 'Transportista',
      sortable: true,
      sortValue: (t) => t.nombre,
      render: (t) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <Truck size={16} />
          </div>
          <div>
            <p className="font-medium">{t.nombre}</p>
            <p className="text-xs text-muted-foreground">{t.tipo === 'interno' ? 'Interno' : 'Externo'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'vehiculo',
      header: 'Vehículo',
      hiddenMobile: true,
      render: (t) => <span className="text-sm text-muted-foreground">{t.vehiculo || '—'}</span>,
    },
    {
      key: 'placa',
      header: 'Placa',
      hiddenMobile: true,
      render: (t) => <span className="font-mono text-xs text-muted-foreground">{t.placa || '—'}</span>,
    },
    {
      key: 'telefono',
      header: 'Teléfono',
      hiddenMobile: true,
      render: (t) => <span className="text-sm text-muted-foreground">{t.telefono || '—'}</span>,
    },
    {
      key: 'activo',
      header: 'Estado',
      hiddenMobile: true,
      render: (t) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${t.activo ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
          {t.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-24',
      cellClassName: 'text-right',
      render: (t) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openEdit(t)}
            aria-label={`Editar ${t.nombre}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => remove(t.id)}
            disabled={deletingId === t.id}
            aria-label={`Eliminar ${t.nombre}`}
            className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-30"
          >
            {deletingId === t.id ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Trash2 size={14} />}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <DataTable
        data={transportistas}
        columns={columns}
        rowKey={(t) => t.id}
        searchKeys={(t) => `${t.nombre} ${t.vehiculo ?? ''} ${t.placa ?? ''} ${t.telefono ?? ''}`}
        searchPlaceholder="Buscar transportistas…"
        emptyMessage="No se encontraron transportistas"
        noDataMessage="Aún no hay transportistas"
        toolbar={
          <button
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={15} /> Nuevo transportista
          </button>
        }
      />

      {/* Modal de crear/editar */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title={editing ? 'Editar transportista' : 'Nuevo transportista'}
        description={editing ? 'Actualiza la información del transportista.' : 'Registra un transportista interno o externo.'}
        icon={<Truck size={18} />}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={save}>
              {editing ? 'Guardar cambios' : 'Crear transportista'}
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Juan Pérez" autoFocus />
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Tipo</span>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as 'interno' | 'externo' })}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="interno">Interno</option>
              <option value="externo">Externo</option>
            </select>
          </label>
          <FormInput label="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="0412-0000000" />
          <FormInput label="Vehículo" value={form.vehiculo} onChange={(e) => setForm({ ...form, vehiculo: e.target.value })} placeholder="Ej: Camión 350" />
          <FormInput label="Placa" value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} placeholder="Ej: AB123CD" />
        </div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            className="size-4 accent-primary"
          />
          <span className="font-medium">Activo</span>
        </label>
      </Modal>
    </div>
  )
}