'use client'

import { useState } from 'react'
import { Phone, Plus, ShieldCheck, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'

type AdminUser = {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  role: 'admin' | 'client'
  role_name: string | null
  role_id: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
  has_profile: boolean
}

type Role = {
  id: string
  name: string
  description: string | null
}

type UserForm = {
  full_name: string
  email: string
  password: string
  phone: string
  role_id: string
}

const EMPTY_FORM: UserForm = { full_name: '', email: '', password: '', phone: '', role_id: '' }

/**
 * Gestor de usuarios: tabla con búsqueda, ordenamiento, paginación
 * y creación de nuevos usuarios con asignación de rol.
 * La UI es independiente de Supabase; los datos llegan filtrados del servidor.
 */
export function UserManager({ initialUsers, roles }: { initialUsers: AdminUser[]; roles: Role[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  /** Valida los campos del formulario antes de enviar. */
  function validate(): string | null {
    if (!form.email.trim()) return 'El email es obligatorio.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'El email no es válido.'
    if (form.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'
    return null
  }

  /** Crea el usuario vía API y actualiza la tabla en memoria. */
  async function handleCreate() {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }

    setSaving(true)
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const result = await response.json()
    setSaving(false)

    if (!response.ok) {
      toast.error(result.error ?? 'No se pudo crear el usuario')
      return
    }

    const savedUser: AdminUser = {
      ...result.user,
      role_name: form.role_id ? (roles.find((r) => r.id === form.role_id)?.name ?? null) : null,
    }

    setUsers((current) => [savedUser, ...current])
    setForm(EMPTY_FORM)
    setModalOpen(false)
    toast.success('Usuario creado')
  }

  const columns: TableColumn<AdminUser>[] = [
    {
      key: 'user',
      header: 'Usuario',
      sortable: true,
      sortValue: (u) => u.full_name ?? u.email ?? '',
      render: (user) => (
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/30 font-semibold text-accent-foreground">
            {(user.full_name || user.email || 'U').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {user.full_name || 'Sin nombre'}
              {!user.has_profile && <span className="ml-2 text-[10px] text-muted-foreground">(sin perfil)</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user.email || 'Sin email'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Teléfono',
      sortable: true,
      sortValue: (u) => u.phone ?? '',
      render: (user) =>
        user.phone ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Phone size={13} /> {user.phone}
          </span>
        ) : (
          <span className="text-muted-foreground/60">No indicado</span>
        ),
    },
    {
      key: 'role',
      header: 'Rol',
      sortable: true,
      sortValue: (u) => u.role_name ?? u.role,
      render: (user) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            user.role === 'admin'
              ? 'bg-accent/30 text-accent-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {user.role === 'admin' ? <ShieldCheck size={13} /> : <UserRound size={13} />}
          {user.role_name ?? (user.role === 'admin' ? 'Administrador' : 'Cliente')}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Registro',
      sortable: true,
      sortValue: (u) => u.created_at,
      hiddenMobile: true,
      render: (user) => <span className="text-muted-foreground">{new Date(user.created_at).toLocaleDateString('es-VE')}</span>,
    },
  ]

  return (
    <div className="grid gap-6">
      <DataTable
        data={users}
        columns={columns}
        rowKey={(u) => u.id}
        searchKeys={(u) => `${u.full_name ?? ''} ${u.email ?? ''} ${u.phone ?? ''} ${u.role_name ?? u.role}`}
        searchPlaceholder="Buscar por nombre, email, teléfono o rol…"
        emptyMessage="No se encontraron usuarios"
        noDataMessage="Aún no hay usuarios registrados"
        pageSize={8}
        toolbar={
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={15} /> Nuevo usuario
          </button>
        }
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo usuario"
        description="Crea un usuario y asígnale un rol del sistema."
        icon={<UserRound size={18} />}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={handleCreate}>
              Crear usuario
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <FormInput
            label="Nombre completo"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Ej: María Pérez"
            autoFocus
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="usuario@ejemplo.com"
              required
            />
            <FormInput
              label="Contraseña"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 6 caracteres"
              hint="El usuario podrá iniciar sesión con esta contraseña."
              required
            />
          </div>

          <FormInput
            label="Teléfono"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Opcional"
          />

          <div className="grid gap-2 text-sm">
            <span className="font-medium">Rol</span>
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-2xl border border-border p-2">
              {roles.map((role) => {
                const selected = form.role_id === role.id
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setForm({ ...form, role_id: role.id })}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      selected ? 'bg-accent/30 text-accent-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    {role.name === 'admin' ? <ShieldCheck size={15} className="shrink-0" /> : <UserRound size={15} className="shrink-0" />}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{role.name}</span>
                      {role.description && <span className="block truncate text-xs text-muted-foreground">{role.description}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              El rol define a qué módulos del panel tendrá acceso este usuario.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}