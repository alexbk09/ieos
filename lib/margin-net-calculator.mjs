/**
 * Lógica pura de cálculo de margen neto.
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 *
 * Deduce el costo inicial del producto (ingresado en la plantilla Excel)
 * para dar la ganancia real del negocio. También descuenta el IVA
 * cuando el precio incluye impuesto y costos adicionales (envío,
 * comisiones de pasarela).
 */

/**
 * Calcula el ingreso real de un producto restando el IVA incluido.
 * Si el precio ya incluye IVA (prices_include_iva), el ingreso real
 * es el neto (total / (1 + tasa)). Si no, el ingreso es el total.
 * @param {number} totalVendidoUsd Total vendido del producto (precio × qty).
 * @param {number} tasaIva Tasa de IVA en % (ej. 16).
 * @param {boolean} preciosIncluyenIva Si el precio ya contiene IVA.
 * @returns {number} Ingreso real neto de IVA.
 */
export function ingresoRealNeto(totalVendidoUsd, tasaIva = 16, preciosIncluyenIva = true) {
  const total = Math.max(0, Number(totalVendidoUsd) || 0)
  const tasa = Math.min(Math.max(Number(tasaIva) || 0, 0), 100)
  if (preciosIncluyenIva && tasa > 0) {
    return Math.round((total / (1 + tasa / 100)) * 100) / 100
  }
  return Math.round(total * 100) / 100
}

/**
 * Calcula el margen neto de un producto.
 * Fórmula: ganancia = ingreso real − (costo inicial × cantidad) − otros costos.
 * @param {{ total_vendido_usd: number; cantidad_vendida: number }} venta Datos de venta.
 * @param {number} costoInicialUsd Costo inicial por unidad del producto.
 * @param {object} opciones Opciones de cálculo.
 * @param {number} [opciones.tasaIva=16] Tasa de IVA en %.
 * @param {boolean} [opciones.preciosIncluyenIva=true] Si el precio incluye IVA.
 * @param {number} [opciones.otrosCostosUsd=0] Envío, comisiones, etc.
 * @returns {{ ingreso_bruto_usd: number; ingreso_neto_usd: number; costo_total_usd: number; otros_costos_usd: number; ganancia_usd: number; porcentaje: number }}
 */
export function calcularMargenNetoPorProducto(venta, costoInicialUsd, opciones = {}) {
  const { tasaIva = 16, preciosIncluyenIva = true, otrosCostosUsd = 0 } = opciones

  const totalVendido = Math.max(0, Number(venta?.total_vendido_usd) || 0)
  const cantidad = Math.max(0, Number(venta?.cantidad_vendida) || 0)
  const costo = Math.max(0, Number(costoInicialUsd) || 0)

  const ingresoBruto = Math.round(totalVendido * 100) / 100
  const ingresoNeto = ingresoRealNeto(totalVendido, tasaIva, preciosIncluyenIva)
  const costoTotal = Math.round(costo * cantidad * 100) / 100
  const otros = Math.max(0, Number(otrosCostosUsd) || 0)

  const ganancia = Math.round((ingresoNeto - costoTotal - otros) * 100) / 100
  const porcentaje = ingresoNeto > 0 ? Math.round((ganancia / ingresoNeto) * 10000) / 100 : 0

  return {
    ingreso_bruto_usd: ingresoBruto,
    ingreso_neto_usd: ingresoNeto,
    costo_total_usd: costoTotal,
    otros_costos_usd: otros,
    ganancia_usd: ganancia,
    porcentaje,
  }
}

/**
 * Resume el margen total de todos los renglones del reporte.
 * @param {Array<{ ingreso_neto_usd: number; costo_total_usd: number; otros_costos_usd: number; ganancia_usd: number }>} renglones
 *   Renglones calculados por calcularMargenNetoPorProducto.
 * @returns {{ ingreso_neto_usd: number; costo_total_usd: number; otros_costos_usd: number; ganancia_usd: number; porcentaje: number }}
 */
export function resumirMargenTotal(renglones = []) {
  const ingreso = renglones.reduce((s, r) => s + (Number(r.ingreso_neto_usd) || 0), 0)
  const costo = renglones.reduce((s, r) => s + (Number(r.costo_total_usd) || 0), 0)
  const otros = renglones.reduce((s, r) => s + (Number(r.otros_costos_usd) || 0), 0)
  const ganancia = Math.round((ingreso - costo - otros) * 100) / 100
  return {
    ingreso_neto_usd: Math.round(ingreso * 100) / 100,
    costo_total_usd: Math.round(costo * 100) / 100,
    otros_costos_usd: Math.round(otros * 100) / 100,
    ganancia_usd: ganancia,
    porcentaje: ingreso > 0 ? Math.round((ganancia / ingreso) * 10000) / 100 : 0,
  }
}

/**
 * Calcula el porcentaje de margen de forma segura.
 * @param {number} ganancia Ganancia.
 * @param {number} ingreso Ingreso neto.
 * @returns {number} Porcentaje (0 si ingreso <= 0).
 */
export function margenPorcentaje(ganancia, ingreso) {
  const g = Number(ganancia) || 0
  const i = Math.max(0, Number(ingreso) || 0)
  return i > 0 ? Math.round((g / i) * 10000) / 100 : 0
}