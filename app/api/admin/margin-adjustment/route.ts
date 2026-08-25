import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { applyPriceAdjustment, getAdjustmentHistory, getLastAppliedRate, getProductsForAdjustment } from '@/services/margin-adjustment'

/**
 * API del módulo "Ajuste de Margen y Control de Pérdidas".
 * Toda la lógica de datos vive en /services/margin-adjustment.
 * La actualización masiva se delega a la RPC de PostgreSQL
 * (una sola transacción, sin loop de updates individuales).
 */

/**
 * GET: Obtiene los productos con su costo base y precio de venta
 * actuales para previsualizar la simulación del ajuste.
 * Requiere permiso de lectura del módulo 'ajustes_precios'.
 */
export async function GET() {
  await requireAdmin()
  const canRead = await hasPermission('ajustes_precios', 'read')
  if (!canRead) {
    return NextResponse.json({ error: 'No tienes permiso para consultar este módulo.' }, { status: 403 })
  }

  const [productsResult, historyResult, lastRateResult] = await Promise.all([
    getProductsForAdjustment(),
    getAdjustmentHistory(),
    getLastAppliedRate(),
  ])

  return NextResponse.json({
    products: productsResult.data ?? [],
    history: historyResult.data ?? [],
    lastRate: lastRateResult.data ?? null,
  })
}

/**
 * POST: Aplica un ajuste masivo de precios a los productos seleccionados.
 * Requiere permiso de escritura del módulo 'ajustes_precios'.
 * Ejecuta la RPC aplicar_ajuste_precios en una sola transacción
 * y registra el historial con los precios anteriores (auditoría).
 */
export async function POST(request: Request) {
  await requireAdmin()
  const canWrite = await hasPermission('ajustes_precios', 'write')
  if (!canWrite) {
    return NextResponse.json({ error: 'No tienes permiso para aplicar ajustes de precios.' }, { status: 403 })
  }

  const body = await request.json()

  const productIds = Array.isArray(body.product_ids) ? body.product_ids.map(String).filter(Boolean) : []
  const porcentaje = Number(body.porcentaje)
  const tasa = Number(body.tasa)

  if (productIds.length === 0) {
    return NextResponse.json({ error: 'Debes seleccionar al menos un producto.' }, { status: 400 })
  }
  if (!Number.isFinite(porcentaje) || porcentaje <= 0) {
    return NextResponse.json({ error: 'El porcentaje de incremento debe ser mayor a 0.' }, { status: 400 })
  }
  if (!Number.isFinite(tasa) || tasa <= 0) {
    return NextResponse.json({ error: 'La tasa calculada debe ser mayor a 0.' }, { status: 400 })
  }

  const result = await applyPriceAdjustment(productIds, porcentaje, tasa)
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 })
  }

  return NextResponse.json({ result: result.data })
}