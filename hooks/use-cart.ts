'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { WHATSAPP_NUMBER } from '@/lib/constants'
import { formatBolivars, moneyUsd } from '@/lib/currency'

/** Tipo de producto compatible con el carrito (portada y catálogo). */
export type CartProduct = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  image_url: string
  colors?: string[]
  /** Color seleccionado por el cliente al agregar desde el modal de detalle. */
  selected_color?: string
  specifications?: Record<string, string>
  category_id?: string | null
  featured?: boolean
  categories?: { id: string; name: string; slug: string; description: string | null }[]
  images?: { id: string; url: string; alt_text: string | null; sort_order: number }[]
}

/** Ítem del carrito: producto + cantidad. */
export type CartItem = CartProduct & { quantity: number }

const CART_STORAGE_KEY = 'ilumax-cart'

/**
 * Hook de carrito de compra compartido entre la portada y el catálogo completo.
 * Maneja agregar productos, cambiar cantidades, abrir/cerrar el panel
 * y enviar la solicitud por WhatsApp directamente (sin crear solicitud
 * ni requerir sesión iniciada).
 *
 * El carrito persiste en localStorage, por lo que NO se pierde al navegar
 * entre la portada y el catálogo completo (u otras páginas del sitio).
 *
 * @param exchangeRate Tasa oficial del día para mostrar totales en bolívares.
 */
export function useCart(exchangeRate: number, whatsappNumber?: string) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)

  // Carga el carrito guardado al montar (solo navegador).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[]
        if (Array.isArray(parsed)) setCart(parsed)
      }
    } catch {
      // Si el dato guardado está corrupto, simplemente se ignora.
    }
  }, [])

  // Persiste el carrito cada vez que cambia para conservarlo entre rutas.
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
    } catch {
      // Si localStorage no está disponible, el carrito vive solo en memoria.
    }
  }, [cart])

  /**
   * Agrega un producto al carrito respetando el stock disponible.
   * Si el mismo producto ya está con el mismo color, incrementa la cantidad.
   * Si está con otro color (o sin color), se crea una línea separada.
   */
  const add = useCallback((product: CartProduct) => {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id && item.selected_color === product.selected_color)
      return found
        ? current.map((item) => (item.id === product.id && item.selected_color === product.selected_color ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item))
        : [...current, { ...product, quantity: 1 }]
    })
    setCartOpen(true)
    toast.success(`${product.name} agregado a tu solicitud`)
  }, [])

  /**
   * Cambia la cantidad de un ítem identificado por su id y color;
   * si llega a 0 se elimina del carrito.
   */
  const change = useCallback((id: string, selectedColor: string | undefined, amount: number) => {
    setCart((current) =>
      current
        .map((item) => (item.id === id && item.selected_color === selectedColor ? { ...item, quantity: item.quantity + amount } : item))
        .filter((item) => item.quantity > 0)
    )
  }, [])

  /** Total en USD del carrito. */
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price_usd * item.quantity, 0), [cart])

  /** Cantidad total de piezas en el carrito. */
  const count = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])

  /** Número de WhatsApp para confirmar pedidos (desde site_settings o constante). */
  const whatsapp = (whatsappNumber ?? '').trim() || WHATSAPP_NUMBER

  /** Envía el carrito actual por WhatsApp sin crear solicitud ni requerir sesión. */
  const requestOrder = useCallback(() => {
    // Detalle de los productos: nombre, slug, cantidad, color y precio (solo si es mayor a 0).
    const lines = cart
      .map((item) => {
        const colorText = item.selected_color ? ` (Color: ${item.selected_color})` : ''
        const priceText = item.price_usd > 0 ? ` — ${moneyUsd(item.price_usd * item.quantity)}` : ''
        return `• ${item.name}${colorText} (x${item.quantity})\n  /${item.slug}${priceText}`
      })
      .join('\n')
    const pricedTotal = cart.filter((item) => item.price_usd > 0).reduce((sum, item) => sum + item.price_usd * item.quantity, 0)
    const totalText = pricedTotal > 0 ? `\nTotal: ${moneyUsd(pricedTotal)} / ${formatBolivars(pricedTotal, exchangeRate)}` : ''
    const message = encodeURIComponent(`Hola, deseo cotizar los siguientes productos:\n${lines}${totalText}`)
    window.open(`https://wa.me/${whatsapp}?text=${message}`, '_blank')
    setCart([])
    setCartOpen(false)
    toast.success('Solicitud enviada por WhatsApp.')
  }, [cart, exchangeRate, whatsapp])

  return { cart, add, change, total, count, cartOpen, setCartOpen, requestOrder }
}