import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { UserManager } from '@/components/user-manager'
import { listAdminUsers } from '@/services/admin-users'
import { getRolesWithPermissions } from '@/services/roles'
import { Users } from 'lucide-react'

/**
 * Página de administración de usuarios.
 * Lista TODOS los usuarios de auth.users (admin + clientes),
 * incluyendo aquellos sin fila en profiles (trigger no ejecutado),
 * y permite crear usuarios nuevos asignándoles un rol personalizado.
 */
export default async function UsersPage() {
  await requireAdmin()
  const [{ data: users, error }, { data: roles, error: rolesError }] = await Promise.all([
    listAdminUsers(),
    getRolesWithPermissions(),
  ])

  return (
<>
      <AdminPageHeader eyebrow="Comunidad" title="Usuarios" description="Gestiona perfiles, roles y creación de usuarios del sistema." />
      <div className="p-5 sm:p-8">
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
          <Users size={18} className="text-cyan-600" />
          <div>
            <h2 className="font-medium">Usuarios del sistema</h2>
            <p className="text-sm text-muted-foreground">
              {users?.length ?? 0} registrados · {users?.filter((u) => u.role === 'client').length ?? 0} clientes ·{' '}
              {users?.filter((u) => u.role === 'admin').length ?? 0} administradores · {roles?.length ?? 0} roles disponibles
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            No se pudieron cargar los usuarios: {error}
          </div>
        )}
        {rolesError && (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            No se pudieron cargar los roles: {rolesError.message}
          </div>
        )}

        <UserManager initialUsers={users ?? []} roles={roles ?? []} />
      </div>
  
</>)
}