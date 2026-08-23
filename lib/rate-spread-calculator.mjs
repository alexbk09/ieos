/**
 * Lógica pura del diferencial entre tasa oficial y paralela.
 * Independiente de Supabase. Formato .mjs para tests en Node.
 */

/** Valida un número positivo. Devuelve null si no es válido. */
function toPositiveNumber(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return num
}

/** Diferencia absoluta en Bs entre paralelo y oficial. */
export function rateSpread(officialRate, parallelRate) {
  const official = toPositiveNumber(officialRate)
  const parallel = toPositiveNumber(parallelRate)
  if (official === null || parallel === null) return { spread: null, error: 'Las tasas deben ser números positivos' }
  if (parallel < official) return { spread: null, error: 'La tasa paralela no puede ser menor que la oficial' }
  return { spread: parallel - official, error: null }
}

/** Porcentaje de pérdida: diferencial sobre la tasa paralela. */
export function spreadPercent(officialRate, parallelRate) {
  const official = toPositiveNumber(officialRate)
  const parallel = toPositiveNumber(parallelRate)
  if (official === null || parallel === null) return { percent: null, error: 'Las tasas deben ser números positivos' }
  if (parallel < official) return { percent: null, error: 'La tasa paralela no puede ser menor que la oficial' }
  return { percent: ((parallel - official) / parallel) * 100, error: null }
}

/**
 * Pérdida en USD y Bs por unidad vendida al cobrar con tasa oficial
 * cuando el mercado real (paralelo) está por encima.
 */
export function lossPerProductUnit(priceUsd, officialRate, parallelRate) {
  const price = toPositiveNumber(priceUsd)
  const official = toPositiveNumber(officialRate)
  const parallel = toPositiveNumber(parallelRate)
  if (price === null || official === null || parallel === null) return { lossUsd: null, lossBs: null, error: 'Precio y tasas deben ser números positivos' }
  if (parallel < official) return { lossUsd: null, lossBs: null, error: 'La tasa paralela no puede ser menor que la oficial' }
  const lossUsd = price * (1 - official / parallel)
  const lossBs = price * (parallel - official)
  return { lossUsd, lossBs, error: null }
}