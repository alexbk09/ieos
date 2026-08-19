'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { getBrowserUser } from '@/services/auth-client'
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
 * y enviar la solicitud por WhatsApp con la sesión activa.
 *
 * El carrito persiste en localStorage, por lo que NO se pierde al navegar
 * entre la portada y el catálogo completo (u otras páginas del sitio).
 *
 * @param exchangeRate Tasa oficial del día para mostrar totales en bolívares.
 */
export function useCart(exchangeRate: number) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [requested, setRequested] = useState(false)

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

  /** Agrega un producto al carrito respetando el stock disponible. */
  const add = useCallback((product: CartProduct) => {
    setCart((current) => {
      const found = current.find((item) => item.id === product.id)
      return found
        ? current.map((item) => (item.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item))
        : [...current, { ...product, quantity: 1 }]
    })
    setCartOpen(true)
    toast.success(`${product.name} agregado a tu solicitud`)
  }, [])

  /** Cambia la cantidad de un ítem; si llega a 0 se elimina del carrito. */
  const change = useCallback((id: string, amount: number) => {
    setCart((current) => current.map((item) => (item.id === id ? { ...item, quantity: item.quantity + amount } : item)).filter((item) => item.quantity > 0))
  }, [])

  /** Total en USD del carrito. */
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.price_usd * item.quantity, 0), [cart])

  /** Cantidad total de piezas en el carrito. */
  const count = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])

  /** Envía la solicitud actual por WhatsApp (requiere sesión iniciada). */
  const requestOrder = useCallback(async () => {
    const user = await getBrowserUser()
    if (!user) { toast.error('Inicia sesión para enviar tu solicitud'); setRequested(true); return }
    setSubmitting(true)
    const response = await fetch('/api/solicitudes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart.map((item) => ({ product_id: item.id, quantity: item.quantity })) }),
    })
    const result = await response.json().catch(() => ({}))
    setSubmitting(false)
    if (!response.ok) { toast.error(result.error === 'stock_or_quantity_invalid' ? 'Revisa las cantidades disponibles.' : 'No pudimos crear la solicitud. Inténtalo de nuevo.'); return }
    const message = encodeURIComponent(`Hola ilumaX, mi nombre es ${user.email} y deseo procesar la Solicitud #${result.id}. Adjunto mi carrito con ${count} producto(s). Total: ${moneyUsd(result.total)} / ${formatBolivars(result.total, exchangeRate)}.`)
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank')
    setCart([]); setCartOpen(false); toast.success('Solicitud creada. Abriendo WhatsApp.')
  }, [cart, count, exchangeRate])

  return { cart, add, change, total, count, cartOpen, setCartOpen, submitting, requested, requestOrder }
}