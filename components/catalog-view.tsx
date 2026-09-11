'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  CATALOG_EMPTY_STATE_CATEGORY_SUGGESTIONS,
  CATALOG_FILTER_DEBOUNCE_MS,
  CATALOG_PAGE_SIZE,
  CATALOG_SORT_OPTIONS,
  DEFAULT_CATALOG_SORT,
  SEARCH_LOG_SOURCES,
  type CatalogSortValue,
} from '@/lib/constants'
import { trackSearchLog } from '@/lib/analytics-client'
import { ArrowUpDown, LoaderCircle, RotateCcw, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { ProductCard, type CardProduct } from '@/components/product-card'
import { ProductDetailModal } from '@/components/product-detail-modal'
import { SiteHeader, type HeaderBrand, type HeaderNavLink } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CartDrawer } from '@/components/cart-drawer'
import { AffiliateRedirectModal } from '@/components/affiliate-redirect-modal'
import { useCart } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useAgentAddToCart } from '@/hooks/use-agent-add-to-cart'
import { SearchableMultiSelect } from '@/components/ui/select-search'
import { ProductGridSkeleton } from '@/components/ui/skeleton'
import { useLocale } from '@/components/i18n-provider'
import { useTranslations } from '@/hooks/use-translations'

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
  /** Marca resuelta por la relación FK (chip en la card y filtro por marca). */
  marca?: { id: string; nombre: string; activa: boolean } | null
}

/** Convierte el snapshot de filtros a los parámetros de la API de catálogo. */
function buildParams(filters: {
  from: number
  search: string
  minPrice: string
  maxPrice: string
  categories: string[]
  marcas: string[]
  /** Orden elegido por el usuario (ver CATALOG_SORT_OPTIONS). */
  sort: CatalogSortValue
  /** Idioma activo: el API resuelve nombre/título SEO traducidos. */
  locale?: string
}) {
  const params = new URLSearchParams({ from: String(filters.from) })
  if (filters.search) params.set('search', filters.search)
  if (filters.minPrice) params.set('minPrice', filters.minPrice)
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice)
  if (filters.categories.length > 0) params.set('categories', filters.categories.join(','))
  if (filters.marcas.length > 0) params.set('marcas', filters.marcas.join(','))
  // Solo se envía el orden cuando NO es el de por defecto, para no fragmentar la caché.
  if (filters.sort && filters.sort !== DEFAULT_CATALOG_SORT) params.set('sort', filters.sort)
  if (filters.locale) params.set('locale', filters.locale)
  return params
}

/** Etiqueta legible de un rango de precio para el chip de filtro (USD). */
function formatPriceRange(min: string, max: string): string {
  if (min && max) return `${min} – ${max} USD`
  if (min) return `≥ ${min} USD`
  return `≤ ${max} USD`
}

/** Etiqueta de la sección de filtros. */
function FilterLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
}

/**
 * Vista de catálogo completo con filtros modernos e infinite scroll.
 * Filtros: búsqueda por texto (nombre/descripción), rango de precio, categorías
 * y marcas con selección por buscador, más un selector de ORDEN (relevancia,
 * mejor valorados, precio, novedades) que viaja en la query de /api/catalog.
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
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedMarcas, setSelectedMarcas] = useState<string[]>([])
  const [sort, setSort] = useState<CatalogSortValue>(DEFAULT_CATALOG_SORT)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialProducts.length < total)
  const [totalCount, setTotalCount] = useState(total)
  const [selected, setSelected] = useState<CatalogProduct | null>(null)
  const pageRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Estado compartido con la portada: carrito híbrido de afiliados.
  const exchangeRate = useExchangeRate()
  // Idioma activo: el infinite scroll debe pedir los textos en su idioma.
  const locale = useLocale()
  // Traductor de la interfaz: evita quemar textos en el panel de filtros/orden.
  const t = useTranslations()
  const { cart, add, change, total: cartTotal, count, cartOpen, setCartOpen, popupsBlocked, setPopupsBlocked, finishAffiliateCheckout, clear } = useCart()

  // Escucha el Asistente IA: agrega al carrito si el agente emite agregarAlCarrito.
  useAgentAddToCart(add)

  /**
   * Snapshot SIEMPRE actual de los filtros. Permite recargar de forma
   * programática (orden inmediato, "Aplicar", retirar chips) sin sufrir
   * closures obsoletos de React.
   */
  const filtersRef = useRef({ search, minPrice, maxPrice, selectedCategories, selectedMarcas, sort })
  filtersRef.current = { search, minPrice, maxPrice, selectedCategories, selectedMarcas, sort }

  const activeFilterCount =
    (search ? 1 : 0) + (minPrice || maxPrice ? 1 : 0) + selectedCategories.length + selectedMarcas.length

  /** Opciones para los selects con buscador. */
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const marcaOptions = marcas.map((m) => ({ value: m.id, label: m.nombre }))

  /** Carga la primera página con el snapshot actual de filtros. */
  const loadFirstPage = useCallback(async () => {
    const f = filtersRef.current
    pageRef.current = 0
    setLoading(true)
    const params = buildParams({
      from: 0,
      search: f.search,
      minPrice: f.minPrice,
      maxPrice: f.maxPrice,
      categories: f.selectedCategories,
      marcas: f.selectedMarcas,
      sort: f.sort,
      locale,
    })

    const res = await fetch(`/api/catalog?${params}`)
    const data = await res.json().catch(() => ({ products: [], total: 0, hasMore: false }))
    setProducts(data.products ?? [])
    setTotalCount(data.total ?? 0)
    setHasMore(data.hasMore ?? false)
    setLoading(false)

    // Analítica: registra el término libre que el cliente buscó en el filtro.
    // El debounce garantiza una sola captura cuando el usuario se detiene.
    if (f.search.trim().length >= 2) {
      trackSearchLog(f.search.trim(), SEARCH_LOG_SOURCES.CATALOG_FILTER, data.total ?? 0)
    }
  }, [locale])

  /** Carga la siguiente página (infinite scroll) con el snapshot actual. */
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    const f = filtersRef.current
    const next = pageRef.current + CATALOG_PAGE_SIZE
    const params = buildParams({
      from: next,
      search: f.search,
      minPrice: f.minPrice,
      maxPrice: f.maxPrice,
      categories: f.selectedCategories,
      marcas: f.selectedMarcas,
      sort: f.sort,
      locale,
    })

    const res = await fetch(`/api/catalog?${params}`)
    const data = await res.json().catch(() => ({ products: [], hasMore: false }))
    setProducts((prev) => [...prev, ...(data.products ?? [])])
    setHasMore(data.hasMore ?? false)
    pageRef.current = next
    setLoading(false)
  }, [loading, hasMore, locale])

  // Debounce de los filtros de texto/rango/selecciones: recarga al escribir.
  // Se SALTA el primer render: los datos iniciales ya llegan del servidor (SSG).
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(loadFirstPage, CATALOG_FILTER_DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search, minPrice, maxPrice, selectedCategories, selectedMarcas, loadFirstPage])

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

  /** Cambia el orden y recarga de inmediato (el orden no se debouncea). */
  function handleSortChange(value: CatalogSortValue) {
    setSort(value)
    // Actualiza el snapshot antes del re-render para que la recarga use el valor nuevo.
    filtersRef.current = { ...filtersRef.current, sort: value }
    void loadFirstPage()
  }

  /** Limpia todos los filtros activos (conserva el orden elegido). */
  function clearFilters() {
    setSearch('')
    setMinPrice('')
    setMaxPrice('')
    setSelectedCategories([])
    setSelectedMarcas([])
  }

  /** Aplica una categoría desde el estado vacío (sugerencia rápida). */
  function applyCategorySuggestion(categoryId: string) {
    setSelectedCategories([categoryId])
  }

  /**
   * Chips de filtros activos con acción para retirarlos uno a uno.
   * Mejora la comprensión del resultado y evita "callejones sin salida".
   */
  const activeChips = [
    ...(search.trim()
      ? [{ key: `search:${search}`, label: t('catalog.chipSearch', { value: search.trim() }), onRemove: () => setSearch('') }]
      : []),
    ...(minPrice || maxPrice
      ? [{
          key: `price:${minPrice}-${maxPrice}`,
          label: t('catalog.chipPrice', { range: formatPriceRange(minPrice, maxPrice) }),
          onRemove: () => { setMinPrice(''); setMaxPrice('') },
        }]
      : []),
    ...selectedCategories.map((id) => ({
      key: `cat:${id}`,
      label: categories.find((c) => c.id === id)?.name ?? id,
      onRemove: () => setSelectedCategories((prev) => prev.filter((v) => v !== id)),
    })),
    ...selectedMarcas.map((id) => ({
      key: `marca:${id}`,
      label: marcas.find((m) => m.id === id)?.nombre ?? id,
      onRemove: () => setSelectedMarcas((prev) => prev.filter((v) => v !== id)),
    })),
  ]

  const filterPanel = (
    <div className="grid gap-5">
      {/* Buscador por nombre */}
      <label className="grid gap-2">
        <FilterLabel>{t('catalog.searchLabel')}</FilterLabel>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('catalog.searchPlaceholder')}
            className="w-full rounded-xl border border-border bg-transparent py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </label>

      {/* Rango de precio */}
      <div className="grid gap-2">
        <FilterLabel>{t('catalog.priceLabel')}</FilterLabel>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min="0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            placeholder={t('catalog.min')}
            className="w-full rounded-xl border border-border bg-transparent px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <input
            type="number"
            min="0"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder={t('catalog.max')}
            className="w-full rounded-xl border border-border bg-transparent px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </div>

      {/* Categorías con buscador */}
      {categoryOptions.length > 0 && (
        <div className="grid gap-2">
          <FilterLabel>{t('catalog.categories')}</FilterLabel>
          <SearchableMultiSelect
            values={selectedCategories}
            onChange={setSelectedCategories}
            options={categoryOptions}
            placeholder={t('catalog.allCategories')}
            searchPlaceholder={t('catalog.searchCategory')}
          />
        </div>
      )}

      {/* Marcas con buscador */}
      {marcaOptions.length > 0 && (
        <div className="grid gap-2">
          <FilterLabel>{t('catalog.marcas')}</FilterLabel>
          <SearchableMultiSelect
            values={selectedMarcas}
            onChange={setSelectedMarcas}
            options={marcaOptions}
            placeholder={t('catalog.allMarcas')}
            searchPlaceholder={t('catalog.searchMarca')}
          />
        </div>
      )}

      {/* Acciones */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          onClick={() => void loadFirstPage()}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-brand hover:text-brand-foreground"
        >
          <Search size={15} /> {t('catalog.apply')}
        </button>
        <button
          onClick={clearFilters}
          disabled={activeFilterCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCcw size={14} /> {t('catalog.clear')}
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
                <h2 className="font-semibold">{t('catalog.filters')}</h2>
                {activeFilterCount > 0 && (
                  <span className="grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground lg:hidden">{filtersOpen ? t('catalog.hide') : t('catalog.show')}</span>
            </button>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalCount === 1 ? t('catalog.resultsOne', { count: totalCount }) : t('catalog.resultsMany', { count: totalCount })}
            </p>
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

        {/* Resultados */}
        <section>
          {/* Barra superior: orden (conversión) + chips de filtros activos */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {activeChips.length > 0 ? (
                <>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('catalog.activeFilters')}
                  </span>
                  {activeChips.map((chip) => (
                    <span
                      key={chip.key}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium"
                    >
                      <span className="max-w-[12rem] truncate">{chip.label}</span>
                      <button
                        type="button"
                        onClick={chip.onRemove}
                        aria-label={t('catalog.removeFilter', { label: chip.label })}
                        className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-brand-strong underline underline-offset-4 transition-colors hover:text-brand"
                  >
                    {t('catalog.clearAll')}
                  </button>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {totalCount === 1 ? t('catalog.resultsOne', { count: totalCount }) : t('catalog.resultsMany', { count: totalCount })}
                </span>
              )}
            </div>

            {/* Orden: el control de mayor impacto en la conversión */}
            <div className="inline-flex items-center gap-2">
              <label htmlFor="catalog-sort" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('catalog.sortLabel')}
              </label>
              <div className="relative">
                <select
                  id="catalog-sort"
                  value={sort}
                  onChange={(e) => handleSortChange(e.target.value as CatalogSortValue)}
                  className="cursor-pointer appearance-none rounded-full border border-border bg-card py-2 pl-3 pr-9 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                >
                  {CATALOG_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                  ))}
                </select>
                <ArrowUpDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>

          {loading && products.length === 0 ? (
            <ProductGridSkeleton count={6} />
          ) : (
            <>
              {/* La grilla se atenúa durante el refetch en vez de parpadear con skeletons */}
              <div className={`grid gap-5 sm:grid-cols-2 xl:grid-cols-3 transition-opacity ${loading ? 'pointer-events-none opacity-60' : ''}`}>
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
                <p className="py-8 text-center text-sm text-muted-foreground">{t('catalog.endOfResults')}</p>
              )}
              {!hasMore && products.length === 0 && (
                <div className="grid place-items-center py-20 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
                      <SearchX size={24} className="text-muted-foreground" />
                    </div>
                    <p className="mt-4 font-medium">{t('catalog.emptyTitle')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t('catalog.emptyHint')}</p>
                    {categories.length > 0 && (
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {categories.slice(0, CATALOG_EMPTY_STATE_CATEGORY_SUGGESTIONS).map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => applyCategorySuggestion(category.id)}
                            className="rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-brand hover:text-brand-strong"
                          >
                            {category.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={clearFilters}
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-brand hover:text-brand-foreground"
                    >
                      <RotateCcw size={14} /> {t('catalog.clearFilters')}
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

      <SiteFooter footer={footer} brand={{ name: brand?.name, address: brandAddress }} social={social} />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onChange={change}
        total={cartTotal}
        onFinishCheckout={finishAffiliateCheckout}
        exchangeRate={exchangeRate}
        hasNonAffiliate={cart.some((item) => !item.url_afiliado_ali && !item.url_afiliado_amazon && !item.url_afiliado_store)}
      />

      <AffiliateRedirectModal
        open={popupsBlocked}
        items={cart}
        rate={exchangeRate}
        onClose={() => setPopupsBlocked(false)}
        onClearCheckout={clear}
      />
    </div>
  )
}