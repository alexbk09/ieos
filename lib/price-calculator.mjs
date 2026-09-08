/**
 * Lógica pura de cálculo de precios y validación de solicitudes.
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 *
 * Soporta dos tipos de precio:
 *  - 'unit'   → precio_usd por unidad (stock en unidades).
 *  - 'weight' → price_per_gram_usd por gramo (stock_grams en gramos).
 *              La cantidad de un ítem se expresa en gramos.
 */

/**
 * Convierte un peso a gramos según su unidad.
 * @param {number} value Valor numérico.
 * @param {string} unit Unidad: 'g', 'kg', 'u' (default 'g').
 * @returns {number} Gramos.
 */
export function toGrams(value, unit = 'g') {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  const u = String(unit).trim().toLowerCase()
  if (u === 'kg') return n * 1000
  return n // gramos o cualquier otra unidad no convertible
}

/**
 * Formatea un peso en gramos a una etiqueta legible (g o kg).
 * @param {number} grams Peso en gramos.
 * @returns {string} Ej: "500 g", "1.25 kg".
 */
export function formatWeight(grams) {
  const n = Number(grams) || 0
  if (n >= 1000) {
    const kg = n / 1000
    return `${Number(kg.toFixed(3)).toString()} kg`
  }
  return `${Math.round(n)} g`
}

/**
 * Calcula el precio de un ítem según su tipo de precio.
 * @param {object} product Producto real (pricing_type, price_per_gram_usd, price_usd).
 * @param {number} quantity Cantidad (gramos si es weight, unidades si es unit).
 * @param {string} unit Unidad del ítem ('g', 'kg', 'u').
 * @returns {{ unit_price_usd: number; subtotal: number; weight_grams: number | null }}
 */
export function priceForItem(product, quantity, unit = 'u') {
  const isWeight = product.pricing_type === 'weight'
  if (isWeight) {
    const grams = toGrams(quantity, unit)
    const unitPrice = Number(product.price_per_gram_usd) || 0
    return {
      unit_price_usd: unitPrice,
      subtotal: grams * unitPrice,
      weight_grams: grams,
    }
  }
  const qty = Number(quantity) || 0
  const unitPrice = Number(product.price_usd) || 0
  return {
    unit_price_usd: unitPrice,
    subtotal: qty * unitPrice,
    weight_grams: null,
  }
}

/**
 * Valida los ítems del carrito contra el catálogo real y calcula el total en USD.
 *
 * Para productos por peso:
 *  - La cantidad del carrito se interpreta en la unidad elegida (g/kg).
 *  - Se valida el peso mínimo (min_order_grams) y el stock en gramos.
 *  - La cantidad guardada en la BD (solicitud_items.quantity) SIEMPRE se
 *    normaliza a gramos para que el trigger de stock funcione bien.
 *
 * El color seleccionado (color_name) se propaga tal cual si viene en el ítem.
 *
 * @param {Array<{ product_id: string; quantity: number; unit?: string; color_name?: string | null }>} items Ítems del carrito.
 * @param {Array<{ id: string; name: string; price_usd: number; stock: number }>} products Productos reales con stock.
 * @returns {{ items: Array<{ product_id: string; product_name: string; quantity: number; unit_price_usd: number; unit_label: string; weight_grams: number | null; color_name?: string | null }>; total: number } | { items: null }}
 */
export function normalizeCartItems(items, products) {
  const byId = new Map(products.map((product) => [product.id, product]))

  const normalized = items.map((item) => {
    const product = byId.get(item.product_id)
    if (!product) return null

    const isWeight = product.pricing_type === 'weight'
    const unit = item.unit || (isWeight ? 'g' : 'u')
    const quantity = Number(item.quantity)
    // Color seleccionado en el catálogo (opcional, snapshot texto).
    const colorName = item.color_name || null

    if (isWeight) {
      // Peso en gramos de la línea.
      const grams = toGrams(quantity, unit)
      // Debe ser un número positivo y cumplir el mínimo de compra.
      const minGrams = Number(product.min_order_grams) || 0
      if (!Number.isFinite(quantity) || quantity <= 0 || grams < minGrams) return null
      // No debe superar el stock disponible en gramos.
      if (grams > Number(product.stock_grams)) return null
      // Precio por gramo del catálogo.
      const unitPrice = Number(product.price_per_gram_usd) || 0
      return {
        product_id: product.id,
        product_name: product.name,
        // SIEMPRE gramos para el trigger de stock.
        quantity: grams,
        unit_price_usd: unitPrice,
        unit_label: 'g',
        weight_grams: grams,
        color_name: colorName,
      }
    }

    // Producto por unidad.
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > product.stock) return null
    return {
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      unit_price_usd: Number(product.price_usd),
      unit_label: product.unit_label || 'u',
      weight_grams: null,
      color_name: colorName,
    }
  })

  if (normalized.some((item) => !item)) return { items: null }

  const validItems = normalized
  const total = validItems.reduce((sum, item) => {
    const qty = item.weight_grams ?? item.quantity
    return sum + Number(item.unit_price_usd) * qty
  }, 0)
  return { items: validItems, total }
}