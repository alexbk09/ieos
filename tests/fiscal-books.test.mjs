import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filtrarPorPeriodo, resumirLibroVentas, resumirLibroCompras } from '../lib/fiscal-books.mjs'

const VENTAS = [
  { invoice_number: 'FAC-0001-00000001', subtotal: 100, iva_amount: 16, exento_amount: 0, total: 116, issued_at: '2026-08-01T10:00:00' },
  { invoice_number: 'FAC-0001-00000002', subtotal: 50, iva_amount: 8, exento_amount: 0, total: 58, issued_at: '2026-09-01T10:00:00' },
]

test('filtrarPorPeriodo: filtra por fechas de emisión', () => {
  const agosto = filtrarPorPeriodo(VENTAS, '2026-08-01', '2026-08-31')
  assert.equal(agosto.length, 1)
  assert.equal(agosto[0].invoice_number, 'FAC-0001-00000001')

  const ambos = filtrarPorPeriodo(VENTAS, '2026-08-01', '2026-09-30')
  assert.equal(ambos.length, 2)

  const vacio = filtrarPorPeriodo(VENTAS, '2025-01-01', '2025-12-31')
  assert.equal(vacio.length, 0)
})

test('resumirLibroVentas: suma base, IVA, exento y total', () => {
  const resumen = resumirLibroVentas(VENTAS)
  assert.equal(resumen.cantidad, 2)
  assert.equal(resumen.base_imponible, 150)
  assert.equal(resumen.iva_amount, 24)
  assert.equal(resumen.exento_amount, 0)
  assert.equal(resumen.total, 174)
})

test('resumirLibroCompras: suma facturas de proveedores', () => {
  const compras = [
    { numero_factura: 'FP-001', base_imponible: 80, iva_amount: 12.8, exento_amount: 0, total: 92.8 },
    { numero_factura: 'FP-002', base_imponible: 20, iva_amount: 3.2, exento_amount: 0, total: 23.2 },
  ]
  const resumen = resumirLibroCompras(compras)
  assert.equal(resumen.cantidad, 2)
  assert.equal(resumen.base_imponible, 100)
  assert.equal(resumen.iva_amount, 16)
  assert.equal(resumen.total, 116)
})

test('resumenes con arreglos vacíos', () => {
  assert.deepEqual(resumirLibroVentas([]), { cantidad: 0, base_imponible: 0, iva_amount: 0, exento_amount: 0, total: 0 })
  assert.deepEqual(resumirLibroCompras([]), { cantidad: 0, base_imponible: 0, iva_amount: 0, exento_amount: 0, total: 0 })
})