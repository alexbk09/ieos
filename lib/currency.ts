/** Utilidades puras de formato de moneda. Seguro para client y server. */

export function moneyUsd(n: number): string {
  return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(n)
}

/**
 * Formatea un monto en EUR con el símbolo € (ej. €9,29).
 *
 * POR QUÉ: los precios importados de AliExpress se guardan YA en euros
 * (servicios como aliApi.ts piden `target_currency: 'EUR'`), así que este
 * formateador expone ese valor real con su moneda correcta además del USD y
 * los bolívares que ya se mostraban. `narrowSymbol` evita el prefijo "EUR " de
 * es-VE y deja solo el símbolo €, manteniendo el separador decimal en coma.
 */
export function moneyEur(n: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'EUR',
    currencyDisplay: 'narrowSymbol',
  }).format(n)
}

export function formatBolivars(amountUsd: number, rate: number): string {
  return `Bs. ${(amountUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatRate(rate: number): string {
  return rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}