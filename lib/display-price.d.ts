/**
 * Declaración de tipos para lib/display-price.mjs.
 * Lógica pura de presentación de precios de la vitrina (conversión EUR→USD y
 * referencia en bolívares con interruptor central).
 */

/** Tipo de cambio de referencia EUR→USD (los afiliados se guardan en EUR). */
export const EUR_USD_REFERENCE_RATE: number

/** Colchón de conversión (%) aplicado al precio en dólares de la vitrina. */
export const PRICE_DISPLAY_MARKUP_PERCENT: number

/** Interruptor de la referencia en Bs en la vitrina pública. */
export const SHOW_BOLIVAR_PRICES: boolean

/** Redondea a 2 decimales (céntimos). */
export function roundUsd(value: number): number

/** Convierte el precio almacenado (EUR en afiliados, USD en propios) a dólares. */
export function storedPriceToUsd(amount: number, isAffiliate?: boolean): number

/** Etiqueta "Bs. 1.234,56" o `null` cuando la vitrina no muestra bolívares. */
export function bolivarReferenceLabel(
  amountUsd: number,
  rate: number,
  enabled?: boolean,
): string | null
