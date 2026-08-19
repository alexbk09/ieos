'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CATALOG_PAGE_SIZE } from '@/lib/constants'
import { LoaderCircle, Search } from 'lucide-react'
import { ProductCard, type CardProduct } from '@/components/product-card'
import { ProductDetailModal } from '@/components/product-detail-modal'
import { SiteHeader } from '@/components/site-header'
import { CartDrawer } from '@/components/cart-drawer'
import { useCart } from '@/hooks/use-cart'
import { useDarkMode } from '@/hooks/use-dark-mode'

type CatalogCategory = { id: string; name: string; slug: string }
type CatalogProduct = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  image_url: string
  colors?: string[]
  specifications?: Record<string, string>
  categories?: { id: string; name: string; slug: string; description: string | null }[]
  images?: { id: string; url: string; alt_text: string | null; sort_order: number }[]
}

/**
 * Vista de catálogo completo con filtros e infinite scroll.
 * Carga productos de 10 en 10 desde /api/catalog.
 * Usa el mismo header compartido que la portada (carrito, modo oscuro y sesión)
 * y el mismo ProductCard para cada producto.
 */
export function CatalogView({ initialProducts, total, categories, exchangeRate }: {
  initialProducts: CatalogProduct[]
  total: number
  categories: CatalogCategory[]
  exchangeRate: number
}) {
  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState('')
  const [slug, setSlug] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialProducts.length < total)
  const [totalCount, setTotalCount] = useState(total)
  const [selected, setSelected] = useState<CatalogProduct | null>(null)
  const pageRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Estado compartido con la portada: carrito funcional y modo oscuro persistente.
  const { dark, toggle } = useDarkMode()
  const { cart, add, change, total: cartTotal, count, cartOpen, setCartOpen, submitting, requested, requestOrder } = useCart(exchangeRate)

  /** Reinicia y recarga la primera página con los filtros actuales. */
  const resetAndLoad = useCallback(async () => {
    pageRef.current = 0
    setLoading(true)
    const params = new URLSearchParams({ from: '0' })
    if (search) params.set('search', search)
    if (slug) params.set('slug', slug)
    if (minPrice) params.set('minPrice', minPrice)
    if (maxPrice) params.set('maxPrice', maxPrice)
    if (selectedCategories.length > 0) params.set('categories', selectedCategories.join(','))

    const res = await fetch(`/api/catalog?${params}`)
    const data = await res.json().catch(() => ({ products: [], total: 0, hasMore: false }))
    setProducts(data.products ?? [])
    setTotalCount(data.total ?? 0)
    setHasMore(data.hasMore ?? false)
    setLoading(false)
  }, [search, slug, minPrice, maxPrice, selectedCategories])

  /** Carga la siguiente página (infinite scroll). */
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    const next = pageRef.current + CATALOG_PAGE_SIZE
    const params = new URLSearchParams({ from: String(next) })
    if (search) params.set('search', search)
    if (slug) params.set('slug', slug)
    if (minPrice) params.set('minPrice', minPrice)
    if (maxPrice) params.set('maxPrice', maxPrice)
    if (selectedCategories.length > 0) params.set('categories', selectedCategories.join(','))

    const res = await fetch(`/api/catalog?${params}`)
    const data = await res.json().catch(() => ({ products: [], hasMore: false }))
    setProducts((prev) => [...prev, ...(data.products ?? [])])
    setHasMore(data.hasMore ?? false)
    pageRef.current = next
    setLoading(false)
  }, [loading, hasMore, search, slug, minPrice, maxPrice, selectedCategories])

  // Debounce de los filtros de texto: recarga al escribir.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(resetAndLoad, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, slug, minPrice, maxPrice, selectedCategories, resetAndLoad])

  // Intersection Observer para infinite scroll.
  useEffect(() => {
    const sentinel = document.getElementById('catalog-sentinel')
    if (!sentinel) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMore()
    }, { rootMargin: '200px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  /** Alterna una categoría en el filtro. */
  function toggleCategory(id: string) {
    setSelectedCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  // El menú de navegación es el mismo en toda la tienda: lo define SiteHeader (DEFAULT_NAV_LINKS).
  return (
    <div className={dark ? 'dark min-h-screen bg-slate-950 text-slate-50' : 'min-h-screen bg-slate-50 text-slate-950'}>
      <SiteHeader dark={dark} onToggleDark={toggle} cartCount={count} onOpenCart={() => setCartOpen(true)} />

      <main className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[280px_1fr] lg:px-8">
        {/* Panel de filtros */}
        <aside className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 h-fit lg:sticky lg:top-24">
          <h2 className="font-semibold">Filtros</h2>
          <p className="mt-1 text-xs text-slate-500">{totalCount} productos</p>

          <div className="mt-6 grid gap-5">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Nombre</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre…" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-cyan-500 dark:border-slate-700" />
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium">Slug</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="/mi-producto" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-cyan-500 dark:border-slate-700" />
            </label>

            <div className="grid grid-cols-1 gap-3">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Precio mín.</span>
                <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="0" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-cyan-500 dark:border-slate-700" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Precio máx.</span>
                <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="999" className="rounded-xl border border-slate-200 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-cyan-500 dark:border-slate-700" />
              </label>
            </div>

            <div className="grid gap-2 text-sm">
              <span className="font-medium">Categorías</span>
              <div className="grid max-h-48 gap-1.5 overflow-y-auto pr-1">
                {categories.map((cat) => (
                  <label key={cat.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <input type="checkbox" checked={selectedCategories.includes(cat.id)} onChange={() => toggleCategory(cat.id)} className="accent-cyan-500" />
                    <span className="text-sm">{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <button onClick={resetAndLoad} className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-950 px-4 py-2.5 text-sm text-white">
              <Search size={15} /> Aplicar filtros
            </button>
          </div>
        </aside>

        {/* Cuadrícula de productos */}
        <section>
          {loading && products.length === 0 ? (
            <div className="grid place-items-center py-24"><LoaderCircle className="animate-spin text-cyan-600" size={28} /></div>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product as CardProduct} rate={exchangeRate} onAdd={add} onViewDetails={setSelected} />
                ))}
              </div>

              {hasMore && <div id="catalog-sentinel" className="grid place-items-center py-10"><LoaderCircle className="animate-spin text-cyan-600" size={24} /></div>}
              {!hasMore && products.length > 0 && <p className="py-8 text-center text-sm text-slate-400">Has visto todos los productos de ilumaX.</p>}
              {!hasMore && products.length === 0 && <p className="py-24 text-center text-sm text-slate-400">No encontramos productos con esos filtros.</p>}
            </>
          )}
        </section>
      </main>

      {selected && (
        <ProductDetailModal product={selected as CardProduct} rate={exchangeRate} onClose={() => setSelected(null)} onAdd={add} />
      )}

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} onChange={change} total={cartTotal} onSubmit={requestOrder} submitting={submitting} requested={requested} exchangeRate={exchangeRate} />
    </div>
  )
}