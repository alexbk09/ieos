/**
 * Declaración de tipos para lib/rate-spread-calculator.mjs.
 */

/** Diferencia absoluta en Bs entre paralelo y oficial. */
export function rateSpread(
  officialRate: number,
  parallelRate: number,
): { spread: number | null; error: string | null }

/** Porcentaje de pérdida: diferencial sobre la tasa paralela. */
export function spreadPercent(
  officialRate: number,
  parallelRate: number,
): { percent: number | null; error: string | null }

/** Pérdida en USD y Bs por unidad vendida con tasa oficial vs paralela. */
export function lossPerProductUnit(
  priceUsd: number,
  officialRate: number,
  parallelRate: number,
): { lossUsd: number | null; lossBs: number | null; error: string | null }