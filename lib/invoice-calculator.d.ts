/** Declaraciones de tipos para lib/invoice-calculator.mjs (facturación venezolana). */

/** Alícuota general de IVA en Venezuela (%). */
export const DEFAULT_IVA_RATE: number

/** Dígitos por defecto del correlativo de factura (8 dígitos). */
export const DEFAULT_INVOICE_DIGITS: number

/** Letras válidas de un RIF venezolano. */
export const RIF_LETTERS: string[]

/** Tipos de documento de identidad aceptados para el receptor. */
export const DOCUMENT_TYPES: Array<'rif' | 'ci' | 'pasaporte'>

/** Resultado de la validación de un RIF. */
export type RifValidationResult = {
  valid: boolean
  reason?: string
  normalized?: string
}

/** Desglose de totales de una factura. */
export type InvoiceTotals = {
  subtotal: number
  iva_amount: number
  total: number
}

/** Números legibles de los estados de factura. */
export const INVOICE_STATUS_LABELS: Record<string, string>

/** Valida un RIF venezolano (formato y dígito verificador). */
export function validateRif(rif: string): RifValidationResult

/** Desglosa los totales de una factura según las normas del SENIAT. */
export function calculateInvoiceTotals(
  items: Array<{ quantity: number; unit_price: number }>,
  ivaRate?: number,
  pricesIncludeIva?: boolean,
): InvoiceTotals

/** Formatea el número de factura SENIAT: {prefijo}-{serie}-{correlativo 8 dígitos}. */
export function formatInvoiceNumber(prefix: string, series: string, number: number, digits?: number): string

/** Formatea el número de control: {serie}-{correlativo 8 dígitos}. */
export function formatControlNumber(series: string, number: number, digits?: number): string

/** Devuelve la etiqueta de un tipo de documento venezolano. */
export function documentTypeLabel(type: string): string

/** Devuelve la etiqueta del régimen fiscal. */
export function regimenLabel(regimen: string): string

/** Calcula el próximo número de correlativo esperado. */
export function nextNumber(current: number): number

/** Valida un correo electrónico simple para el receptor. */
export function isValidEmail(email: string): boolean

/** Valida un teléfono venezolano simple (con o sin código de país). */
export function isValidPhone(phone: string): boolean