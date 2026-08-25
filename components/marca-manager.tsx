'use client'

import { useCallback, useState } from 'react'
import { BadgeCheck, BadgeX, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { confirmDelete } from '@/components/confirm-dialog'

type Marca = {
  id: string
  nombre: string
  activa: boolean
  created_at: string
  updated_at: string
}

/** Estado interno del formulario del modal. */
type MarcaForm = {
  id?: string
  nombre: string
  activa: boolean
}

/**
 * Gestor de marcas (CRUD + activar/desactivar).
 * Utiliza componentes UI reutilizables: Modal premium y DataTable con
 * búsqueda, ordenamiento y paginación.
 * La lógica de datos se delega en la API /api/admin/marcas; la UI es
 * independiente de Supabase.
 */
export function MarcaManager({ initialMarcas }: { initialMarcas: Marca[] }) {
  const [marcas, setMarcas] = useState(initialMarcas)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<MarcaForm>({ nombre: '', activa: true })
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  /**
   * Refresca la tabla desde el servidor después de cada mutación.
   * Los filtros activos del DataTable (búsqueda, orden, página) se conservan
   * porque la tabla los aplica sobre el nuevo arreglo automáticamente.
   */
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/admin/marcas', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudo refrescar la lista')
      const result = await response.json()
      setMarcas(result.marcas ?? [])
    } catch {
      toast.error('Error al refrescar la tabla', { description: 'Los cambios podrían no reflejarse hasta recargar.' })
    } finally {
      setRefreshing(false)
    }
  }, [])

  /** Abre el modal para crear una marca nueva. */
  function openCreate() {
    setForm({ nombre: '', activa: true })
    setModalOpen(true)
  }

  /** Abre el modal para editar una marca existente. */
  function openEdit(marca: Marca) {
    setForm({ id: marca.id, nombre: marca.nombre, activa: marca.activa })
    setModalOpen(true)
  }

  /** Valida el formulario y muestra el error si falta el nombre. */
  function validate(): string | null {
    if (!form.nombre.trim()) return 'El nombre de la marca es obligatorio.'
    return null
  }

  /** Guarda una marca nueva o editada. */
  async function save() {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }

    setSaving(true)
    const response = await fetch('/api/admin/marcas', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo guardar la marca')
      return
    }

    setModalOpen(false)
    refresh()
    toast.success(form.id ? 'Marca actualizada' : 'Marca creada')
  }

  /** Alterna el estado activo/inactivo de una marca. */
  async function toggleActiva(marca: Marca) {
    setUpdatingId(marca.id)
    const response = await fetch('/api/admin/marcas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: marca.id, nombre: marca.nombre, activa: !marca.activa }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo cambiar el estado')
      setUpdatingId(null)
      return
    }

    setUpdatingId(null)
    refresh()
    toast.success(marca.activa ? 'Marca desactivada' : 'Marca activada')
  }

  /** Elimina una marca. */
  async function remove(id: string) {
    const ok = await confirmDelete({
      title: '¿Eliminar esta marca?',
      description: 'Los productos asociados quedarán sin marca.',
      confirmText: 'Sí, eliminar marca',
    })
    if (!ok) return

    setDeletingId(id)
    const response = await fetch(`/api/admin/marcas?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (!response.ok) {
      toast.error('No se pudo eliminar')
      return
    }

    refresh()
    toast.success('Marca eliminada')
  }

  /** Columnas de la tabla de marcas. */
  const columns: TableColumn<Marca>[] = [
    {
      key: 'nombre',
      header: 'Marca',
      sortable: true,
      sortValue: (m) => m.nombre,
      render: (marca) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <Tag size={16} />
          </div>
          <div>
            <p className="font-medium">{marca.nombre}</p>
            <p className="font-mono text-xs text-muted-foreground">{marca.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      sortable: true,
      sortValue: (m) => (m.activa ? 'Activa' : 'Inactiva'),
      render: (marca) => (
        <button
          onClick={() => toggleActiva(marca)}
          disabled={updatingId === marca.id}
          aria-label={marca.activa ? `Desactivar ${marca.nombre}` : `Activar ${marca.nombre}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            marca.activa ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25' : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
        >
          {updatingId === marca.id ? (
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : marca.activa ? (
            <BadgeCheck size={13} />
          ) : (
            <BadgeX size={13} />
          )}
          {marca.activa ? 'Activa' : 'Inactiva'}
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-20',
      cellClassName: 'text-right',
      render: (marca) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openEdit(marca)}
            aria-label={`Editar ${marca.nombre}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => remove(marca.id)}
            disabled={deletingId === marca.id}
            aria-label={`Eliminar ${marca.nombre}`}
            className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {deletingId === marca.id ? (
              <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <DataTable
        data={marcas}
        columns={columns}
        rowKey={(m) => m.id}
        searchKeys={(m) => `${m.nombre} ${m.activa ? 'activa' : 'inactiva'}`}
        searchPlaceholder="Buscar marcas…"
        emptyMessage="No se encontraron marcas"
        noDataMessage="Aún no hay marcas"
        loading={refreshing}
        toolbar={
          <button
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={15} /> Nueva marca
          </button>
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Editar marca' : 'Nueva marca'}
        description={form.id ? 'Actualiza la información de la marca.' : 'Crea una nueva marca para tus productos.'}
        icon={<Tag size={18} />}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={save}>
              {form.id ? 'Guardar cambios' : 'Crear marca'}
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <FormInput
            label="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Ej: Philips, Osram, Sylvania…"
            autoFocus
          />

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
            <div>
              <p className="text-sm font-medium">Activa</p>
              <p className="text-xs text-muted-foreground">Solo las marcas activas aparecen en el catálogo.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.activa}
              aria-label="Activar marca"
              onClick={() => setForm({ ...form, activa: !form.activa })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.activa ? 'bg-emerald-500' : 'bg-muted'}`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${form.activa ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
          </label>
        </div>
      </Modal>
    </div>
  )
}