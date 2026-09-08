/**
 * Declaración de tipos para lib/shipping-calculator.mjs.
 */

/** Factor aéreo estándar para peso volumétrico (cm³ / kg). */
export const VOLUMETRIC_FACTOR: number

/** Calcula el peso volumétrico de un paquete en kilogramos. */
export function pesoVolumetrico(
  widthCm: number,
  heightCm: number,
  lengthCm: number,
  factor?: number,
): number

/** Convierte gramos a kilogramos (redondeado a 3 decimales). */
export function gramsToKg(grams: number): number

/** Ítem mínimo para calcular el peso de un pedido. */
export type ItemPeso = {
  weight_grams?: number | null
}

/** Calcula el peso total de un pedido en kilogramos. */
export function calcularPesoPedido(items: ItemPeso[] | null): number

/** Rango escalonado de tarifa por peso. */
export type RangoPeso = {
  peso_min_kg: number
  peso_max_kg: number
  tarifa_usd: number
}

/** Zona de envío usada para calcular la tarifa. */
export type ZonaEnvio = {
  tarifa_flat_usd?: number
  tarifa_por_kg_usd?: number
  rangos?: RangoPeso[]
}

/** Resultado del cálculo de tarifa de envío. */
export type ResultadoTarifaEnvio = {
  esPesoVolumetrico: boolean
  pesoFacturableKg: number
  tarifaBaseUsd: number
  tarifaPorKgUsd: number
  totalUsd: number
  rangoAplicado: RangoPeso | null
}

/** Calcula la tarifa de envío según peso y zona. */
export function calcularTarifaEnvio(
  pesoRealKg: number,
  pesoVolumetricoKg?: number,
  zona?: ZonaEnvio,
): ResultadoTarifaEnvio

/** Dimensiones opcionales del paquete. */
export type DimensionesPaquete = {
  widthCm?: number
  heightCm?: number
  lengthCm?: number
}

/** Resultado completo del envío de un pedido. */
export type ResultadoEnvioPedido = ResultadoTarifaEnvio & {
  pesoRealKg: number
  pesoVolumetricoKg: number
}

/** Calcula el envío completo de un pedido (pesos + tarifa). */
export function calcularEnvioPedido(
  items: ItemPeso[] | null,
  zona?: ZonaEnvio,
  dimensiones?: DimensionesPaquete,
): ResultadoEnvioPedido