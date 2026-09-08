import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import {
  actualizarBanco,
  conciliarMovimiento,
  crearBanco,
  crearMovimiento,
  descartarMovimiento,
  eliminarBanco,
  getBancos,
  getMovimientos,
  sincronizarBanco,
} from '@/services/conciliacion'
import { CONCILIACION_MODULE_SLUG } from '@/lib/constants'

/** GET: Lista bancos o movimientos (con filtro por estado). */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission(CONCILIACION_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })

  const url = new URL(request.url)
  const bancos = url.searchParams.get('bancos')
  const estado = url.searchParams.get('estado')

  if (bancos === '1') {
    const result = await getBancos()
    return NextResponse.json(result.error ? { error: result.error.message } : { bancos: result.data })
  }

  const result = await getMovimientos(estado)
  return NextResponse.json(result.error ? { error: result.error.message } : { movimientos: result.data })
}

/** POST: Crea banco/movimiento, sincroniza, concilia o descarta. */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(CONCILIACION_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar este módulo.' }, { status: 403 })

  const body = await request.json()

  if (body.action === 'crear_movimiento') {
    const result = await crearMovimiento({
      banco_id: body.banco_id ?? null,
      referencia: String(body.referencia ?? ''),
      monto_usd: Number(body.monto_usd ?? 0),
      emisor: body.emisor ?? null,
      beneficiario: body.beneficiario ?? null,
      detalle: body.detalle ?? null,
      fecha_movimiento: body.fecha_movimiento ?? null,
    })
    return NextResponse.json(result.error ? { error: result.error.message } : { movimiento: result.data }, { status: result.error ? 400 : 200 })
  }

  if (body.action === 'sincronizar') {
    if (body.banco_id) {
      const { data: bancos } = await getBancos()
      const banco = (bancos ?? []).find((b) => b.id === body.banco_id)
      if (!banco) return NextResponse.json({ error: 'Banco no encontrado.' }, { status: 400 })
      const result = await sincronizarBanco(banco)
      return NextResponse.json(result.ok ? { ok: true, creados: result.creados } : { error: result.error }, { status: result.ok ? 200 : 400 })
    }
    return NextResponse.json({ error: 'Banco requerido.' }, { status: 400 })
  }

  if (body.action === 'conciliar') {
    if (!body.movimiento_id || !body.abono_id) return NextResponse.json({ error: 'Movimiento y abono requeridos.' }, { status: 400 })
    const result = await conciliarMovimiento(String(body.movimiento_id), String(body.abono_id))
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  if (body.action === 'descartar') {
    if (!body.movimiento_id) return NextResponse.json({ error: 'Movimiento requerido.' }, { status: 400 })
    const result = await descartarMovimiento(String(body.movimiento_id))
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  // Creación de banco
  const result = await crearBanco(body)
  return NextResponse.json(result.error ? { error: result.error.message } : { banco: result.data }, { status: result.error ? 400 : 200 })
}

/** PATCH: Actualiza un banco. */
export async function PATCH(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(CONCILIACION_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar este módulo.' }, { status: 403 })

  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await actualizarBanco(String(body.id), body)
  return NextResponse.json(result.error ? { error: result.error.message } : { banco: result.data }, { status: result.error ? 400 : 200 })
}

/** DELETE: Elimina un banco. */
export async function DELETE(request: Request) {
  await requireAdmin()
  const canDelete = await hasPermission(CONCILIACION_MODULE_SLUG, 'delete')
  if (!canDelete) return NextResponse.json({ error: 'No tienes permiso para eliminar.' }, { status: 403 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await eliminarBanco(id)
  return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
}