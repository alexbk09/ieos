/**
 * Lógica pura de cuentas por cobrar y crédito.
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 *
 * Cubre:
 *  - Cálculo de saldo y estado de una cuenta por cobrar
 *  - Días de vencimiento y estado 'vencida'
 *  - Validación de límite de crédito
 *  - Plazo de pago → fecha de vencimiento
 */

/**
 * Estados posibles de una cuenta por cobrar.
 * - pendiente: sin abonos
 * - parcial: con abonos pero saldo > 0
 * - pagada: saldo = 0
 * - vencida: fecha de vencimiento pasada y saldo > 0
 * - cancelada: factura anulada
 */
export const ESTADOS_CXC = ['pendiente', 'parcial', 'pagada', 'vencida', 'cancelada']

/**
 * Calcula el saldo de una cuenta por cobrar y su estado automático.
 * Reglas:
 *  - Si total <= 0 → 'pagada'.
 *  - Si abonado >= total → 'pagada'.
 *  - Si abonado > 0 → 'parcial'.
 *  - Sin abonos → 'pendiente'.
 * @param {number} total Monto total de la factura.
 * @param {number} abonado Monto abonado hasta ahora.
 * @returns {{ saldo: number; estado: string }}
 */
export function calcularSaldo(total, abonado) {
  const t = Math.max(0, Number(total) || 0)
  const a = Math.max(0, Number(abonado) || 0)
  const saldo = Math.max(0, t - a)
  const estado = saldo <= 0 ? 'pagada' : a > 0 ? 'parcial' : 'pendiente'
  return { saldo: Math.round(saldo * 100) / 100, estado }
}

/**
 * Calcula los días transcurridos desde la fecha de vencimiento.
 * Si la fecha aún no ha vencido, devuelve un valor <= 0.
 * @param {string|null} fechaVencimiento Fecha ISO (YYYY-MM-DD).
 * @returns {number} Días de atraso (negativo si aún no vence).
 */
export function calcularDiasVencido(fechaVencimiento) {
  if (!fechaVencimiento) return 0
  const due = new Date(String(fechaVencimiento).slice(0, 10) + 'T23:59:59')
  if (Number.isNaN(due.getTime())) return 0
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  // Días transcurridos desde el vencimiento:
  //   - Fecha futura → negativo (aún no vence)
  //   - Fecha pasada → positivo (vencido hace X días)
  const diffMs = now.getTime() - due.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Determina el estado definitivo de una cuenta considerando el vencimiento.
 * Si el saldo > 0 y la fecha ya venció → 'vencida' (salvo cancelada).
 * @param {string} estado Estado calculado por calcularSaldo.
 * @param {number} diasVencido Días de atraso.
 * @returns {string} Estado final.
 */
export function estadoConVencimiento(estado, diasVencido) {
  if (estado === 'cancelada' || estado === 'pagada') return estado
  if (estado !== 'pendiente' && estado !== 'parcial') return estado
  if (estado === 'parcial' && diasVencido > 0) return 'vencida'
  if (estado === 'pendiente' && diasVencido > 0) return 'vencida'
  return estado
}

/**
 * Calcula la fecha de vencimiento a partir de la fecha de emisión y el plazo.
 * @param {string} fechaEmision Fecha ISO de emisión (YYYY-MM-DD o full ISO).
 * @param {number} diasPlazo Días de plazo (0 = sin plazo → null).
 * @returns {string|null} Fecha de vencimiento YYYY-MM-DD o null.
 */
export function calcularFechaVencimiento(fechaEmision, diasPlazo) {
  const dias = Math.max(0, Math.floor(Number(diasPlazo) || 0))
  if (dias === 0) return null
  const emision = new Date(String(fechaEmision).slice(0, 10))
  if (Number.isNaN(emision.getTime())) return null
  emision.setDate(emision.getDate() + dias)
  return emision.toISOString().slice(0, 10)
}

/**
 * Valida el límite de crédito de un cliente antes de aprobar una factura.
 * @param {number} limiteCreditoUsd Límite aprobado (0 = sin crédito).
 * @param {number} saldoUsadoUsd Saldo total usado por el cliente.
 * @param {number} montoNuevaFactura Monto de la nueva factura a crédito.
 * @returns {{ aprobado: boolean; error: string|null; disponibleUsd: number }}
 */
export function validarLimiteCredito(limiteCreditoUsd, saldoUsadoUsd, montoNuevaFactura) {
  const limite = Math.max(0, Number(limiteCreditoUsd) || 0)
  const usado = Math.max(0, Number(saldoUsadoUsd) || 0)
  const monto = Math.max(0, Number(montoNuevaFactura) || 0)

  if (limite === 0) {
    return { aprobado: false, error: 'El cliente no tiene límite de crédito aprobado', disponibleUsd: 0 }
  }

  const disponible = Math.max(0, limite - usado)
  if (monto > disponible) {
    return {
      aprobado: false,
      error: `El monto supera el crédito disponible ($${disponible.toFixed(2)} de $${limite.toFixed(2)})`,
      disponibleUsd: Math.round(disponible * 100) / 100,
    }
  }

  return { aprobado: true, error: null, disponibleUsd: Math.round(disponible * 100) / 100 }
}