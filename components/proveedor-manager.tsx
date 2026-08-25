'use client'

import { useCallback, useState } from 'react'
import { BadgeCheck, BadgeX, Building2, Mail, MapPin, Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton, FormTextarea } from '@/components/ui/form-field'
import { confirmDelete } from '@/components/confirm-dialog'

type Proveedor = {
  id: string
  rif: string | null
  nombre: string
  direccion: string | null
  contacto_nombre: string | null
  telefono: string | null
  email: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

/** Estado interno del formulario del modal. */
type ProveedorForm = {
  id?: string
  rif: string
  nombre: string
  direccion: string
  contacto_nombre: string
  telefono: string
  email: string
  activo: boolean
}

const EMPTY_FORM: ProveedorForm = {
  rif: '',
  nombre: '',
  direccion: '',
  contacto_nombre: '',
  telefono: '',
  email: '',
  activo: true,
}

/**
 * Gestor de proveedores (CRUD + activar/desactivar).
 * Solo el nombre es obligatorio; el RIF y demás campos se completan después.
 * Utiliza componentes UI reutilizables: Modal premium y DataTable con
 * búsqueda, ordenamiento y paginación.
 * La lógica de datos se delega en la API /api/admin/proveedores; la UI es
 * independiente de Supabase.
 */
export function ProveedorManager({ initialProveedores }: { initialProveedores: Proveedor[] }) {
  const [proveedores, setProveedores] = useState(initialProveedores)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ProveedorForm>(EMPTY_FORM)
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
      const response = await fetch('/api/admin/proveedores', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudo refrescar la lista')
      const result = await response.json()
      setProveedores(result.proveedores ?? [])
    } catch {
      toast.error('Error al refrescar la tabla', { description: 'Los cambios podrían no reflejarse hasta recargar.' })
    } finally {
      setRefreshing(false)
    }
  }, [])

  /** Abre el modal para crear un proveedor nuevo. */
  function openCreate() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  /** Abre el modal para editar un proveedor existente. */
  function openEdit(proveedor: Proveedor) {
    setForm({
      id: proveedor.id,
      rif: proveedor.rif ?? '',
      nombre: proveedor.nombre,
      direccion: proveedor.direccion ?? '',
      contacto_nombre: proveedor.contacto_nombre ?? '',
      telefono: proveedor.telefono ?? '',
      email: proveedor.email ?? '',
      activo: proveedor.activo,
    })
    setModalOpen(true)
  }

  /** Valida el formulario y devuelve el error en pantalla si algo falta.
   *  Solo el nombre es obligatorio; el RIF es opcional. */
  function validate(): string | null {
    if (!form.nombre.trim()) return 'El nombre del proveedor es obligatorio.'
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'El email no es válido.'
    return null
  }

  /** Guarda un proveedor nuevo o editado. */
  async function save() {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }

    setSaving(true)
    const response = await fetch('/api/admin/proveedores', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo guardar el proveedor')
      return
    }

    setModalOpen(false)
    refresh()
    toast.success(form.id ? 'Proveedor actualizado' : 'Proveedor creado')
  }

  /** Alterna el estado activo/inactivo de un proveedor. */
  async function toggleActivo(proveedor: Proveedor) {
    setUpdatingId(proveedor.id)
    const response = await fetch('/api/admin/proveedores', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: proveedor.id,
        rif: proveedor.rif ?? '',
        nombre: proveedor.nombre,
        direccion: proveedor.direccion,
        contacto_nombre: proveedor.contacto_nombre,
        telefono: proveedor.telefono,
        email: proveedor.email,
        activo: !proveedor.activo,
      }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo cambiar el estado')
      setUpdatingId(null)
      return
    }

    setUpdatingId(null)
    refresh()
    toast.success(proveedor.activo ? 'Proveedor desactivado' : 'Proveedor activado')
  }

  /** Elimina un proveedor. */
  async function remove(id: string) {
    const ok = await confirmDelete({
      title: '¿Eliminar este proveedor?',
      description: 'Los productos asociados quedarán sin proveedor.',
      confirmText: 'Sí, eliminar proveedor',
    })
    if (!ok) return

    setDeletingId(id)
    const response = await fetch(`/api/admin/proveedores?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (!response.ok) {
      toast.error('No se pudo eliminar')
      return
    }

    refresh()
    toast.success('Proveedor eliminado')
  }

  /** Columnas de la tabla de proveedores. */
  const columns: TableColumn<Proveedor>[] = [
    {
      key: 'proveedor',
      header: 'Proveedor',
      sortable: true,
      sortValue: (p) => p.nombre,
      render: (proveedor) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <Building2 size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{proveedor.nombre}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {proveedor.rif ? `RIF ${proveedor.rif}` : 'Sin RIF'}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'contacto',
      header: 'Contacto',
      hiddenMobile: true,
      render: (proveedor) => (
        <div className="max-w-xs space-y-1 text-sm text-muted-foreground">
          {proveedor.contacto_nombre && (
            <p className="flex items-center gap-1.5 truncate"><UserRound size={13} className="shrink-0" /> {proveedor.contacto_nombre}</p>
          )}
          {proveedor.email && (
            <p className="flex items-center gap-1.5 truncate"><Mail size={13} className="shrink-0" /> {proveedor.email}</p>
          )}
          {proveedor.telefono && (
            <p className="flex items-center gap-1.5"><Phone size={13} className="shrink-0" /> {proveedor.telefono}</p>
          )}
        </div>
      ),
    },
    {
      key: 'direccion',
      header: 'Dirección',
      hiddenMobile: true,
      render: (proveedor) => (
        <p className="flex max-w-xs items-start gap-1.5 truncate text-muted-foreground">
          <MapPin size={13} className="mt-0.5 shrink-0" />
          {proveedor.direccion || 'No indicada'}
        </p>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      sortable: true,
      sortValue: (p) => (p.activo ? 'Activo' : 'Inactivo'),
      render: (proveedor) => (
        <button
          onClick={() => toggleActivo(proveedor)}
          disabled={updatingId === proveedor.id}
          aria-label={proveedor.activo ? `Desactivar ${proveedor.nombre}` : `Activar ${proveedor.nombre}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            proveedor.activo ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25' : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
        >
          {updatingId === proveedor.id ? (
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : proveedor.activo ? (
            <BadgeCheck size={13} />
          ) : (
            <BadgeX size={13} />
          )}
          {proveedor.activo ? 'Activo' : 'Inactivo'}
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-20',
      cellClassName: 'text-right',
      render: (proveedor) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openEdit(proveedor)}
            aria-label={`Editar ${proveedor.nombre}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => remove(proveedor.id)}
            disabled={deletingId === proveedor.id}
            aria-label={`Eliminar ${proveedor.nombre}`}
            className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {deletingId === proveedor.id ? (
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
        data={proveedores}
        columns={columns}
        rowKey={(p) => p.id}
        searchKeys={(p) =>
          `${p.nombre} ${p.rif ?? ''} ${p.contacto_nombre ?? ''} ${p.email ?? ''} ${p.telefono ?? ''} ${p.direccion ?? ''} ${p.activo ? 'activo' : 'inactivo'}`
        }
        searchPlaceholder="Buscar por nombre, RIF, contacto o dirección…"
        emptyMessage="No se encontraron proveedores"
        noDataMessage="Aún no hay proveedores"
        loading={refreshing}
        toolbar={
          <button
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={15} /> Nuevo proveedor
          </button>
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title={form.id ? 'Editar proveedor' : 'Nuevo proveedor'}
        description={form.id ? 'Actualiza la información del proveedor.' : 'Crea un nuevo proveedor para tus productos.'}
        icon={<Building2 size={18} />}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={save}>
              {form.id ? 'Guardar cambios' : 'Crear proveedor'}
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput
              label="Nombre"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Ej: Distribuidora Eléctrica C.A."
              autoFocus
              required
            />
            <FormInput
              label="RIF"
              value={form.rif}
              onChange={(e) => setForm({ ...form, rif: e.target.value })}
              placeholder="Ej: J-12345678-9 (opcional)"
              hint="Puedes dejarlo vacío y completarlo después."
            />
          </div>

          <FormTextarea
            label="Dirección"
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            placeholder="Dirección fiscal del proveedor…"
            className="min-h-20"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput
              label="Persona de contacto"
              value={form.contacto_nombre}
              onChange={(e) => setForm({ ...form, contacto_nombre: e.target.value })}
              placeholder="Ej: Juan Pérez"
            />
            <FormInput
              label="Teléfono"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              placeholder="Ej: 0412-1234567"
            />
          </div>

          <FormInput
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="contacto@proveedor.com"
          />

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
            <div>
              <p className="text-sm font-medium">Activo</p>
              <p className="text-xs text-muted-foreground">Solo los proveedores activos aparecen en los selects de productos.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.activo}
              aria-label="Activar proveedor"
              onClick={() => setForm({ ...form, activo: !form.activo })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.activo ? 'bg-emerald-500' : 'bg-muted'}`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${form.activo ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
          </label>
        </div>
      </Modal>
    </div>
  )
}