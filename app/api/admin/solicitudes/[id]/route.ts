import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { SOLICITUDES_MODULE_SLUG } from '@/lib/constants'
import { REQUEST_STATUSES, updateRequestStatus } from '@/services/requests'

/**
 * API: Actualizar el estado de una solicitud (solo admin).
 * Los estados válidos vienen de /services/requests.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin()
  // Módulo legado oculto (RBAC): sin permiso, la API queda bloqueada.
  if (!(await hasPermission(SOLICITUDES_MODULE_SLUG, 'write'))) {
    return NextResponse.json({ error: 'Módulo no disponible.' }, { status: 403 })
  }
  const { id } = await params
  const { status } = await request.json()

  if (!REQUEST_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const result = await updateRequestStatus(id, status)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ request: result.data })
}