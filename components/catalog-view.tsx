'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { CATALOG_PAGE_SIZE } from '@/lib/constants'
import { LoaderCircle, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import { ProductCard, type CardProduct } from '@/components/product-card'
import { ProductDetailModal } from '@/components/product-detail-modal'
import { SiteHeader, type HeaderBrand, type HeaderNavLink } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CartDrawer } from '@/components/cart-drawer'
import { useCart } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useAgentAddToCart } from '@/hooks/use-agent-add-to-cart'
import { AgentChat } from '@/components/agent-chat'
import { SearchableMultiSelect } from '@/components/ui/select-search'
import { ProductGridSkeleton } from '@/components/ui/skeleton'

type CatalogCategory = { id: string; name: string; slug: string }
type CatalogMarca = { id: string; nombre: string }
type CatalogProduct = {
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
  categories?: { id: string; name: string; slug: string; description: string | null }[]
  images?: { id: string; url: string; alt_text: string | null; sort_order: number; color_name?: string | null }[]
}

/** Convierte el estado de los filtros a parámetros URL comunes. */
function buildParams(filters: {
  from: number
  search: string
  slug: string
  minPrice: string
  maxPrice: string
  categories: string[]
  marcas: string[]
}) {
  const params = new URLSearchParams({ from: String(filters.from) })
  if (filters.search) params.set('search', filters.search)
  if (filters.slug) params.set('slug', filters.slug)
  if (filters.minPrice) params.set('minPrice', filters.minPrice)
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice)
  if (filters.categories.length > 0) params.set('categories', filters.categories.join(','))
  if (filters.marcas.length > 0) params.set('marcas', filters.marcas.join(','))
  return params
}

/** Etiqueta de la sección de filtros. */
function FilterLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
}

/**
 * Vista de catálogo completo con filtros modernos e infinite scroll.
 * Filtros: búsqueda por texto (nombre/slug), rango de precio, categorías
 * y marcas con selección por buscador.
 * Los productos se cargan de 10 en 10 desde /api/catalog.
 * Usa el mismo header compartido que la portada (carrito, modo oscuro y sesión)
 * y el mismo ProductCard para cada producto.
 */
export function CatalogView({
  initialProducts,
  total,
  categories,
  marcas = [],
  navLinks = [],
  brand,
  footer,
  social,
  brandAddress,
}: {
  initialProducts: CatalogProduct[]
  total: number
  categories: CatalogCategory[]
  marcas?: CatalogMarca[]
  navLinks?: HeaderNavLink[]
  brand?: Partial<HeaderBrand>
  footer?: { copyright?: string; slogan?: string }
  social?: { instagram?: string; linkedin?: string; email?: string }
  brandAddress?: string
}) {
  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState('')
  const [slug, setSlug] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedMarcas, setSelectedMarcas] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialProducts.length < total)
  const [totalCount, setTotalCount] = useState(total)
  const [selected, setSelected] = useState<CatalogProduct | null>(null)
  const pageRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Estado compartido con la portada: carrito funcional.
  const exchangeRate = useExchangeRate()
  const { cart, add, change, total: cartTotal, count, cartOpen, setCartOpen, submitting, requested, requestOrder } = useCart(exchangeRate)

  // Escucha el Asistente IA: agrega al carrito si el agente emite agregarAlCarrito.
  useAgentAddToCart(add)


  const activeFilterCount =
    (search ? 1 : 0) + (slug ? 1 : 0) + (minPrice || maxPrice ? 1 : 0) + selectedCategories.length + selectedMarcas.length

  /** Opciones para los selects con buscador. */
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const marcaOptions = marcas.map((m) => ({ value: m.id, label: m.nombre }))

  /** Reinicia y recarga la primera página con los filtros actuales. */
  const resetAndLoad = useCallback(async () => {
    pageRef.current = 0
    setLoading(true)
    const params = buildParams({
      from: 0,
      search,
      slug,
      minPrice,
      maxPrice,
      categories: selectedCategories,
      marcas: selectedMarcas,
    })

    const res = await fetch(`/api/catalog?${params}`)
    const data = await res.json().catch(() => ({ products: [], total: 0, hasMore: false }))
    setProducts(data.products ?? [])
    setTotalCount(data.total ?? 0)
    setHasMore(data.hasMore ?? false)
    setLoading(false)
  }, [search, slug, minPrice, maxPrice, selectedCategories, selectedMarcas])

  /** Carga la siguiente página (infinite scroll). */
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    const next = pageRef.current + CATALOG_PAGE_SIZE
    const params = buildParams({
      from: next,
      search,
      slug,
      minPrice,
      maxPrice,
      categories: selectedCategories,
      marcas: selectedMarcas,
    })

    const res = await fetch(`/api/catalog?${params}`)
    const data = await res.json().catch(() => ({ products: [], hasMore: false }))
    setProducts((prev) => [...prev, ...(data.products ?? [])])
    setHasMore(data.hasMore ?? false)
    pageRef.current = next
    setLoading(false)
  }, [loading, hasMore, search, slug, minPrice, maxPrice, selectedCategories, selectedMarcas])

  // Debounce de los filtros: recarga al escribir.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(resetAndLoad, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, slug, minPrice, maxPrice, selectedCategories, selectedMarcas, resetAndLoad])

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

  /** Limpia todos los filtros activos. */
  function clearFilters() {
    setSearch('')
    setSlug('')
    setMinPrice('')
    setMaxPrice('')
    setSelectedCategories([])
    setSelectedMarcas([])
  }

  const filterPanel = (
    <div className="grid gap-5">
      {/* Buscador por nombre */}
      <label className="grid gap-2">
        <FilterLabel>Buscar producto</FilterLabel>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre o descripción…"
            className="w-full rounded-xl border border-border bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </label>

      {/* Buscador por slug */}
      <label className="grid gap-2">
        <FilterLabel>Slug</FilterLabel>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">/</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="mi-producto"
            className="w-full rounded-xl border border-border bg-transparent py-2.5 pl-7 pr-3 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </label>

      {/* Rango de precio */}
      <div className="grid gap-2">
        <FilterLabel>Precio (USD)</FilterLabel>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder="Mín."
            className="w-full rounded-xl border border-border bg-transparent px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <input
            type="number"
            min="0"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="Máx."
            className="w-full rounded-xl border border-border bg-transparent px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </div>

      {/* Categorías con buscador */}
      {categoryOptions.length > 0 && (
        <div className="grid gap-2">
          <FilterLabel>Categorías</FilterLabel>
          <SearchableMultiSelect
            values={selectedCategories}
            onChange={setSelectedCategories}
            options={categoryOptions}
            placeholder="Todas las categorías"
            searchPlaceholder="Buscar categoría…"
          />
        </div>
      )}

      {/* Marcas con buscador */}
      {marcaOptions.length > 0 && (
        <div className="grid gap-2">
          <FilterLabel>Marcas</FilterLabel>
          <SearchableMultiSelect
            values={selectedMarcas}
            onChange={setSelectedMarcas}
            options={marcaOptions}
            placeholder="Todas las marcas"
            searchPlaceholder="Buscar marca…"
          />
        </div>
      )}

      {/* Acciones */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={resetAndLoad}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-brand hover:text-brand-foreground"
        >
          <Search size={15} /> Aplicar
        </button>
        <button
          onClick={clearFilters}
          disabled={activeFilterCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCcw size={14} /> Limpiar
        </button>
      </div>
    </div>
  )

  // El menú de navegación es el mismo en toda la tienda: lo define SiteHeader (DEFAULT_NAV_LINKS).
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader cartCount={count} onOpenCart={() => setCartOpen(true)} navLinks={navLinks} brand={brand} />

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-5 py-10 lg:grid-cols-[280px_1fr] lg:px-8">
        {/* Panel de filtros: sidebar en desktop, collapsible en móvil */}
        <aside className="h-fit lg:sticky lg:top-24">
          {/* Encabezado del panel */}
          <div className="rounded-t-3xl border border-border bg-card p-5 lg:rounded-3xl lg:p-6">
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className="flex w-full items-center justify-between lg:cursor-default lg:pointer-events-none"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-brand-strong" />
                <h2 className="font-semibold">Filtros</h2>
                {activeFilterCount > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground lg:hidden">{filtersOpen ? 'Ocultar' : 'Mostrar'}</span>
            </button>
            <p className="mt-1 text-xs text-muted-foreground">{totalCount} producto{totalCount !== 1 ? 's' : ''}</p>
          </div>

          {/* Cuerpo del panel */}
          <div
            className={`border-x border-b border-border bg-card p-5 lg:border lg:rounded-3xl lg:p-6 ${
              filtersOpen ? 'block' : 'hidden lg:block'
            } rounded-b-3xl`}
          >
            {filterPanel}
          </div>
        </aside>

        {/* Cuadrícula de productos */}
        <section>
          {loading && products.length === 0 ? (
            <ProductGridSkeleton count={6} />
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product as CardProduct} rate={exchangeRate} onAdd={add} onViewDetails={setSelected} />
                ))}
              </div>

              {hasMore && (
                <div id="catalog-sentinel" className="grid place-items-center py-10">
                  <LoaderCircle className="animate-spin text-brand-strong" size={24} />
                </div>
              )}
              {!hasMore && products.length > 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Has visto todos los productos de ilumaX.
                </p>
              )}
              {!hasMore && products.length === 0 && (
                <div className="grid place-items-center py-24 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">No encontramos productos con esos filtros.</p>
                    <button
                      onClick={clearFilters}
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-brand hover:text-brand-foreground"
                    >
                      <RotateCcw size={14} /> Limpiar filtros
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {selected && (
        <ProductDetailModal
          product={selected as CardProduct}
          rate={exchangeRate}
          onClose={() => setSelected(null)}
          onAdd={(product, unit, quantity, colorName) => add(product, unit, quantity, colorName)}
        />
      )}

      <AgentChat />
      <SiteFooter footer={footer} brand={{ name: brand?.name, address: brandAddress }} social={social} />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onChange={change}
        total={cartTotal}
        onSubmit={requestOrder}
        submitting={submitting}
        requested={requested}
        exchangeRate={exchangeRate}
      />
    </div>
  )
}