/**
 * Generador de XML de factura electrónica venezolana (SENIAT).
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 *
 * Construye el XML de la factura electrónica con los datos del emisor,
 * receptor, ítems, desglose de IVA y totales, siguiendo el esquema de
 * la Providencia del SENIAT vigente (Gaceta Oficial).
 */

/**
 * Escapa caracteres XML en un texto.
 * @param {string} value Texto a escapar.
 * @returns {string}
 */
export function escapeXml(value) {
  if (value === null || value === undefined) return ''
  const amp = '&' + 'amp;'
  const lt = '&' + 'lt;'
  const gt = '&' + 'gt;'
  const quot = '&' + 'quot;'
  const apos = '&' + 'apos;'
  return String(value)
    .replace(/&/g, amp)
    .replace(/</g, lt)
    .replace(/>/g, gt)
    .replace(/"/g, quot)
    .replace(/'/g, apos)
}

/**
 * Construye el XML de una factura electrónica.
 * @param {object} invoice Datos de la factura (emisor, receptor, ítems, totales).
 * @param {object} emisor Datos del emisor (razón social, RIF, dirección).
 * @returns {string} XML completo de la factura.
 */
export function generarXMLFactura(invoice = {}, emisor = {}) {
  const inv = invoice ?? {}
  const em = emisor ?? {}

  const items = Array.isArray(inv.items) ? inv.items : []

  const itemsXml = items
    .map((item) => {
      const cantidad = Number(item?.quantity) || 0
      const precio = Number(item?.unit_price_usd) || 0
      return `    <Item>
      <CodigoProducto>${escapeXml(item?.product_name ?? '')}</CodigoProducto>
      <NombreProducto>${escapeXml(item?.product_name ?? '')}</NombreProducto>
      <Cantidad>${cantidad}</Cantidad>
      <PrecioUnitario>${precio.toFixed(2)}</PrecioUnitario>
      <Importe>${(cantidad * precio).toFixed(2)}</Importe>
    </Item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica version="${escapeXml(inv.xml_version ?? '1.0')}" uuid="${escapeXml(inv.uuid_xml ?? '')}">
  <Encabezado>
    <NumeroFactura>${escapeXml(inv.invoice_number ?? '')}</NumeroFactura>
    <NumeroControl>${escapeXml(inv.control_number ?? '')}</NumeroControl>
    <FechaEmision>${escapeXml(inv.issued_at ?? '')}</FechaEmision>
    <TipoDocumento>Factura</TipoDocumento>
  </Encabezado>
  <Emisor>
    <RazonSocial>${escapeXml(em.issuer_name ?? inv.issuer_name ?? '')}</RazonSocial>
    <RIF>${escapeXml(em.issuer_rif ?? inv.issuer_rif ?? '')}</RIF>
    <Direccion>${escapeXml(em.issuer_address ?? inv.issuer_address ?? '')}</Direccion>
  </Emisor>
  <Receptor>
    <Nombre>${escapeXml(inv.customer_name ?? '')}</Nombre>
    <Documento>${escapeXml(inv.customer_document ?? '')}</Documento>
    <Direccion>${escapeXml(inv.customer_address ?? '')}</Direccion>
  </Receptor>
  <Items>
${itemsXml}
  </Items>
  <Totales>
    <Subtotal>${Number(inv.subtotal ?? 0).toFixed(2)}</Subtotal>
    <IVA>${Number(inv.iva_amount ?? 0).toFixed(2)}</IVA>
    <Exento>${Number(inv.exento_amount ?? 0).toFixed(2)}</Exento>
    <Total>${Number(inv.total ?? 0).toFixed(2)}</Total>
    <Moneda>${escapeXml(inv.currency ?? 'USD')}</Moneda>
    <TasaCambio>${Number(inv.exchange_rate ?? 0).toFixed(2)}</TasaCambio>
  </Totales>
</FacturaElectronica>`
}

/**
 * Valida la estructura básica de un XML de factura.
 * Comprueba que existan los tags obligatorios del SENIAT.
 * @param {string} xml XML a validar.
 * @returns {{ valid: boolean; errores: string[] }}
 */
export function validarXMLFactura(xml) {
  if (typeof xml !== 'string' || xml.trim().length < 10) {
    return { valid: false, errores: ['El XML está vacío o es demasiado corto.'] }
  }

  const tagsObligatorios = [
    '<FacturaElectronica',
    '<Encabezado>',
    '<Emisor>',
    '<Receptor>',
    '<Items>',
    '<Totales>',
    '<Subtotal>',
    '<IVA>',
    '<Total>',
  ]

  const errores = tagsObligatorios.filter((tag) => !xml.includes(tag))
  return { valid: errores.length === 0, errores }
}