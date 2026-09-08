/**
 * Declaración de tipos para lib/fiscal-books.mjs.
 */

/** Registro con fecha para filtrar por período. */
export type RegistroFiscal = {
  issued_at?: string
  fecha_emision?: string
  created_at?: string
  [key: string]: unknown
}

/** Filtra registros por período de fechas. */
export function filtrarPorPeriodo<T extends RegistroFiscal>(
  registros: T[],
  inicio: string,
  fin: string,
): T[]

/** Resumen del libro de ventas. */
export type ResumenLibroVentas = {
  cantidad: number
  base_imponible: number
  iva_amount: number
  exento_amount: number
  total: number
}

/** Factura de venta mínima para resumir. */
export type FacturaVenta = {
  subtotal?: number
  iva_amount?: number
  exento_amount?: number
  total?: number
}

/** Resume el libro de ventas desde invoices. */
export function resumirLibroVentas(invoices: FacturaVenta[]): ResumenLibroVentas

/** Factura de compra mínima para resumir. */
export type FacturaCompra = {
  base_imponible?: number
  iva_amount?: number
  exento_amount?: number
  total?: number
}

/** Resume el libro de compras desde facturas de proveedores. */
export function resumirLibroCompras(facturas: FacturaCompra[]): ResumenLibroVentas