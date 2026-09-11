import { test } from 'node:test'
import assert from 'node:assert/strict'

// Lógica pura de facturación venezolana aislada de Supabase.
const {
  validateRif,
  calculateInvoiceTotals,
  formatInvoiceNumber,
  formatControlNumber,
  documentTypeLabel,
  regimenLabel,
  nextNumber,
  isValidEmail,
  isValidPhone,
} = await import('../lib/invoice-calculator.mjs')

// ---------- Validación de RIF ----------


test('acepta un RIF J con dígito verificador correcto', () => {
  // J-12345678-5: según pesos SENIAT → DV 5
  const result = validateRif('J-12345678-5')
  assert.ok(result.valid)
  assert.equal(result.normalized, 'J-12345678-5')
})

test('acepta un RIF sin guiones (formato compacto)', () => {
  const result = validateRif('J123456785')
  assert.ok(result.valid)
  assert.equal(result.normalized, 'J-12345678-5')
})

test('acepta el dígito K cuando el algoritmo produce 10', () => {
  // RIF con DV K (caso válido del SENIAT): suma=12 → 12%11=1 → DV=10=K
  const result = validateRif('J-00000006-K')
  assert.ok(result.valid)
  assert.equal(result.normalized, 'J-00000006-K')
})

test('rechaza un RIF con formato inválido', () => {
  const result = validateRif('J-1234')
  assert.ok(!result.valid)
  assert.match(result.reason ?? '', /Formato inválido/)
})

test('rechaza un RIF con dígito verificador incorrecto', () => {
  const result = validateRif('J-12345678-0')
  assert.ok(!result.valid)
  assert.match(result.reason ?? '', /Dígito verificador/)
})

test('rechaza un RIF vacío o no texto', () => {
  assert.ok(!validateRif('').valid)
  assert.ok(!validateRif(null).valid)
})

// ---------- Desglose de IVA ----------

test('desglosa IVA cuando el precio ya lo incluye (alícuota 16%)', () => {
  // 2 × $36 = $72 con IVA incluido → base = 72 / 1.16 = 62.07, IVA = 9.93
  const totals = calculateInvoiceTotals(
    [{ quantity: 2, unit_price: 36 }],
    16,
    true,
  )
  assert.equal(totals.subtotal, 62.07)
  assert.equal(totals.iva_amount, 9.93)
  assert.equal(totals.total, 72)
})

test('suma IVA cuando el precio es neto (sin IVA incluido)', () => {
  // 1 × $100 neto + 16% IVA → total $116
  const totals = calculateInvoiceTotals([{ quantity: 1, unit_price: 100 }], 16, false)
  assert.equal(totals.subtotal, 100)
  assert.equal(totals.iva_amount, 16)
  assert.equal(totals.total, 116)
})

test('con IVA 0% el total es igual a la base', () => {
  const totals = calculateInvoiceTotals([{ quantity: 3, unit_price: 10 }], 0, true)
  assert.equal(totals.subtotal, 30)
  assert.equal(totals.iva_amount, 0)
  assert.equal(totals.total, 30)
})

test('calcula con múltiples ítems y redondeo a céntimos', () => {
  const totals = calculateInvoiceTotals(
    [
      { quantity: 1, unit_price: 99.99 },
      { quantity: 3, unit_price: 33.33 },
    ],
    16,
    false,
  )
  // Base = 99.99 + 99.99 = 199.98; IVA = 31.9968 → 32.00; total = 231.98
  assert.equal(totals.subtotal, 199.98)
  assert.equal(totals.iva_amount, 32.0)
  assert.equal(totals.total, 231.98)
})

// ---------- Formato de correlativos ----------

test('formatea el número de factura con 8 dígitos', () => {
  assert.equal(formatInvoiceNumber('FAC', '0001', 1), 'FAC-0001-00000001')
  assert.equal(formatInvoiceNumber('FAC', '0001', 999), 'FAC-0001-00000999')
})

test('formatea el número de control', () => {
  assert.equal(formatControlNumber('B', 1), 'B-00000001')
  assert.equal(formatControlNumber('B', 42), 'B-00000042')
})

test('normaliza prefijos y series en el número de factura', () => {
  assert.equal(formatInvoiceNumber('fac', '0001', 3), 'FAC-0001-00000003')
})

test('siguiente correlativo calcula current + 1', () => {
  assert.equal(nextNumber(0), 1)
  assert.equal(nextNumber(99), 100)
})

// ---------- Etiquetas ----------

test('etiquetas de documento y régimen', () => {
  assert.equal(documentTypeLabel('rif'), 'RIF')
  assert.equal(documentTypeLabel('ci'), 'C.I.')
  assert.equal(documentTypeLabel('pasaporte'), 'Pasaporte')
  assert.equal(regimenLabel('contribuyente_formal'), 'Contribuyente Formal')
  assert.equal(regimenLabel('no_contribuyente'), 'No Contribuyente')
})

// ---------- Validaciones simples ----------

test('valida email y teléfono', () => {
  assert.ok(isValidEmail('hola@ilumax.ve'))
  assert.ok(!isValidEmail('no-es-un-email'))
  assert.ok(isValidPhone('+584122649707'))
  assert.ok(!isValidPhone('abc123'))
})