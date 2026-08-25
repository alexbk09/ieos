/**
 * Declaración de tipos para lib/margin-adjustment-calculator.mjs.
 */

/** Resultado de redondeo monetario. */
export function roundToTwo(value: number): number | null

/** Resultado del nuevo precio inicial. */
export function calcularNuevoPrecioInicial(
  costoInicial: number,
  porcentaje: number,
): { precio: number | null; error: string | null }

/** Resultado del precio de venta con IVA. */
export function calcularPrecioVentaConIva(
  precioInicial: number,
): { precio: number | null; error: string | null }

/** Producto mínimo requerido para simular un ajuste. */
export type ProductoAjustable = {
  costo_inicial: number
  price_usd: number
}

/** Resultado de la simulación de un producto. */
export type SimulacionProducto = {
  precio_inicial_actual: number
  precio_venta_actual: number
  nuevo_precio_inicial: number
  nuevo_precio_venta: number
}

/** Simula el ajuste completo de un producto. */
export function simularAjusteProducto(
  producto: ProductoAjustable,
  porcentaje: number,
): { simulado: SimulacionProducto | null; error: string | null }

/**
 * Pérdida por unidad por el aumento de la moneda.
 * Compara la última tasa usada (o tasa actual si no hay historial) contra
 * la nueva tasa ingresada: solo hay pérdida si la moneda subió.
 * Si no subió, devuelve perdidaBs = perdidaUsd = porcentaje = 0.
 */
export function calcularPerdidaPorUnidad(
  priceUsd: number,
  tasaBase: number,
  nuevaTasa: number,
): {
  perdidaBs: number | null
  perdidaUsd: number | null
  porcentaje: number | null
  error: string | null
}

/** Porcentaje de incremento sugerido para recuperar la pérdida por subida de la moneda. */
export function calcularPorcentajeAumentoSugerido(
  tasaBase: number,
  nuevaTasa: number,
): { porcentaje: number | null; error: string | null }
