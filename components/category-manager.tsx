'use client'

import { useCallback, useState } from 'react'
import { BadgeCheck, BadgeX, FolderKanban, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton, FormTextarea } from '@/components/ui/form-field'

type Category = {
  id: string
  name: string
  slug: string
  description: string | null
  activa: boolean
  created_at: string
  updated_at: string
}

/** Estado del formulario del modal. */
type CategoryForm = {
  id?: string
  name: string
  slug: string
  description: string
  activa: boolean
}

/**
 * Gestor de categorías (CRUD + activar/desactivar).
 * Utiliza componentes UI reutilizables: Modal premium y DataTable con filtros.
 * Solo las categorías activas aparecen en los filtros del catálogo.
 * La lógica de datos se delega en las API routes; la UI es independiente de Supabase.
 */
export function CategoryManager({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState(initialCategories)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<CategoryForm>({ name: '', slug: '', description: '', activa: true })
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
      const response = await fetch('/api/admin/categories', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudo refrescar la lista')
      const result = await response.json()
      setCategories(result.categories ?? [])
    } catch {
      toast.error('Error al refrescar la tabla', { description: 'Los cambios podrían no reflejarse hasta recargar.' })
    } finally {
      setRefreshing(false)
    }
  }, [])

  /** Abre el modal para crear una categoría nueva. */
  function openCreate() {
    setForm({ name: '', slug: '', description: '', activa: true })
    setModalOpen(true)
  }

  /** Abre el modal para editar una categoría existente. */
  function openEdit(category: Category) {
    setForm({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      activa: category.activa,
    })
    setModalOpen(true)
  }

  /** Valida el formulario y devuelve el error si falta nombre o slug. */
  function validate(): string | null {
    if (!form.name.trim()) return 'El nombre de la categoría es obligatorio.'
    if (!form.slug.trim()) return 'El slug de la categoría es obligatorio.'
    return null
  }

  /** Guarda una categoría nueva o editada. */
  async function save() {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }

    setSaving(true)
    const response = await fetch('/api/admin/categories', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo guardar la categoría')
      return
    }

    setModalOpen(false)
    refresh()
    toast.success(form.id ? 'Categoría actualizada' : 'Categoría creada')
  }

  /** Alterna el estado activo/inactivo de una categoría. */
  async function toggleActiva(category: Category) {
    setUpdatingId(category.id)
    const response = await fetch('/api/admin/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        activa: !category.activa,
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
    toast.success(category.activa ? 'Categoría desactivada' : 'Categoría activada')
  }

  /** Elimina una categoría. */
  async function remove(id: string) {
    if (!confirm('¿Eliminar esta categoría?')) return

    setDeletingId(id)
    const response = await fetch(`/api/admin/categories?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (!response.ok) {
      toast.error('No se pudo eliminar')
      return
    }

    refresh()
    toast.success('Categoría eliminada')
  }

  /** Columnas de la tabla de categorías. */
  const columns: TableColumn<Category>[] = [
    {
      key: 'name',
      header: 'Categoría',
      sortable: true,
      sortValue: (c) => c.name,
      render: (category) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <FolderKanban size={16} />
          </div>
          <div>
            <p className="font-medium">{category.name}</p>
            <p className="font-mono text-xs text-muted-foreground">/{category.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'description',
      header: 'Descripción',
      hiddenMobile: true,
      render: (category) => (
        <p className="max-w-md truncate text-muted-foreground">{category.description || 'Sin descripción'}</p>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      sortable: true,
      sortValue: (c) => (c.activa ? 'Activa' : 'Inactiva'),
      render: (category) => (
        <button
          onClick={() => toggleActiva(category)}
          disabled={updatingId === category.id}
          aria-label={category.activa ? `Desactivar ${category.name}` : `Activar ${category.name}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
            category.activa ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25' : 'bg-muted text-muted-foreground hover:bg-muted/70'
          }`}
        >
          {updatingId === category.id ? (
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : category.activa ? (
            <BadgeCheck size={13} />
          ) : (
            <BadgeX size={13} />
          )}
          {category.activa ? 'Activa' : 'Inactiva'}
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-24',
      cellClassName: 'text-right',
      render: (category) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openEdit(category)}
            aria-label={`Editar ${category.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => remove(category.id)}
            disabled={deletingId === category.id}
            aria-label={`Eliminar ${category.name}`}
            className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {deletingId === category.id ? (
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
        data={categories}
        columns={columns}
        rowKey={(c) => c.id}
        searchKeys={(c) => `${c.name} ${c.slug} ${c.description ?? ''} ${c.activa ? 'activa' : 'inactiva'}`}
        searchPlaceholder="Buscar categorías…"
        emptyMessage="No se encontraron categorías"
        noDataMessage="Aún no hay categorías"
        loading={refreshing}
        toolbar={
          <button
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={15} /> Nueva categoría
          </button>
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? 'Editar categoría' : 'Nueva categoría'}
        description={form.id ? 'Actualiza la información de la categoría.' : 'Crea una nueva categoría para tus productos.'}
        icon={<FolderKanban size={18} />}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={save}>
              {form.id ? 'Guardar cambios' : 'Crear categoría'}
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <FormInput
            label="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ej: Iluminación LED"
            autoFocus
          />
          <FormInput
            label="Slug"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="Ej: iluminacion-led"
            hint="Usado en la URL del catálogo."
          />
          <FormTextarea
            label="Descripción"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Describe brevemente esta categoría…"
          />

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
            <div>
              <p className="text-sm font-medium">Activa</p>
              <p className="text-xs text-muted-foreground">Solo las categorías activas aparecen en los filtros del catálogo.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.activa}
              aria-label="Activar categoría"
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