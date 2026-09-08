import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeXml, generarXMLFactura, validarXMLFactura } from '../lib/factura-xml.mjs'

const FACTURA = {
  invoice_number: 'FAC-0001-00000001',
  control_number: 'B-00000001',
  issued_at: '2026-08-31T10:00:00Z',
  customer_name: 'María González',
  customer_document: 'V-12345678',
  customer_address: 'Caracas',
  subtotal: 100,
  iva_amount: 16,
  exento_amount: 0,
  total: 116,
  currency: 'USD',
  exchange_rate: 36.82,
  items: [
    { product_name: 'Línea Aura 12W', quantity: 5, unit_price_usd: 20 },
  ],
}

const EMISOR = {
  issuer_name: 'ilumaX C.A.',
  issuer_rif: 'J-00000000-0',
  issuer_address: 'Caracas, Venezuela',
}

test('escapeXml: escapa caracteres XML', () => {
  const amp = '&' + 'amp;'
  const lt = '&' + 'lt;'
  const gt = '&' + 'gt;'
  const quot = '&' + 'quot;'
  const apos = '&' + 'apos;'
  const resultado = escapeXml('A & B < C > D "E" F \'G\'')
  assert.ok(resultado.includes(amp))
  assert.ok(resultado.includes(lt))
  assert.ok(resultado.includes(gt))
  assert.ok(resultado.includes(quot))
  assert.ok(resultado.includes(apos))
  assert.equal(escapeXml(null), '')
  assert.equal(escapeXml(undefined), '')
})

test('generarXMLFactura: incluye campos obligatorios SENIAT', () => {
  const xml = generarXMLFactura(FACTURA, EMISOR)
  assert.ok(xml.includes('<FacturaElectronica'))
  assert.ok(xml.includes('<NumeroFactura>FAC-0001-00000001</NumeroFactura>'))
  assert.ok(xml.includes('<RIF>J-00000000-0</RIF>'))
  assert.ok(xml.includes('<Nombre>María González</Nombre>'))
  assert.ok(xml.includes('<Item>'))
  assert.ok(xml.includes('<Total>116.00</Total>'))
})

test('generarXMLFactura: incluye totales con 2 decimales', () => {
  const xml = generarXMLFactura(FACTURA, EMISOR)
  assert.ok(xml.includes('<Subtotal>100.00</Subtotal>'))
  assert.ok(xml.includes('<IVA>16.00</IVA>'))
  assert.ok(xml.includes('<TasaCambio>36.82</TasaCambio>'))
})

test('validarXMLFactura: acepta XML válido', () => {
  const xml = generarXMLFactura(FACTURA, EMISOR)
  const resultado = validarXMLFactura(xml)
  assert.equal(resultado.valid, true)
  assert.deepEqual(resultado.errores, [])
})

test('validarXMLFactura: rechaza XML incompleto', () => {
  const resultado = validarXMLFactura('<FacturaElectronica><Subtotal>1</Subtotal></FacturaElectronica>')
  assert.equal(resultado.valid, false)
  assert.ok(resultado.errores.length > 0)
})

test('validarXMLFactura: rechaza vacío', () => {
  const resultado = validarXMLFactura('')
  assert.equal(resultado.valid, false)
})