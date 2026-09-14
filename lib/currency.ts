/**
 * Utilidades puras de formato de moneda. Seguro para client y server.
 *
 * REGLA DE MONEDA DE LA VITRINA:
 *  - Los productos de AFILIADO guardan en `price_usd` el precio REAL de
 *    AliExpress en EUR (la API se consulta con `target_currency: 'EUR'`).
 *  - Los productos PROPIOS se guardan en USD.
 * Por eso todo precio público se muestra con `moneyForProduct()`, que convierte
 * el valor almacenado a DÓLARES (tipo de referencia + colchón central definidos
 * en lib/display-price.mjs) y lo formatea con el símbolo $.
 */

import { bolivarReferenceLabel, storedPriceToUsd } from '@/lib/display-price'

export function moneyUsd(n: number): string {
  return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(n)
}

/**
 * Formato de precio en dólares para la VITRINA: "$10,73" (ej. es-VE).
 *
 * POR QUÉ `narrowSymbol`: con el formato por defecto de es-VE el dólar se
 * escribe "USD 10,73"; el símbolo "$" es el que el visitante espera ver en una
 * tarjeta de producto y mantiene la lectura alineada con AliExpress.
 */
export function moneyUsdSymbol(n: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
  }).format(n)
}

export function formatBolivars(amountUsd: number, rate: number): string {
  return `Bs. ${(amountUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatRate(rate: number): string {
  return rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Precio público de un producto, SIEMPRE en dólares.
 *
 * POR QUÉ: el valor guardado puede venir en EUR (afiliados) y la vitrina se lee
 * en $; `storedPriceToUsd` aplica la conversión central (tipo de referencia +
 * colchón) y aquí solo se formatea con el símbolo $.
 *
 * @param amount Monto numérico guardado en `products.price_usd`.
 * @param isAffiliate TRUE si el producto tiene enlace de afiliado.
 * @returns Cadena formateada en dólares (ej. "$10,73").
 */
export function moneyForProduct(amount: number, isAffiliate: boolean): string {
  return moneyUsdSymbol(storedPriceToUsd(amount, isAffiliate))
}

/**
 * Referencia en bolívares de un producto para la vitrina.
 *
 * Convierte PRIMERO el precio almacenado a dólares (misma cifra en $ que ve el
 * usuario) y luego aplica la tasa, para que la equivalencia en Bs nunca
 * contradiga el precio mostrado. Devuelve `null` cuando la vitrina no publica
 * bolívares (interruptor SHOW_BOLIVAR_PRICES) y el componente no renderiza nada.
 *
 * @param amount Monto numérico guardado en `products.price_usd`.
 * @param isAffiliate TRUE si el producto tiene enlace de afiliado.
 * @param rate Tasa USD→Bs vigente.
 * @returns "Bs. 1.234,56" o `null` si no debe mostrarse.
 */
export function bolivarsForProduct(amount: number, isAffiliate: boolean, rate: number): string | null {
  return bolivarReferenceLabel(storedPriceToUsd(amount, isAffiliate), rate)
}