/**
 * Declaración de tipos para lib/credit-calculator.mjs.
 */

/** Estados posibles de una cuenta por cobrar. */
export const ESTADOS_CXC: string[]

/** Resultado del cálculo de saldo. */
export type ResultadoSaldo = {
  saldo: number
  estado: string
}

/** Calcula saldo y estado de una cuenta por cobrar. */
export function calcularSaldo(total: number, abonado: number): ResultadoSaldo

/** Calcula los días de atraso desde el vencimiento. */
export function calcularDiasVencido(fechaVencimiento: string | null): number

/** Determina el estado final considerando vencimiento. */
export function estadoConVencimiento(estado: string, diasVencido: number): string

/** Calcula la fecha de vencimiento desde emisión + plazo. */
export function calcularFechaVencimiento(fechaEmision: string, diasPlazo: number): string | null

/** Resultado de la validación de límite de crédito. */
export type ResultadoLimiteCredito = {
  aprobado: boolean
  error: string | null
  disponibleUsd: number
}

/** Valida el límite de crédito de un cliente. */
export function validarLimiteCredito(
  limiteCreditoUsd: number,
  saldoUsadoUsd: number,
  montoNuevaFactura: number,
): ResultadoLimiteCredito