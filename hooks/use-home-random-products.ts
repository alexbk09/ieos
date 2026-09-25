'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HOME_PRODUCTS_API_PATH } from '@/lib/constants'
import { useLocale } from '@/components/i18n-provider'

/**
 * Producto normalizado que entrega /api/home-products.
 * La API devuelve la fila completa de Supabase; aquí solo se tipa y normaliza
 * lo que consumen la grilla y la card (`image_url` se convierte a '' porque
 * `ProductCard` no acepta null). Los textos ya llegan en el idioma pedido.
 */
export type HomeStorefrontProduct = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  image_url: string
  colors?: string[]
  peso?: string | null
  tamaño?: string | null
  specifications?: Record<string, string>
  category_id?: string | null
  featured?: boolean
  categories?: { id: string; name: string; slug: string; description: string | null }[]
  images?: { id: string; url: string; alt_text: string | null; sort_order: number; color_name?: string | null }[]
}

/** Respuesta esperada de la API pública del inicio. */
type HomeProductsResponse = { products?: HomeStorefrontProduct[]; error?: string }

/** Normaliza la fila recibida para que la UI no tenga que defenderse de nulls. */
function normalizeHomeProducts(rows: HomeStorefrontProduct[] | undefined): HomeStorefrontProduct[] {
  return (rows ?? []).map((row) => ({
    ...row,
    image_url: row.image_url ?? '',
    colors: row.colors ?? [],
  }))
}

/**
 * Carga la muestra ALEATORIA de productos del inicio.
 * ------------------------------------------------------------------
 * POR QUÉ un hook y no un fetch dentro del componente: la portada es ISR y su
 * HTML llega con una semilla determinista; al montar, este hook pide a la API
 * una selección nueva para que la lista cambie en cada visita (y en cada click
 * de "Ver otros productos") manteniendo el componente libre de detalles de red.
 * - Toda la persistencia/aleatoriedad vive en /services/catalog (vía la API).
 * - Manejo defensivo: `AbortController` cancela la petición anterior (StrictMode
 *   o rebarajado rápido) y cualquier fallo se expone en `error` para que la UI
 *   muestre un aviso visible sin romper la página (la semilla sigue pintada).
 */
export function useHomeRandomProducts() {
  const locale = useLocale()
  const [products, setProducts] = useState<HomeStorefrontProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // Se guarda la petición en curso para abortarla antes de lanzar otra.
  const inFlight = useRef<AbortController | null>(null)

  /** Pide una selección nueva al API. También se expone como `refresh`. */
  const load = useCallback(async () => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    setLoading(true)
    setError(false)

    try {
      const res = await fetch(`${HOME_PRODUCTS_API_PATH}?locale=${encodeURIComponent(locale)}`, {
        // La API del inicio usa una ventana corta de caché para evitar avisar a
        // la base en cada visita, pero aún permite rotación útil sin saturar el servidor.
        cache: 'force-cache',
        signal: controller.signal,
      })
      const data: HomeProductsResponse = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(true)
        return
      }
      setProducts(normalizeHomeProducts(data.products))
    } catch {
      // Los abortos son esperados (navegación o rebarajado): no se reportan.
      if (controller.signal.aborted) return
      setError(true)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [locale])

  useEffect(() => {
    void load()
    return () => inFlight.current?.abort()
  }, [load])

  return { products, loading, error, refresh: load }
}
