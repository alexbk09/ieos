/**
 * Declaración de tipos para lib/margin-net-calculator.mjs.
 */

/** Calcula el ingreso real neto de IVA. */
export function ingresoRealNeto(
  totalVendidoUsd: number,
  tasaIva?: number,
  preciosIncluyenIva?: boolean,
): number

/** Datos de venta de un producto. */
export type VentaProducto = {
  total_vendido_usd: number
  cantidad_vendida: number
}

/** Opciones de cálculo de margen. */
export type OpcionesMargen = {
  tasaIva?: number
  preciosIncluyenIva?: boolean
  otrosCostosUsd?: number
}

/** Resultado del margen neto de un producto. */
export type ResultadoMargenProducto = {
  ingreso_bruto_usd: number
  ingreso_neto_usd: number
  costo_total_usd: number
  otros_costos_usd: number
  ganancia_usd: number
  porcentaje: number
}

/** Calcula el margen neto por producto. */
export function calcularMargenNetoPorProducto(
  venta: VentaProducto,
  costoInicialUsd: number,
  opciones?: OpcionesMargen,
): ResultadoMargenProducto

/** Renglón mínimo para resumir el reporte. */
export type RenglonMargen = {
  ingreso_neto_usd: number
  costo_total_usd: number
  otros_costos_usd: number
  ganancia_usd: number
}

/** Resultado resumido del margen total. */
export type ResumenMargenTotal = {
  ingreso_neto_usd: number
  costo_total_usd: number
  otros_costos_usd: number
  ganancia_usd: number
  porcentaje: number
}

/** Resume el margen total del reporte. */
export function resumirMargenTotal(renglones: RenglonMargen[]): ResumenMargenTotal

/** Calcula el porcentaje de margen de forma segura. */
export function margenPorcentaje(ganancia: number, ingreso: number): number