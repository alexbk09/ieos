'use client'

import { useEffect, useRef } from 'react'
import { CART_BRIDGE_EVENT, type AddToCartPayload } from '@/lib/cart-bridge'
import type { CartProduct } from '@/hooks/use-cart'

/**
 * Escucha los eventos del Asistente de Compra (IA).
 * Cuando el agente emite agregarAlCarrito via onToolCall, la vista de tienda
 * actual (portada o catalogo) ejecuta su propio add() -> drawer + toast global.
 */
export function useAgentAddToCart(
  add: (product: CartProduct, unit?: string, quantity?: number, colorName?: string) => void,
) {
  const addRef = useRef(add)
  addRef.current = add

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AddToCartPayload>).detail
      const product = detail?.product as unknown as CartProduct | undefined
      if (!product?.id) return
      addRef.current(product, detail.unit ?? 'u', detail.quantity, detail.colorName)
    }
    window.addEventListener(CART_BRIDGE_EVENT, handler)
    return () => window.removeEventListener(CART_BRIDGE_EVENT, handler)
  }, [])
}
