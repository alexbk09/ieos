/**
 * Lógica pura de cálculo de precios y validación de solicitudes.
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 */

/**
 * Valida los ítems del carrito contra el catálogo real y calcula el total en USD.
 * @param {Array<{ product_id: string; quantity: number }>} items Ítems del carrito.
 * @param {Array<{ id: string; name: string; price_usd: number; stock: number }>} products Productos reales con stock.
 * @returns {{ items: Array<{ product_id: string; product_name: string; quantity: number; unit_price_usd: number }>; total: number } | { items: null }}
 */
export function normalizeCartItems(items, products) {
  const byId = new Map(products.map((product) => [product.id, product]))

  const normalized = items.map((item) => {
    const product = byId.get(item.product_id)
    const quantity = Number(item.quantity)
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > product.stock) return null
    return {
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price_usd: product.price_usd,
    }
  })

  if (normalized.some((item) => !item)) return { items: null }

  const validItems = normalized
  const total = validItems.reduce((sum, item) => sum + Number(item.unit_price_usd) * item.quantity, 0)
  return { items: validItems, total }
}