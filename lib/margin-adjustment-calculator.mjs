/**
 * Lógica pura del módulo "Ajuste de Margen y Control de Pérdidas".
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 */

/** IVA aplicado al precio de venta (16%). */
const IVA_RATE = 0.16

/** Redondea un número a 2 decimales (precisión monetaria). */
export function roundToTwo(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.round((num + Number.EPSILON) * 100) / 100
}

/**
 * Calcula el nuevo costo base (Precio Inicial) aplicando un incremento porcentual.
 * @param {number} costoInicial Costo base actual.
 * @param {number} porcentaje Porcentaje de incremento (ej: 5.5 = 5.5%).
 * @returns {{ precio: number | null, error: string | null }}
 */
export function calcularNuevoPrecioInicial(costoInicial, porcentaje) {
  const costo = Number(costoInicial)
  const pct = Number(porcentaje)
  if (!Number.isFinite(costo) || costo < 0) return { precio: null, error: 'El costo inicial debe ser un número mayor o igual a 0' }
  if (!Number.isFinite(pct) || pct <= 0) return { precio: null, error: 'El porcentaje de incremento debe ser mayor a 0' }
  const nuevo = roundToTwo(costo * (1 + pct / 100))
  return { precio: nuevo, error: null }
}

/**
 * Calcula el Precio de Venta con IVA incluido (16%).
 * Precio Venta = Precio Inicial * 1.16
 * @param {number} precioInicial Precio Inicial (costo base, ya incrementado).
 * @returns {{ precio: number | null, error: string | null }}
 */
export function calcularPrecioVentaConIva(precioInicial) {
  const base = Number(precioInicial)
  if (!Number.isFinite(base) || base < 0) return { precio: null, error: 'El precio inicial debe ser un número mayor o igual a 0' }
  const venta = roundToTwo(base * (1 + IVA_RATE))
  return { precio: venta, error: null }
}

/**
 * Simula el ajuste completo de un producto:
 *  - Precio Inicial Actual (costo_inicial)
 *  - Precio Venta Actual (price_usd)
 *  - Nuevo Precio Inicial Simulado
 *  - Nuevo Precio Venta Simulado (+16% IVA)
 * @param {{ costo_inicial: number, price_usd: number }} producto Producto con costos actuales.
 * @param {number} porcentaje Porcentaje de incremento.
 * @returns {{ simulado: object | null, error: string | null }}
 */
export function simularAjusteProducto(producto, porcentaje) {
  if (!producto || typeof producto.costo_inicial !== 'number' || typeof producto.price_usd !== 'number') {
    return { simulado: null, error: 'Producto inválido: faltan costo_inicial o price_usd' }
  }

  const nuevoInicial = calcularNuevoPrecioInicial(producto.costo_inicial, porcentaje)
  if (nuevoInicial.error) return { simulado: null, error: nuevoInicial.error }

  const nuevoVenta = calcularPrecioVentaConIva(nuevoInicial.precio)
  if (nuevoVenta.error) return { simulado: null, error: nuevoVenta.error }

  return {
    simulado: {
      precio_inicial_actual: roundToTwo(producto.costo_inicial),
      precio_venta_actual: roundToTwo(producto.price_usd),
      nuevo_precio_inicial: nuevoInicial.precio,
      nuevo_precio_venta: nuevoVenta.precio,
    },
    error: null,
  }
}

/**
 * Pérdida por unidad por el aumento de la moneda.
 * Compara la última tasa usada (o tasa actual si no hay historial) contra
 * la nueva tasa ingresada: solo hay pérdida si la moneda subió
 * (nueva tasa > tasa base). Si no subió, la pérdida es 0.
 *
 * Cálculos:
 *  - pérdida Bs  = precio USD * (nueva tasa - tasa base)  → Bs que dejaste de recibir
 *  - pérdida USD = precio USD * (1 - tasa base / nueva tasa)
 *                  → al convertir las Bs recibidas de vuelta a USD a la nueva tasa
 *  - % pérdida   = (1 - tasa base / nueva tasa) * 100   → % del valor de venta perdido
 *
 * @param {number} priceUsd Precio de venta en USD.
 * @param {number} tasaBase Última tasa usada (o tasa actual si no hay historial).
 * @param {number} nuevaTasa Nueva tasa oficial ingresada por el usuario.
 * @returns {{ perdidaBs: number | null, perdidaUsd: number | null, porcentaje: number | null, error: string | null }}
 */
export function calcularPerdidaPorUnidad(priceUsd, tasaBase, nuevaTasa) {
  const precio = Number(priceUsd)
  const base = Number(tasaBase)
  const nueva = Number(nuevaTasa)
  if (!Number.isFinite(precio) || precio <= 0) return { perdidaBs: null, perdidaUsd: null, porcentaje: null, error: 'El precio debe ser mayor a 0' }
  if (!Number.isFinite(base) || base <= 0) return { perdidaBs: null, perdidaUsd: null, porcentaje: null, error: 'La tasa base debe ser mayor a 0' }
  if (!Number.isFinite(nueva) || nueva <= 0) return { perdidaBs: null, perdidaUsd: null, porcentaje: null, error: 'La nueva tasa debe ser mayor a 0' }
  if (nueva <= base) return { perdidaBs: 0, perdidaUsd: 0, porcentaje: 0, error: null }

  const perdidaBs = roundToTwo(precio * (nueva - base))
  const perdidaUsd = roundToTwo(precio * (1 - base / nueva))
  const porcentaje = roundToTwo((1 - base / nueva) * 100)
  return { perdidaBs, perdidaUsd, porcentaje, error: null }
}

/**
 * Porcentaje de incremento sugerido sobre el precio para recuperar la pérdida
 * cuando la moneda sube de tasa base a nueva tasa.
 *
 * Cálculo: (nueva tasa / tasa base - 1) * 100
 * Ejemplo: base 36.5, nueva 40 → 40/36.5 - 1 = 9.59% de aumento sugerido.
 *
 * @param {number} tasaBase Última tasa usada (o tasa actual si no hay historial).
 * @param {number} nuevaTasa Nueva tasa oficial ingresada por el usuario.
 * @returns {{ porcentaje: number | null, error: string | null }}
 */
export function calcularPorcentajeAumentoSugerido(tasaBase, nuevaTasa) {
  const base = Number(tasaBase)
  const nueva = Number(nuevaTasa)
  if (!Number.isFinite(base) || base <= 0) return { porcentaje: null, error: 'La tasa base debe ser mayor a 0' }
  if (!Number.isFinite(nueva) || nueva <= 0) return { porcentaje: null, error: 'La nueva tasa debe ser mayor a 0' }
  if (nueva <= base) return { porcentaje: 0, error: null }
  const porcentaje = roundToTwo((nueva / base - 1) * 100)
  return { porcentaje, error: null }
}
