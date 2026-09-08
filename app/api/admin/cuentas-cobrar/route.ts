import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import {
  actualizarLimiteCredito,
  crearCuentaPorCobrar,
  getAbonosPorFactura,
  getCreditoCliente,
  getCuentasPorCobrar,
  registrarAbono,
} from '@/services/cuentas-cobrar'
import { CUENTAS_COBRAR_MODULE_SLUG } from '@/lib/constants'

/** GET: Lista cuentas por cobrar, abonos de una factura o crédito de un cliente. */
export async function GET(request: Request) {
  await requireAdmin()
  const canRead = await hasPermission(CUENTAS_COBRAR_MODULE_SLUG, 'read')
  if (!canRead) return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })

  const url = new URL(request.url)
  const abonos = url.searchParams.get('abonos')
  const credito = url.searchParams.get('credito')

  if (abonos) {
    const result = await getAbonosPorFactura(abonos)
    return NextResponse.json(result.error ? { error: result.error.message } : { abonos: result.data })
  }
  if (credito) {
    const result = await getCreditoCliente(credito)
    return NextResponse.json(result.error ? { error: result.error.message } : { credito: result.data })
  }

  const result = await getCuentasPorCobrar()
  return NextResponse.json(result.error ? { error: result.error.message } : { cuentas: result.data })
}

/** POST: Registra abono, crea cuenta por cobrar o actualiza límite de crédito. */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission(CUENTAS_COBRAR_MODULE_SLUG, 'write')
  if (!canWrite) return NextResponse.json({ error: 'No tienes permiso para modificar este módulo.' }, { status: 403 })

  const body = await request.json()

  if (body.action === 'registrar_abono') {
    if (!body.invoice_id || !body.monto) return NextResponse.json({ error: 'Factura y monto requeridos.' }, { status: 400 })
    const result = await registrarAbono(
      String(body.invoice_id),
      Number(body.monto),
      String(body.metodo ?? 'transferencia'),
      body.referencia ?? null,
      body.notas ?? null,
    )
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  if (body.action === 'crear_cxc') {
    if (!body.invoice_id) return NextResponse.json({ error: 'Factura requerida.' }, { status: 400 })
    const result = await crearCuentaPorCobrar(String(body.invoice_id), Number(body.total_usd ?? 0), Number(body.dias_plazo ?? 0))
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  if (body.action === 'actualizar_limite') {
    if (!body.user_id) return NextResponse.json({ error: 'Usuario requerido.' }, { status: 400 })
    const result = await actualizarLimiteCredito(
      String(body.user_id),
      Number(body.limite ?? 0),
      Number(body.dias_plazo ?? 0),
      Boolean(body.es_credito),
    )
    return NextResponse.json(result.error ? { error: result.error.message } : { ok: true }, { status: result.error ? 400 : 200 })
  }

  return NextResponse.json({ error: 'Acción desconocida.' }, { status: 400 })
}