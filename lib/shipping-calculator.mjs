/**
 * Lógica pura de cálculo de envío por zonas (delivery dinámico).
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 *
 * Cubre:
 *  - Peso volumétrico para paquetería (factor aéreo estándar 5000)
 *  - Cálculo de tarifa según rangos de peso o tarifa base + por kg
 *  - Peso real de un pedido (suma weight_grams de los ítems)
 */

/** Factor aéreo estándar para peso volumétrico (cm³ / kg). */
export const VOLUMETRIC_FACTOR = 5000

/**
 * Calcula el peso volumétrico de un paquete en kilogramos.
 * Fórmula estándar aérea: (ancho × alto × largo) / 5000.
 * Se usa el peso mayor entre el real y el volumétrico para facturar.
 * @param {number} widthCm Ancho en centímetros.
 * @param {number} heightCm Alto en centímetros.
 * @param {number} lengthCm Largo en centímetros.
 * @param {number} factor Factor de conversión (5000 estándar aéreo).
 * @returns {number} Peso volumétrico en kg (0 si los datos son inválidos).
 */
export function pesoVolumetrico(widthCm, heightCm, lengthCm, factor = VOLUMETRIC_FACTOR) {
  const w = Number(widthCm) || 0
  const h = Number(heightCm) || 0
  const l = Number(lengthCm) || 0
  const f = Number(factor) || VOLUMETRIC_FACTOR
  if (w <= 0 || h <= 0 || l <= 0 || f <= 0) return 0
  return (w * h * l) / f
}

/**
 * Convierte gramos a kilogramos (redondeado a 3 decimales).
 * @param {number} grams Peso en gramos.
 * @returns {number} Peso en kg.
 */
export function gramsToKg(grams) {
  const g = Number(grams) || 0
  if (g <= 0) return 0
  return Math.round((g / 1000) * 1000) / 1000
}

/**
 * Calcula el peso total de un pedido en kilogramos.
 * Suma el campo weight_grams de cada ítem (peso real ya existente en
 * solicitud_items según la migración 0027).
 * @param {Array<{ weight_grams?: number }>} items Ítems del pedido.
 * @returns {number} Peso total en kg.
 */
export function calcularPesoPedido(items) {
  if (!Array.isArray(items)) return 0
  const totalGrams = items.reduce((sum, item) => sum + (Number(item?.weight_grams) || 0), 0)
  return Math.round((totalGrams / 1000) * 1000) / 1000
}

/**
 * Redondea un monto a 2 decimales (céntimos).
 * @param {number} value Monto a redondear.
 * @returns {number}
 */
function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

/**
 * Calcula la tarifa de envío para una zona y peso dado.
 * Reglas:
 *  1. Si el peso cae dentro de un rango configurado (peso_min_kg a
 *     peso_max_kg), se usa la tarifa escalonada del rango.
 *  2. Si no hay rango, se usa la tarifa plana + (peso × tarifa por kg).
 *  3. El peso a facturar es el mayor entre el real y el volumétrico.
 * @param {number} pesoRealKg Peso real en kg.
 * @param {number|undefined} pesoVolumetricoKg Peso volumétrico en kg.
 * @param {{ tarifa_flat_usd?: number; tarifa_por_kg_usd?: number; rangos?: Array<{ peso_min_kg: number; peso_max_kg: number; tarifa_usd: number }> }} zona
 *   Datos de la zona de envío (tarifa_flat_usd, tarifa_por_kg_usd, rangos).
 * @returns {{ esPesoVolumetrico: boolean; pesoFacturableKg: number; tarifaBaseUsd: number; tarifaPorKgUsd: number; totalUsd: number; rangoAplicado: { peso_min_kg: number; peso_max_kg: number; tarifa_usd: number } | null }}
 */
export function calcularTarifaEnvio(pesoRealKg, pesoVolumetricoKg, zona = {}) {
  const real = Math.max(0, Number(pesoRealKg) || 0)
  const volumetrico = Math.max(0, Number(pesoVolumetricoKg) || 0)
  const esPesoVolumetrico = volumetrico > real
  const pesoFacturable = esPesoVolumetrico ? volumetrico : real

  // Buscar rango escalonado que contenga el peso facturable.
  const rangos = Array.isArray(zona.rangos) ? zona.rangos : []
  let rangoAplicado = null
  for (const rango of rangos) {
    const min = Number(rango.peso_min_kg) || 0
    const max = Number(rango.peso_max_kg) || Infinity
    if (pesoFacturable >= min && pesoFacturable < max) {
      rangoAplicado = rango
      break
    }
  }

  const tarifaFlat = Number(zona.tarifa_flat_usd) || 0
  const tarifaPorKg = Number(zona.tarifa_por_kg_usd) || 0

  // Si hay rango, la tarifa es fija; si no, plana + variable por kg.
  const totalUsd = rangoAplicado
    ? Number(rangoAplicado.tarifa_usd) || 0
    : round2(tarifaFlat + pesoFacturable * tarifaPorKg)

  return {
    esPesoVolumetrico,
    pesoFacturableKg: Math.round(pesoFacturable * 1000) / 1000,
    tarifaBaseUsd: round2(tarifaFlat),
    tarifaPorKgUsd: round2(tarifaPorKg),
    totalUsd: round2(totalUsd),
    rangoAplicado: rangoAplicado
      ? {
          peso_min_kg: Number(rangoAplicado.peso_min_kg) || 0,
          peso_max_kg: Number(rangoAplicado.peso_max_kg) || 0,
          tarifa_usd: Number(rangoAplicado.tarifa_usd) || 0,
        }
      : null,
  }
}

/**
 * Calcula el envío completo de un pedido: peso real + peso volumétrico
 * opcional + tarifa según zona.
 * @param {Array<{ weight_grams?: number }>} items Ítems del pedido.
 * @param {{ tarifa_flat_usd?: number; tarifa_por_kg_usd?: number; rangos?: Array<{ peso_min_kg: number; peso_max_kg: number; tarifa_usd: number }> }} zona
 *   Datos de la zona.
 * @param {{ widthCm?: number; heightCm?: number; lengthCm?: number }} dimensiones
 *   Dimensiones opcionales del paquete (para peso volumétrico).
 * @returns {{ pesoRealKg: number; pesoVolumetricoKg: number; ...resultado }}
 */
export function calcularEnvioPedido(items, zona = {}, dimensiones = {}) {
  const pesoRealKg = calcularPesoPedido(items)
  const pesoVolumetricoKg = dimensiones
    ? pesoVolumetrico(dimensiones.widthCm, dimensiones.heightCm, dimensiones.lengthCm)
    : 0
  const resultado = calcularTarifaEnvio(pesoRealKg, pesoVolumetricoKg, zona)
  return {
    pesoRealKg,
    pesoVolumetricoKg,
    ...resultado,
  }
}