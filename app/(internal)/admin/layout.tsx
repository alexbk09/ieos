import { AdminShell } from '@/components/admin-shell'
import { requireAdmin } from '@/lib/auth'

/**
 * Layout del panel administrativo.
 * Envuelve todo el segmento /admin en un único AdminShell: el sidebar y el
 * encabezado solo se montan una vez y persisten al navegar entre páginas
 * internas del panel (los estados de carga locales no lo remontan).
 */
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin()
  return <AdminShell>{children}</AdminShell>
}