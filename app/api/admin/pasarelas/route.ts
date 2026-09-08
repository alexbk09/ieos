import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { actualizarPasarela, confirmarPago, getPagos, getPasarelas } from '@/services/pasarelas'
import { PASARELAS_MODULE_SLUG } from '@/lib/constants'

/** GET: Lista pasarelas o pagos. */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission(PASARELAS_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })

  const url = new URL(request.url)
  const pagos = url.searchParams.get('pagos')

  if (pagos === '1') {
    const result = await getPagos()
    return NextResponse.json(result.error ? { error: result.error.message } : { pagos: result.data })
  }

  const result = await getPasarelas()
  return NextResponse.json(result.error ? { error: result.error.message } : { pasarelas: result.data })
}

/** POST: Confirma/rechaza un pago manualmente. */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(PASARELAS_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar este módulo.' }, { status: 403 })

  const body = await request.json()

  if (body.action === 'confirmar_pago') {
    if (!body.pago_id || !body.estado) return NextResponse.json({ error: 'Pago y estado requeridos.' }, { status: 400 })
    const result = await confirmarPago(String(body.pago_id), body.estado)
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  return NextResponse.json({ error: 'Acción desconocida.' }, { status: 400 })
}

/** PATCH: Actualiza la configuración de una pasarela. */
export async function PATCH(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(PASARELAS_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar este módulo.' }, { status: 403 })

  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await actualizarPasarela(String(body.id), {
    activo: body.activo !== undefined ? Boolean(body.activo) : undefined,
    llave_publica: body.llave_publica,
    llave_secreta_enc: body.llave_secreta_enc,
    modo: body.modo,
    comision_porcentual: body.comision_porcentual !== undefined ? Number(body.comision_porcentual) : undefined,
  })
  return NextResponse.json(result.error ? { error: result.error.message } : { pasarela: result.data }, { status: result.error ? 400 : 200 })
}