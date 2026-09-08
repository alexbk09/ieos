/**
 * Declaración de tipos para lib/factura-xml.mjs.
 */

/** Escapa caracteres XML en un texto. */
export function escapeXml(value: string | number | null | undefined): string

/** Ítem de factura para el XML. */
export type ItemXML = {
  product_name?: string
  quantity?: number
  unit_price_usd?: number
}

/** Factura mínima para generar el XML. */
export type FacturaXML = {
  invoice_number?: string
  control_number?: string | null
  issued_at?: string
  xml_version?: string
  uuid_xml?: string
  issuer_name?: string
  issuer_rif?: string
  issuer_address?: string | null
  customer_name?: string | null
  customer_document?: string | null
  customer_address?: string | null
  subtotal?: number
  iva_amount?: number
  exento_amount?: number
  total?: number
  currency?: string
  exchange_rate?: number
  items?: ItemXML[]
}

/** Datos del emisor para el XML. */
export type EmisorXML = {
  issuer_name?: string
  issuer_rif?: string
  issuer_address?: string | null
}

/** Genera el XML de una factura electrónica SENIAT. */
export function generarXMLFactura(invoice: FacturaXML, emisor: EmisorXML): string

/** Resultado de la validación XML. */
export type ResultadoValidacionXML = {
  valid: boolean
  errores: string[]
}

/** Valida la estructura básica de un XML de factura. */
export function validarXMLFactura(xml: string): ResultadoValidacionXML