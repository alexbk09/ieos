'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { toGrams } from '@/lib/price-calculator'
import { trackProductEvent, trackAffiliateClick } from '@/lib/analytics-client'
import { PRODUCT_EVENT_TYPES } from '@/lib/constants'

/**
 * Campos de enlace de afiliado soportados por el carrito híbrido.
 * Cada producto puede tener una URL de AliExpress y/o una de Amazon
 * (o la store legada). Se toman desde Supabase al mapear el producto.
 */
export type AffiliateLinks = {
  /** URL de afiliado de AliExpress (con tag de seguimiento). */
  url_afiliado_ali?: string | null
  /** URL de afiliado de Amazon (con tag de seguimiento). */
  url_afiliado_amazon?: string | null
  /** URL de afiliado genérica de la store (legado). */
  url_afiliado_store?: string | null
}

/** Tipo de producto compatible con el carrito (portada y catálogo). */
export type CartProduct = AffiliateLinks & {
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
  /** Tipo de precio: 'unit' (por unidad) o 'weight' (por peso). */
  pricing_type?: 'unit' | 'weight'
  /** Precio por gramo (solo si pricing_type = 'weight'). */
  price_per_gram_usd?: number
  /** Precio por kilo (solo si pricing_type = 'weight'). */
  price_per_kilo_usd?: number
  /** Stock en gramos (solo si pricing_type = 'weight'). */
  stock_grams?: number
  /** Peso mínimo de compra en gramos (solo si pricing_type = 'weight'). */
  min_order_grams?: number
  /** Etiqueta de unidad (u, g, kg…). */
  unit_label?: string
  /** Descuento por mayoreo (%) mostrado como incentivo. */
  bulk_discount_percent?: number
  categories?: { id: string; name: string; slug: string; description: string | null }[]
  images?: { id: string; url: string; alt_text: string | null; sort_order: number; color_name?: string | null }[]
}

/** Ítem del carrito: producto + cantidad + unidad seleccionada. */
export type CartItem = CartProduct & {
  /** ID único del ítem en el carrito: producto + color (si tiene). */
  cartItemId: string
  quantity: number
  /** Unidad de la cantidad: 'g', 'kg' o 'u'. Default: 'u'. */
  unit?: string
  /** Gramos totales (solo si el producto es por peso). */
  weight_grams?: number | null
  /** Color exacto elegido por el cliente en el catálogo (snapshot). */
  color_name?: string | null
}

const CART_STORAGE_KEY = 'zonadehobbies-cart'

/** Detalle de un marketplace de afiliado para la confirmación final. */
export type AffiliateMarket = 'ali' | 'amazon' | 'store'

/**
 * Resuelve la mejor URL de afiliado de un ítem.
 * Prioridad: AliExpress → Amazon → store genérica.
 * @param item Ítem del carrito.
 * @returns URL de afiliado lista para abrir, o null si no tiene ninguna.
 */
export function affiliateUrlFor(item: CartItem): string | null {
  return item.url_afiliado_ali ?? item.url_afiliado_amazon ?? item.url_afiliado_store ?? null
}

/**
 * Hook de carrito de compra compartido entre la portada y el catálogo completo.
 * Maneja agregar productos, cambiar cantidades, abrir/cerrar el panel
 * y finalizar la compra como AFILIADO (AliExpress/Amazon) abriendo
 * los enlaces de afiliado en pestañas nuevas.
 *
 * El carrito persiste en localStorage, por lo que NO se pierde al navegar
 * entre la portada y el catálogo completo (u otras páginas del sitio).
 *
 * NO existe pasarela de pago local: el pago se cierra en el marketplace
 * del afiliado (AliExpress/Amazon) usando la URL de seguimiento guardada
 * en Supabase (url_afiliado_ali / url_afiliado_amazon).
 */
export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  /** Indica si el navegador bloqueó los pop-ups al finalizar la compra. */
  const [popupsBlocked, setPopupsBlocked] = useState(false)

  // Carga el carrito guardado al montar (solo navegador).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[]
        if (Array.isArray(parsed)) {
          // Backfill: los ítems guardados antes de esta versión no tienen
          // cartItemId. Se regenera la clave compuesta producto + color.
          const normalized = parsed.map((item) => ({
            ...item,
            cartItemId: item.cartItemId ?? `${item.id}::${item.color_name ?? ''}`,
          }))
          setCart(normalized)
        }
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

  /** Precio por línea según el tipo (peso = gramos × precio/gramo; unidad = cantidad × precio). */
  function lineTotal(item: CartItem): number {
    const isWeight = item.pricing_type === 'weight'
    if (isWeight) {
      const perGram = Number(item.price_per_gram_usd) || 0
      const grams = item.weight_grams ?? toGrams(item.quantity, item.unit || 'g')
      return grams * perGram
    }
    return item.price_usd * item.quantity
  }

  /**
   * Agrega un producto al carrito respetando el stock disponible.
   * Para 'unit', quantity = cantidad de unidades.
   * Para 'weight', unit = 'g'|'kg' y quantity = peso en esa unidad.
   *
   * El producto conserva sus URLs de afiliado (url_afiliado_ali,
   * url_afiliado_amazon, url_afiliado_store) porque el checkout híbrido
   * las necesita para redirigir al marketplace correspondiente.
   *
   * @param colorName Color exacto elegido en el catálogo (opcional).
   * Si se vuelve a agregar el mismo producto con OTRO color, se crea
   * una línea separada para no mezclar variantes.
   */
  const add = useCallback((product: CartProduct, unit = 'u', quantity?: number, colorName?: string) => {
    const colorKey = colorName ?? null
    // Clave única de línea: producto + color. Permite el mismo producto
    // en colores distintos como líneas separadas en el carrito.
    const cartItemId = `${product.id}::${colorKey ?? ''}`
    setCart((current) => {
      // Busca el ítem existente con la misma clave de línea.
      const found = current.find((item) => item.cartItemId === cartItemId)

      // Producto por peso: la cantidad se maneja en gramos
      if (product.pricing_type === 'weight') {
        const minGrams = Number(product.min_order_grams) || 0
        const maxGrams = Number(product.stock_grams) || 0
        // Determina gramos: si el modal mandó cantidad explícita la usa (g/kg).
        const explicitGrams = quantity != null
          ? toGrams(quantity, unit)
          : (found?.weight_grams ?? Math.max(minGrams, 100))
        // Si ya está en el carrito sin cantidad explícita, agrega otro paso.
        const addGrams = quantity == null && found?.weight_grams ? Math.max(minGrams, 100) : 0
        const newGrams = Math.min(Math.max(explicitGrams + addGrams, minGrams), maxGrams)
        return found
          ? current.map((item) => (item.cartItemId === cartItemId ? { ...item, weight_grams: newGrams, quantity: newGrams, unit: 'g', color_name: colorKey } : item))
          : [...current, { ...product, cartItemId, quantity: newGrams, weight_grams: newGrams, unit: 'g', color_name: colorKey }]
      }

      // Producto por unidad
      const addQty = quantity ?? 1
      return found
        ? current.map((item) => (item.cartItemId === cartItemId ? { ...item, quantity: Math.min(item.quantity + addQty, product.stock), color_name: colorKey } : item))
        : [...current, { ...product, cartItemId, quantity: Math.min(Math.max(1, Math.floor(addQty)), product.stock), unit: 'u', color_name: colorKey }]
    })
    setCartOpen(true)
    toast.success(`${product.name}${colorName ? ` (${colorName})` : ''} agregado a tu selección`)
    // Analítica: registra cada alta al carrito híbrido (local) por producto.
    trackProductEvent(product.id, PRODUCT_EVENT_TYPES.ADD_TO_CART)
  }, [])

  /** Cambia la cantidad de un ítem; si llega a 0 se elimina del carrito. */
  const change = useCallback((cartItemId: string, amount: number) => {
    setCart((current) =>
      current
        .map((item) => {
          if (item.cartItemId !== cartItemId) return item
          const isWeight = item.pricing_type === 'weight'
          if (isWeight) {
            // Para productos por peso, el incremento es de 100g (o el mínimo)
            const step = Math.max(Number(item.min_order_grams) || 0, 100)
            const newGrams = Math.min(
              Math.max((item.weight_grams ?? 0) + step * amount, 0),
              Number(item.stock_grams) || 0,
            )
            return { ...item, weight_grams: newGrams, quantity: newGrams }
          }
          return { ...item, quantity: Math.max(0, item.quantity + amount) }
        })
        .filter((item) => item.quantity > 0 && (item.weight_grams ?? item.quantity) > 0),
    )
  }, [])

  /** Actualiza la cantidad de un ítem a un valor explícito (usado en el modal). */
  const setQuantity = useCallback((cartItemId: string, quantity: number, unit = 'u') => {
    setCart((current) =>
      current.map((item) => {
        if (item.cartItemId !== cartItemId) return item
        const isWeight = item.pricing_type === 'weight'
        if (isWeight) {
          const grams = toGrams(quantity, unit)
          const capped = Math.min(Math.max(grams, Number(item.min_order_grams) || 0), Number(item.stock_grams) || 0)
          return { ...item, quantity: capped, weight_grams: capped, unit: 'g' }
        }
        return { ...item, quantity: Math.max(1, Math.floor(quantity)) }
      }),
    )
  }, [])

  /** Total en USD del carrito. */
  const total = useMemo(() => cart.reduce((sum, item) => sum + lineTotal(item), 0), [cart])

  /** Cantidad total de piezas en el carrito (gramos para peso, unidades para unidad). */
  const count = useMemo(() => cart.reduce((sum, item) => {
    const value = item.pricing_type === 'weight' ? (item.weight_grams ?? item.quantity) : item.quantity
    return sum + value
  }, 0), [cart])

  /**
   * Finaliza la compra en el modo AFILIADO.
   *
   * Recorre los ítems del carrito y abre en pestañas nuevas la URL de
   * afiliado correspondiente (AliExpress, Amazon o store legada).
   *
   * Navegadores modernos bloquean multiples window.open si no ocurren
   * dentro del mismo gesto de usuario. Para evitarlo se abre la PRIMERA
   * URL sincrónicamente (gesto válido) y el resto se difiere con un
   * pequeño intervalo. Si el navegador bloquea igualmente, se activa
   * popupsBlocked=true para que la vista muestre un modal elegante con
   * botones individuales (clic directo = nunca bloqueado).
   *
   * @returns true si al menos una URL se abrió; false si todas fallaron.
   */
  const finishAffiliateCheckout = useCallback((): boolean => {
    const itemsWithLink = cart
      .map((item) => ({ item, url: affiliateUrlFor(item) }))
      .filter((entry): entry is { item: CartItem; url: string } => Boolean(entry.url))

    if (itemsWithLink.length === 0) {
      toast.error('Algunos productos aún no tienen enlace de afiliado', {
        description: 'Contacta al vendedor para completar tu selección.',
      })
      return false
    }

    if (cart.length === 0) {
      toast.error('Tu selección está vacía')
      return false
    }

    // Limpia el estado previo de bloqueo antes de intentar de nuevo.
    setPopupsBlocked(false)

    // Abre las URLs de afiliado. La primera va sincrónica (gesto de click);
    // el resto se programa con un pequeño delay para respetar los límites
    // de cada navegador (ventanas múltiples en un mismo evento).
    // Solo se registra el clic de afiliado cuando window.open devolvió un
    // handle real (la ventana sí se abrió) para no inflar la analítica.
    const openedRef: { url: string }[] = []
    itemsWithLink.forEach((entry, index) => {
      if (index === 0) {
        const win = window.open(entry.url, '_blank', 'noopener,noreferrer')
        if (win) {
          openedRef.push({ url: entry.url })
          trackAffiliateClick(entry.item.id, entry.url)
        }
      } else {
        window.setTimeout(() => {
          const win = window.open(entry.url, '_blank', 'noopener,noreferrer')
          if (win) {
            openedRef.push({ url: entry.url })
            trackAffiliateClick(entry.item.id, entry.url)
          }
        }, index * 300)
      }
    })

    // Verifica después del gesto si algún pop-up fue bloqueado.
    window.setTimeout(() => {
      const allOpened = openedRef.length === itemsWithLink.length
      if (!allOpened) {
        setPopupsBlocked(true)
      } else {
        toast.success('Redirigiendo a AliExpress y Amazon', {
          description: `Se abrieron ${itemsWithLink.length} enlaces de afiliado.`,
        })
      }
    }, 800)

    return true
  }, [cart])

  /** Cierra el carrito y limpia la bandera de pop-ups (usado por el modal). */
  const dismissCheckout = useCallback(() => {
    setCartOpen(false)
    setPopupsBlocked(false)
  }, [])

  /** Vacía el carrito por completo y cierra los estados (tras compra exitosa). */
  const clear = useCallback(() => {
    setCart([])
    setCartOpen(false)
    setPopupsBlocked(false)
  }, [])

  return {
    cart,
    add,
    change,
    setQuantity,
    total,
    count,
    cartOpen,
    setCartOpen,
    popupsBlocked,
    setPopupsBlocked,
    finishAffiliateCheckout,
    dismissCheckout,
    clear,
  }
}
