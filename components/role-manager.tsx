'use client'

import { useCallback, useState } from 'react'
import { Eye, Pencil, Plus, Shield, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton, FormTextarea } from '@/components/ui/form-field'
import { confirmDelete } from '@/components/confirm-dialog'

type Module = { id: string; name: string; slug: string; description: string | null }

export type RolePermission = {
  role_id: string
  module_id: string
  can_read: boolean
  can_write: boolean
  can_delete: boolean
}

type Role = {
  id: string
  name: string
  description: string | null
  created_at: string
  permissions: RolePermission[]
}

/** Permisos seleccionados por módulo en el formulario. */
type PermissionState = Record<string, { can_read: boolean; can_write: boolean; can_delete: boolean }>

/** Estado interno del formulario del rol. */
type RoleForm = {
  id?: string
  name: string
  description: string
  permissions: PermissionState
}

/**
 * Gestor de roles y permisos (CRUD + matriz de permisos por módulo).
 * Permite crear, editar y eliminar roles, y asignar a cada módulo
 * los permisos de ver (read), crear/editar (write) y eliminar (delete).
 * La lógica de datos se delega en la API /api/admin/roles.
 */
export function RoleManager({ initialRoles, modules }: { initialRoles: Role[]; modules: Module[] }) {
  const [roles, setRoles] = useState(initialRoles)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<RoleForm>({ name: '', description: '', permissions: {} })
  const [saving, setSaving] = useState(false)
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
      const response = await fetch('/api/admin/roles', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudo refrescar la lista')
      const result = await response.json()
      setRoles(result.roles ?? [])
    } catch {
      toast.error('Error al refrescar la tabla', { description: 'Los cambios podrían no reflejarse hasta recargar.' })
    } finally {
      setRefreshing(false)
    }
  }, [])

  /** Construye el estado de permisos por módulo a partir de un rol. */
  function buildPermissions(role?: Role): PermissionState {
    const result: PermissionState = {}
    for (const module of modules) {
      const existing = role?.permissions.find((p) => p.module_id === module.id)
      result[module.id] = {
        can_read: existing?.can_read ?? false,
        can_write: existing?.can_write ?? false,
        can_delete: existing?.can_delete ?? false,
      }
    }
    return result
  }

  /** Abre el modal para crear un rol nuevo. */
  function openCreate() {
    setForm({ name: '', description: '', permissions: buildPermissions() })
    setModalOpen(true)
  }

  /** Abre el modal para editar un rol existente. */
  function openEdit(role: Role) {
    setForm({ id: role.id, name: role.name, description: role.description ?? '', permissions: buildPermissions(role) })
    setModalOpen(true)
  }

  /** Actualiza un permiso del formulario para un módulo y acción. */
  function setPermission(moduleId: string, action: 'can_read' | 'can_write' | 'can_delete', value: boolean) {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [moduleId]: { ...current.permissions[moduleId], [action]: value },
      },
    }))
  }

  /** Permite o deniega todos los permisos de un módulo de una vez. */
  function toggleModuleAll(moduleId: string, value: boolean) {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [moduleId]: { can_read: value, can_write: value, can_delete: value },
      },
    }))
  }

  /** Valida y envía la creación/edición del rol. */
  async function save() {
    if (!form.name.trim()) {
      toast.error('Completa el nombre del rol')
      return
    }

    setSaving(true)
    const response = await fetch('/api/admin/roles', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo guardar el rol')
      return
    }

    setModalOpen(false)
    refresh()
    toast.success(form.id ? 'Rol actualizado' : 'Rol creado')
  }

  /** Elimina un rol. */
  async function remove(id: string) {
    const ok = await confirmDelete({
      title: '¿Eliminar este rol?',
      description: 'Los usuarios asignados a este rol perderán sus permisos.',
      confirmText: 'Sí, eliminar rol',
    })
    if (!ok) return

    setDeletingId(id)
    const response = await fetch(`/api/admin/roles?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo eliminar')
      return
    }

    refresh()
    toast.success('Rol eliminado')
  }

  /** Cuenta los módulos con algún permiso activo para este rol. */
  function countPermissions(role: Role) {
    return role.permissions.filter((p) => p.can_read || p.can_write || p.can_delete).length
  }

  const columns: TableColumn<Role>[] = [
    {
      key: 'role',
      header: 'Rol',
      sortable: true,
      sortValue: (r) => r.name,
      render: (role) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <Shield size={16} />
          </div>
          <div>
            <p className="font-medium">{role.name}</p>
            <p className="max-w-xs truncate text-xs text-muted-foreground">{role.description || 'Sin descripción'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'permissions',
      header: 'Permisos',
      hiddenMobile: true,
      render: (role) => (
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {countPermissions(role)} de {modules.length} módulos
        </span>
      ),
    },
    {
      key: 'protected',
      header: 'Sistema',
      hiddenMobile: true,
      render: (role) =>
        role.name === 'admin' || role.name === 'client' ? (
          <span className="rounded-full bg-accent/30 px-2.5 py-1 text-xs font-medium text-accent-foreground">Base</span>
        ) : (
          <span className="text-muted-foreground/60">Personalizado</span>
        ),
    },
    {
      key: 'created_at',
      header: 'Creado',
      sortable: true,
      sortValue: (r) => r.created_at,
      hiddenMobile: true,
      render: (role) => <span className="text-muted-foreground">{new Date(role.created_at).toLocaleDateString('es-VE')}</span>,
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-24',
      cellClassName: 'text-right',
      render: (role) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openEdit(role)}
            aria-label={`Editar ${role.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => remove(role.id)}
            disabled={deletingId === role.id || role.name === 'admin' || role.name === 'client'}
            aria-label={`Eliminar ${role.name}`}
            title={role.name === 'admin' || role.name === 'client' ? 'Los roles base no se pueden eliminar' : undefined}
            className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {deletingId === role.id ? (
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
        data={roles}
        columns={columns}
        rowKey={(r) => r.id}
        searchKeys={(r) => `${r.name} ${r.description ?? ''}`}
        searchPlaceholder="Buscar roles…"
        emptyMessage="No se encontraron roles"
        noDataMessage="Aún no hay roles"
        loading={refreshing}
        toolbar={
          <button
            onClick={openCreate}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={15} /> Nuevo rol
          </button>
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="xl"
        title={form.id ? 'Editar rol' : 'Nuevo rol'}
        description={form.id ? 'Actualiza la información y los permisos del rol.' : 'Crea un rol personalizado y asigna permisos por módulo.'}
        icon={<Shield size={18} />}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={save}>
              {form.id ? 'Guardar cambios' : 'Crear rol'}
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput
              label="Nombre del rol"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Vendedor"
              autoFocus
            />
            <FormTextarea
              label="Descripción"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe las capacidades de este rol…"
              className="sm:col-span-2"
            />
          </div>

          <div className="grid gap-2 text-sm">
            <span className="font-medium">
              Permisos por módulo <span className="font-normal text-muted-foreground">(marca qué puede ver y hacer)</span>
            </span>

            <div className="overflow-hidden rounded-2xl border border-border">
              <div className="hidden grid-cols-[1fr_repeat(3,90px)_40px] gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground sm:grid">
                <span>Módulo</span>
                <span className="text-center">Ver</span>
                <span className="text-center">Crear / Editar</span>
                <span className="text-center">Eliminar</span>
                <span />
              </div>

              <div className="max-h-80 divide-y divide-border/50 overflow-y-auto">
                {modules.map((module) => {
                  const perm = form.permissions[module.id] ?? { can_read: false, can_write: false, can_delete: false }
                  const allActive = perm.can_read && perm.can_write && perm.can_delete
                  return (
                    <div key={module.id} className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[1fr_repeat(3,90px)_40px] sm:items-center sm:gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{module.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{module.description || `Módulo ${module.slug}`}</p>
                      </div>

                      <label className="flex cursor-pointer items-center gap-2 text-sm sm:justify-center">
                        <input
                          type="checkbox"
                          checked={perm.can_read}
                          onChange={(e) => setPermission(module.id, 'can_read', e.target.checked)}
                          className="size-4 accent-primary"
                        />
                        <span className="sm:hidden">Ver</span>
                      </label>

                      <label className="flex cursor-pointer items-center gap-2 text-sm sm:justify-center">
                        <input
                          type="checkbox"
                          checked={perm.can_write}
                          onChange={(e) => setPermission(module.id, 'can_write', e.target.checked)}
                          className="size-4 accent-primary"
                        />
                        <span className="sm:hidden">Crear / Editar</span>
                      </label>

                      <label className="flex cursor-pointer items-center gap-2 text-sm sm:justify-center">
                        <input
                          type="checkbox"
                          checked={perm.can_delete}
                          onChange={(e) => setPermission(module.id, 'can_delete', e.target.checked)}
                          className="size-4 accent-primary"
                        />
                        <span className="sm:hidden">Eliminar</span>
                      </label>

                      <button
                        onClick={() => toggleModuleAll(module.id, !allActive)}
                        aria-label={allActive ? `Quitar todos los permisos de ${module.name}` : `Dar todos los permisos a ${module.name}`}
                        title={allActive ? 'Quitar todos' : 'Todos'}
                        className="hidden size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:grid"
                      >
                        <Eye size={14} className={allActive ? 'text-cyan-600' : ''} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              «Ver» permite acceder al módulo. «Crear / Editar» permite agregar o modificar registros. «Eliminar» permite borrar registros.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}