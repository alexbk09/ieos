import { AdminPageSkeleton } from '@/components/ui/skeleton'

/**
 * Estado de carga del panel administrativo.
 * El AdminShell lo provee app/admin/layout.tsx (persistente); aquí solo se
 * pinta el skeleton del contenido (header + cuerpo) para no duplicar el sidebar.
 */
export default function AdminLoading() {
  return <AdminPageSkeleton />
}
