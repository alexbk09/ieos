import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getUserPermissions } from '@/services/roles'

/**
 * API: Permisos por módulo del usuario autenticado (solo admin).
 * Se usa para filtrar la navegación del panel y mostrar solo los
 * módulos a los que el usuario tiene acceso de lectura (can_read).
 * La lógica de datos se delega en /services/roles.
 */
export async function GET() {
  await requireAdmin()
  const { data: permissions, error } = await getUserPermissions()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ permissions: permissions ?? [] })
}