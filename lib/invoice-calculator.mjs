/**
 * Lógica pura de facturación venezolana (cumple Providencia SENIAT).
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 *
 * Cubre:
 *  - Validación de RIF con dígito verificador
 *  - Desglose de IVA (base imponible, monto IVA, total) con precios
 *    que incluyen o no IVA
 *  - Formato del número de factura y número de control
 *  - Etiquetas de tipo de documento
 */

/** Alícuota general de IVA en Venezuela (%). */
export const DEFAULT_IVA_RATE = 16

/** Dígitos por defecto del correlativo de factura (8 dígitos). */
export const DEFAULT_INVOICE_DIGITS = 8

/** Letras válidas de un RIF venezolano. */
export const RIF_LETTERS = ['V', 'E', 'J', 'P', 'G']

/** Tipos de documento de identidad aceptados para el receptor. */
export const DOCUMENT_TYPES = ['rif', 'ci', 'pasaporte']

/** Pesos del algoritmo del dígito verificador del RIF. */
const RIF_WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2]

/**
 * Valida un RIF venezolano (formato y dígito verificador).
 * Acepta J-12345678-5 (con o sin guiones) y tolera el dígito "K".
 * @param {string} rif RIF a validar.
 * @returns {{ valid: boolean; reason?: string; normalized?: string }}
 */
export function validateRif(rif) {
  if (typeof rif !== 'string') return { valid: false, reason: 'El RIF debe ser texto' }

  const trimmed = rif.trim().toUpperCase()

  // Acepta "J-12345678-5" o "J123456785" (8 dígitos + DV)
  const match = trimmed.match(/^([VEPJG])\s*[-]?\s*(\d{8})\s*[-]?\s*([\dK])$/i)
  if (!match) {
    return { valid: false, reason: 'Formato inválido. Use: J-12345678-5' }
  }

  const letter = match[1]
  const digits = match[2]
  const dvInput = match[3]

  // Aplica los pesos del SENIAT a los 8 dígitos
  let sum = 0
  for (let i = 0; i < RIF_WEIGHTS.length; i++) {
    sum += RIF_WEIGHTS[i] * Number(digits[i])
  }

  let remainder = sum % 11
  let dv = 11 - remainder
  if (dv === 11) dv = 0
  else if (dv === 10) dv = 'K' // dígito K válido en RIF

  const dvStr = String(dv)
  const valid = dvStr === dvInput

  return valid
    ? { valid: true, normalized: `${letter}-${digits}-${dvInput}` }
    : { valid: false, reason: `Dígito verificador inválido (esperado ${dvStr})` }
}

/**
 * Desglosa los totales de una factura según las normas del SENIAT.
 *
 * Cuando `pricesIncludeIva` es true, el precio unitario ya contiene IVA
 * y este se desglosa (base = total / (1 + tasa)). Cuando es false, el IVA
 * se suma al precio neto.
 *
 * @param {Array<{ quantity: number; unit_price: number }>} items Ítems de la factura.
 * @param {number} ivaRate Alícuota de IVA en % (ej. 16).
 * @param {boolean} pricesIncludeIva true si el precio ya incluye IVA.
 * @returns {{ subtotal: number; iva_amount: number; total: number }}
 */
export function calculateInvoiceTotals(items, ivaRate = DEFAULT_IVA_RATE, pricesIncludeIva = true) {
  const rate = Math.min(Math.max(Number(ivaRate) || 0, 0), 100)
  const factor = 1 + rate / 100

  let baseTotal = 0
  for (const item of items ?? []) {
    const quantity = Number(item?.quantity) || 0
    const unitPrice = Number(item?.unit_price) || 0
    baseTotal += quantity * unitPrice
  }

  let subtotal = 0
  let ivaAmount = 0
  if (pricesIncludeIva && rate > 0) {
    // Precios ya incluyen IVA → extraer base imponible
    subtotal = baseTotal / factor
    ivaAmount = baseTotal - subtotal
  } else {
    // Precio neto → IVA se suma
    subtotal = baseTotal
    ivaAmount = baseTotal * (rate / 100)
  }

  // Redondeo a 2 decimales (céntimos)
  const round2 = (n) => Math.round(n * 100) / 100
  const rSubtotal = round2(subtotal)
  const rIva = round2(ivaAmount)
  const rTotal = round2(rSubtotal + rIva)

  return { subtotal: rSubtotal, iva_amount: rIva, total: rTotal }
}

/**
 * Formatea el número de factura SENIAT: {prefijo}-{serie}-{correlativo 8 dígitos}.
 * @param {string} prefix Prefijo del documento (ej. "FAC").
 * @param {string} series Serie / punto de emisión (ej. "0001").
 * @param {number} number Correlativo actual (ej. 1).
 * @param {number} digits Dígitos del correlativo (por defecto 8).
 * @returns {string} Ej. "FAC-0001-00000001"
 */
export function formatInvoiceNumber(prefix, series, number, digits = DEFAULT_INVOICE_DIGITS) {
  const p = String(prefix ?? '').toUpperCase().trim().replace(/\s+/g, '') || 'FAC'
  const s = String(series ?? '').trim() || '0001'
  const n = Math.max(0, Math.floor(Number(number) || 0))
  return `${p}-${s}-${String(n).padStart(digits, '0')}`
}

/**
 * Formatea el número de control: {serie}-{correlativo 8 dígitos}.
 * @param {string} series Serie autorizada (ej. "B").
 * @param {number} number Correlativo actual.
 * @param {number} digits Dígitos del correlativo.
 * @returns {string} Ej. "B-00000001"
 */
export function formatControlNumber(series, number, digits = DEFAULT_INVOICE_DIGITS) {
  const s = String(series ?? '').toUpperCase().trim() || 'B'
  const n = Math.max(0, Math.floor(Number(number) || 0))
  return `${s}-${String(n).padStart(digits, '0')}`
}

/** Etiqueta legible de un tipo de documento. */
const DOCUMENT_LABELS = {
  rif: 'RIF',
  ci: 'C.I.',
  pasaporte: 'Pasaporte',
}

/**
 * Devuelve la etiqueta de un tipo de documento venezolano.
 * @param {string} type Tipo de documento ("rif" | "ci" | "pasaporte").
 * @returns {string} Etiqueta o el mismo valor si no existe.
 */
export function documentTypeLabel(type) {
  return DOCUMENT_LABELS[type] ?? type
}

/** Etiqueta legible del régimen fiscal. */
const REGIMEN_LABELS = {
  contribuyente_formal: 'Contribuyente Formal',
  no_contribuyente: 'No Contribuyente',
}

/**
 * Devuelve la etiqueta del régimen fiscal.
 * @param {string} regimen Régimen ("contribuyente_formal" | "no_contribuyente").
 * @returns {string} Etiqueta legible.
 */
export function regimenLabel(regimen) {
  return REGIMEN_LABELS[regimen] ?? regimen
}

/** Etiqueta legible del estado de una factura. */
export const INVOICE_STATUS_LABELS = {
  issued: 'Emitida',
  cancelled: 'Anulada',
}

/**
 * Calcula el próximo número de correlativo esperado.
 * Utilidad para la UI de vista previa.
 * @param {number} current Número actual en la BD.
 * @returns {number} El siguiente correlativo.
 */
export function nextNumber(current) {
  return Math.max(0, Math.floor(Number(current) || 0)) + 1
}

/**
 * Valida un correo electrónico simple para el receptor.
 * @param {string} email Correo a validar.
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/**
 * Valida un teléfono venezolano simple (con o sin código de país).
 * @param {string} phone Teléfono a validar.
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (typeof phone !== 'string') return false
  return /^\+?\d{7,15}$/.test(phone.trim())
}