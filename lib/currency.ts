/** Utilidades puras de formato de moneda. Seguro para client y server. */

export function moneyUsd(n: number): string {
  return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(n)
}

export function formatBolivars(amountUsd: number, rate: number): string {
  return `Bs. ${(amountUsd * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatRate(rate: number): string {
  return rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}