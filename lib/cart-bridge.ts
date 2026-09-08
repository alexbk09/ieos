// Puente de eventos: permite que el Asistente IA agregue productos al carrito
// SIN acoplar el widget de chat al hook useCart (que vive en cada vista).
export const CART_BRIDGE_EVENT = 'ilumax:add-to-cart'

export type AddToCartPayload = {
  product: Record<string, unknown>
  unit?: string
  quantity?: number
  colorName?: string
}

export function emitAddToCart(payload: AddToCartPayload): void {
  window.dispatchEvent(new CustomEvent<AddToCartPayload>(CART_BRIDGE_EVENT, { detail: payload }))
}