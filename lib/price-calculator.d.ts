/**
 * Declaración de tipos para lib/price-calculator.mjs.
 */

export type ProductWithPrice = {
  id: string
  name: string
  price_usd: number
  stock: number
}

export type CartItemInput = {
  product_id: string
  quantity: number
}

export type NormalizedItem = {
  product_id: string
  product_name: string
  quantity: number
  unit_price_usd: number
}

/**
 * Valida los ítems del carrito contra el catálogo real y calcula el total en USD.
 */
export function normalizeCartItems(
  items: CartItemInput[],
  products: ProductWithPrice[],
): { items: NormalizedItem[]; total: number } | { items: null }