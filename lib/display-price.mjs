/**
 * Lógica pura de presentación de precios de la VITRINA pública.
 * ------------------------------------------------------------------
 * POR QUÉ existe este módulo:
 *  1. `products.price_usd` guarda DOS realidades distintas: los productos de
 *     AliExpress (afiliados) se guardan en EUR —la API se consulta con
 *     `target_currency: 'EUR'`— y los productos propios en USD. La vitrina debe
 *     compararse en UNA sola moneda, así que aquí vive la conversión EUR→USD
 *     con su tipo de referencia y su colchón de conversión.
 *  2. La referencia en bolívares se apaga/enciende con un interruptor central
 *     (`SHOW_BOLIVAR_PRICES`) en lugar de dejar decisiones dispersas en los
 *     componentes; así la vitrina puede volver a mostrarla sin tocar la UI.
 *
 * Formato .mjs (mismo patrón que price-calculator.mjs / rate-spread-calculator.mjs)
 * para poder probarse con `node --test` sin compilar TypeScript. Los valores se
 * re-exportan desde lib/constants.ts, que sigue siendo la fuente única de
 * configuración de la app.
 */

/**
 * Tipo de cambio de referencia EUR→USD.
 * POR QUÉ 1.10: es el punto medio de la horquilla reciente EUR/USD. AliExpress
 * aplica su propio tipo cuando el comprador paga en dólares; usar un valor
 * central evita publicar un precio en $ claramente POR DEBAJO del real, que es
 * el peor escenario de confianza (el usuario acepta y al abrir ve más caro).
 */
export const EUR_USD_REFERENCE_RATE = 1.1

/**
 * Colchón de conversión aplicado al precio en dólares (5%).
 * POR QUÉ existe: absorbe la diferencia entre nuestro tipo de referencia y el
 * tipo/cupones que aplica el marketplace según país y forma de pago, sin inflar
 * el precio visible más allá del rango realista. Con 0 la cifra es la conversión
 * exacta; subirlo solo ensancha el margen de seguridad.
 */
export const PRICE_DISPLAY_MARKUP_PERCENT = 0.05

/**
 * Interruptor de la referencia en bolívares de la vitrina.
 * POR QUÉ false: por ahora el precio se comunica ÚNICAMENTE en dólares, así que
 * no se pinta ninguna cifra en Bs ni se consulta la API de la tasa de cambio.
 * Volver a `true` reactiva todas las cifras en Bs y la consulta a
 * /api/exchange-rate sin modificar componentes.
 */
export const SHOW_BOLIVAR_PRICES = false

/**
 * Redondea a 2 decimales (céntimos) evitando los arrastres de coma flotante.
 * @param {number} value Valor a redondear.
 * @returns {number} Valor con 2 decimales (0 si el dato no es numérico).
 */
export function roundUsd(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

/**
 * Convierte el precio ALMACENADO a dólares para mostrarlo en la vitrina.
 *
 * Los productos propios se guardan en USD (se devuelven tal cual); los de
 * AliExpress se guardan en EUR y se convierten con el tipo de referencia más el
 * colchón central, para que el visitante vea una cifra en $ coherente con la
 * conversión del marketplace.
 *
 * @param {number} amount Valor guardado en `products.price_usd`.
 * @param {boolean} [isAffiliate] TRUE si el producto tiene enlace de afiliado.
 * @returns {number} Precio en USD redondeado a 2 decimales (0 si es inválido).
 */
export function storedPriceToUsd(amount, isAffiliate = false) {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (!isAffiliate) return roundUsd(n)
  return roundUsd(n * EUR_USD_REFERENCE_RATE * (1 + PRICE_DISPLAY_MARKUP_PERCENT))
}

/**
 * Etiqueta de referencia en bolívares (Bs.) para la vitrina.
 *
 * Se apoya en el interruptor central: cuando la vitrina no publica Bs devuelve
 * `null` para que el componente no pinte ni el párrafo ni la tasa, evitando
 * bloques vacíos y cifras desactualizadas.
 *
 * @param {number} amountUsd Monto YA convertido a dólares (ver storedPriceToUsd).
 * @param {number} rate Tasa USD→Bs vigente.
 * @param {boolean} [enabled] Interruptor (por defecto el de la vitrina).
 * @returns {string | null} Ej: "Bs. 1.234,56"; `null` si no debe mostrarse.
 */
export function bolivarReferenceLabel(amountUsd, rate, enabled = SHOW_BOLIVAR_PRICES) {
  if (!enabled) return null
  const amount = Number(amountUsd)
  const exchange = Number(rate)
  if (!Number.isFinite(amount) || amount <= 0) return null
  if (!Number.isFinite(exchange) || exchange <= 0) return null
  const bs = (amount * exchange).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `Bs. ${bs}`
}
