/**
 * Declaración de tipos para lib/price-calculator.mjs.
 * Soporta productos por unidad y por peso (gramos/kilos).
 */

export type ProductWithPrice = {
  id: string
  name: string
  price_usd: number
  stock: number
  /** 'unit' (por unidad) o 'weight' (por peso). */
  pricing_type?: 'unit' | 'weight'
  /** Precio por gramo (solo si pricing_type = 'weight'). */
  price_per_gram_usd?: number
  /** Stock en gramos (solo si pricing_type = 'weight'). */
  stock_grams?: number
  /** Peso mínimo de compra en gramos (solo si pricing_type = 'weight'). */
  min_order_grams?: number
  /** Etiqueta de la unidad (u, g, kg, m, pkg…). */
  unit_label?: string
}

export type CartItemInput = {
  product_id: string
  quantity: number
  /** Unidad del ítem: 'g', 'kg' o 'u'. Default: 'g' para peso, 'u' para unidad. */
  unit?: string
  /** Color exacto elegido en el catálogo (snapshot, opcional). */
  color_name?: string | null
}

export type NormalizedItem = {
  product_id: string
  product_name: string
  /** Gramos si es por peso, unidades si es por unidad. */
  quantity: number
  unit_price_usd: number
  unit_label: string
  /** Peso total en gramos (solo si es por peso). */
  weight_grams: number | null
  /** Color exacto elegido en el catálogo (snapshot, opcional). */
  color_name?: string | null
}

/**
 * Valida los ítems del carrito contra el catálogo real y calcula el total en USD.
 */
export function normalizeCartItems(
  items: CartItemInput[],
  products: ProductWithPrice[],
): { items: NormalizedItem[]; total: number } | { items: null }

/** Convierte un peso a gramos (kg → ×1000). */
export function toGrams(value: number, unit?: string): number

/** Formatea gramos a etiqueta legible ("500 g", "1.5 kg"). */
export function formatWeight(grams: number): string

/** Calcula el precio de un ítem según su tipo. */
export function priceForItem(
  product: ProductWithPrice,
  quantity: number,
  unit?: string,
): { unit_price_usd: number; subtotal: number; weight_grams: number | null }