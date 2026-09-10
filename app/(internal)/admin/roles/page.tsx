import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader } from '@/components/admin-shell'
import { RoleManager } from '@/components/role-manager'
import { getModules, getRolesWithPermissions } from '@/services/roles'
import { Shield } from 'lucide-react'

/**
 * Página de administración de roles y permisos.
 * Lista los roles del sistema y permite crear, editar y eliminar
 * roles asignando permisos por módulo (ver, crear/editar, eliminar).
 * Los datos se obtienen a través de /services/roles.
 */
export default async function RolesPage() {
  await requireAdmin()
  const [{ data: roles, error: rolesError }, { data: modules, error: modulesError }] = await Promise.all([
    getRolesWithPermissions(),
    getModules(),
  ])

  return (
<>
      <AdminPageHeader
        eyebrow="Accesos"
        title="Roles y permisos"
        description="Crea roles personalizados y define qué puede ver y hacer cada uno en los módulos del panel."
      />
      <div className="p-5 sm:p-8">
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
          <Shield size={18} className="text-cyan-600" />
          <div>
            <h2 className="font-medium">Roles del sistema</h2>
            <p className="text-sm text-muted-foreground">
              {roles?.length ?? 0} roles · {modules?.length ?? 0} módulos con permisos configurables
            </p>
          </div>
        </div>

        {rolesError && (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            No se pudieron cargar los roles: {rolesError.message}
          </div>
        )}
        {modulesError && (
          <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-sm text-destructive">
            No se pudieron cargar los módulos: {modulesError.message}
          </div>
        )}

        <RoleManager initialRoles={roles ?? []} modules={modules ?? []} />
      </div>
  
</>)
}