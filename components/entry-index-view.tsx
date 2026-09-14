'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import { SiteHeader, type HeaderNavLink } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CartDrawer } from '@/components/cart-drawer'
import { CategoryNav, type CategoryNavItem } from '@/components/category-nav'
import { EntryCard } from '@/components/entry-card'
import { SearchableMultiSelect } from '@/components/ui/select-search'
import { useCart } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useLocalizedPath } from '@/hooks/use-localized-path'
import { useTranslations } from '@/hooks/use-translations'
import { useLocale } from '@/components/i18n-provider'
import {
  DEFAULT_ENTRY_INDEX_SORT,
  ENTRY_INDEX_PAGE_LINKS,
  ENTRY_INDEX_PAGE_SIZE,
  ENTRY_INDEX_SORT_OPTIONS,
  ENTRY_TYPES,
  entryTypeLabelKey,
  type EntryIndexSortValue,
} from '@/lib/constants'
import { filtrarEntradas, numerosDePagina, ordenarEntradas, paginar } from '@/lib/entry-index'
import type { EntryIndexItem } from '@/services/entries'

/** Filtros activos del índice (arrays vacíos = sin filtro). */
type FiltrosIndice = { tipos: string[]; nichos: string[] }

/** Estado inicial de los filtros: constante para no crear objetos en cada render. */
const FILTROS_VACIOS: FiltrosIndice = { tipos: [], nichos: [] }

/**
 * Vista cliente del hub de contenido /guias.
 * ------------------------------------------------------------------
 * POR QUÉ es un componente cliente: SiteHeader necesita el carrito (solo
 * disponible en cliente) y el buscador, los filtros y el paginador necesitan
 * estado. Next hace SSR del primer render, así que el H1, la introducción y las
 * tarjetas de la primera página viajan en el HTML crudo que lee Google (el hub
 * es una pieza pSEO, no un adorno).
 *
 * POR QUÉ filtra y pagina en CLIENTE: la página descarga el índice ligero
 * completo (acotado por ENTRY_INDEX_MAX_ITEMS), así que buscar, filtrar o
 * cambiar de página es instantáneo, no fragmenta la caché ni depende de la
 * latencia de red. La lógica pura vive en lib/entry-index.mjs (testeable).
 *
 * No toca Supabase: recibe las entradas, categorías y ajustes ya resueltos por
 * la capa /services.
 */
export function EntryIndexView({
  entries,
  categories,
  navLinks,
  brand,
  footer,
  social,
  brandAddress,
}: {
  entries: EntryIndexItem[]
  categories: CategoryNavItem[]
  navLinks: HeaderNavLink[]
  brand: { name: string; tagline: string; logoUrl: string | null; iconUrl: string | null; whatsapp?: string }
  footer: { copyright?: string; slogan?: string }
  social: { instagram?: string; linkedin?: string; email?: string }
  brandAddress?: string
}) {
  const { cart, change, total, count, cartOpen, setCartOpen, finishAffiliateCheckout } = useCart()
  const exchangeRate = useExchangeRate()
  const t = useTranslations()
  const localizedPath = useLocalizedPath()
  const locale = useLocale()

  // ----- Estado del índice (buscador, filtros, orden y página) -----
  const [consulta, setConsulta] = useState('')
  const [filtros, setFiltros] = useState<FiltrosIndice>(FILTROS_VACIOS)
  const [orden, setOrden] = useState<EntryIndexSortValue>(DEFAULT_ENTRY_INDEX_SORT)
  const [pagina, setPagina] = useState(1)
  // `useDeferredValue`: el input nunca se bloquea aunque el filtrado sea grande.
  const consultaDiferida = useDeferredValue(consulta)
  const grillaRef = useRef<HTMLDivElement | null>(null)

  // Deep-link: /guias?search=led (mismo contrato que el catálogo). Se lee en el
  // CLIENTE a propósito: leer searchParams en servidor volvería dinámica la
  // página y se perdería el ISR (y el HTML estático que rastrea Google).
  useEffect(() => {
    const termino = new URLSearchParams(window.location.search).get('search')
    if (termino && termino.trim().length >= 2) setConsulta(termino.trim())
  }, [])

  /** Opciones del filtro "tipo de contenido": solo los tipos que existen. */
  const opcionesTipo = useMemo(() => {
    const presentes = new Set(entries.map((entrada) => entrada.tipo))
    return ENTRY_TYPES.filter((tipo) => presentes.has(tipo))
  }, [entries])

  /** Opciones del filtro por nicho: solo los nichos con guías, ordenados. */
  const opcionesNicho = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const entrada of entries) {
      for (const nicho of entrada.categorias) mapa.set(nicho.id, nicho.name)
    }
    return [...mapa.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, locale))
  }, [entries, locale])

  // Cadena del índice: filtrar → ordenar → paginar. Todo memoizado para que el
  // coste se pague solo cuando cambia algo (rendimiento: el sitio debe volar).
  const filtradas = useMemo(
    () =>
      ordenarEntradas(
        filtrarEntradas(entries, {
          consulta: consultaDiferida,
          tipos: filtros.tipos,
          nichos: filtros.nichos,
        }),
        orden,
        locale,
      ),
    [entries, consultaDiferida, filtros, orden, locale],
  )
  const resultado = useMemo(() => paginar(filtradas, pagina, ENTRY_INDEX_PAGE_SIZE), [filtradas, pagina])
  const enlacesPagina = useMemo(
    () => numerosDePagina(resultado.pagina, resultado.totalPaginas, ENTRY_INDEX_PAGE_LINKS),
    [resultado.pagina, resultado.totalPaginas],
  )

  /** Etiqueta traducida del tipo de entrada (fallback: el propio valor). */
  const labelDeTipo = useCallback(
    (tipo: string) => {
      const clave = entryTypeLabelKey(tipo)
      return clave ? t(clave) : tipo
    },
    [t],
  )

  /** Busca y vuelve a la primera página (evita aterrizar en una página vacía). */
  const aplicarConsulta = useCallback((valor: string) => {
    setConsulta(valor)
    setPagina(1)
  }, [])

  /** Reemplaza la selección de tipos de contenido (chip "Todos" la vacía). */
  const cambiarTipos = useCallback((tipos: string[]) => {
    setFiltros((previo) => ({ ...previo, tipos }))
    setPagina(1)
  }, [])

  /** Activa/desactiva un tipo en el filtro de chips. */
  const alternarTipo = useCallback(
    (tipo: string) => {
      const activos = filtros.tipos
      cambiarTipos(activos.includes(tipo) ? activos.filter((valor) => valor !== tipo) : [...activos, tipo])
    },
    [filtros.tipos, cambiarTipos],
  )

  /** Selecciona los nichos del filtro múltiple con buscador. */
  const cambiarNichos = useCallback((valores: string[]) => {
    setFiltros((previo) => ({ ...previo, nichos: valores }))
    setPagina(1)
  }, [])

  /** Limpia todos los filtros (conserva el orden elegido). */
  const limpiarFiltros = useCallback(() => {
    setConsulta('')
    setFiltros(FILTROS_VACIOS)
    setPagina(1)
  }, [])

  /** Cambia de página y devuelve la vista al inicio de la grilla si hace falta. */
  const irAPagina = useCallback((destino: number) => {
    setPagina(destino)
    // Si la grilla quedó por encima del viewport (el usuario venía del fondo),
    // se sube suavemente para ver la nueva página desde el principio.
    if ((grillaRef.current?.getBoundingClientRect().top ?? 0) < 0) {
      grillaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  /** Chips de filtros activos, retirables uno a uno (salida fácil y clara). */
  const chips = useMemo(
    () => [
      ...(consulta.trim()
        ? [
            {
              key: `busqueda:${consulta}`,
              label: t('entry.chipSearch', { value: consulta.trim() }),
              quitar: () => aplicarConsulta(''),
            },
          ]
        : []),
      ...filtros.tipos.map((tipo) => ({
        key: `tipo:${tipo}`,
        label: labelDeTipo(tipo),
        quitar: () => alternarTipo(tipo),
      })),
      ...filtros.nichos.map((nichoId) => ({
        key: `nicho:${nichoId}`,
        label: opcionesNicho.find((opcion) => opcion.value === nichoId)?.label ?? nichoId,
        quitar: () => cambiarNichos(filtros.nichos.filter((valor) => valor !== nichoId)),
      })),
    ],
    [consulta, filtros, opcionesNicho, labelDeTipo, alternarTipo, cambiarNichos, aplicarConsulta, t],
  )

  const hayFiltros = Boolean(consulta.trim()) || filtros.tipos.length > 0 || filtros.nichos.length > 0

  /** Clase del chip de tipo de contenido (activo = marca de la casa). */
  const claseChip = (activo: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
      activo
        ? 'border-brand bg-brand/10 text-brand-strong'
        : 'border-border bg-card text-muted-foreground hover:border-brand/60 hover:text-foreground'
    }`

  /** Clase de un botón numerado del paginador. */
  const clasePagina = (activa: boolean) =>
    `grid size-9 place-items-center rounded-full border text-sm font-medium transition-colors ${
      activa
        ? 'border-navy bg-navy text-navy-foreground'
        : 'border-border bg-card hover:border-brand hover:text-brand-strong'
    }`

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader
        cartCount={count}
        onOpenCart={() => setCartOpen(true)}
        navLinks={navLinks}
        brand={{ name: brand.name, tagline: brand.tagline, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl }}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 lg:px-8">
        {/* Miga de pan semántica (UX + SEO) */}
        <nav aria-label="Ruta">
          <ol className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <li>
              <a href={localizedPath('/')} className="transition hover:text-foreground">
                {t('nav.home')}
              </a>
            </li>
            <li aria-hidden>/</li>
            <li className="text-foreground">{t('entry.indexTitle')}</li>
          </ol>
        </nav>

        {/* H1 único del hub: agrupa el cluster de guías bajo un tema claro. */}
        <header className="mt-6 max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-wider text-brand-strong">{t('entry.eyebrow')}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">{t('entry.indexTitle')}</h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">{t('entry.indexSubtitle')}</p>
        </header>

        <section className="mt-8">
          {/* ---------- Buscador + filtros + orden (resuelto en cliente) ---------- */}
          <div className="rounded-3xl border border-border bg-card/60 p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              {/* Buscador por tema, producto o palabra clave */}
              <label className="grid gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t('entry.searchLabel')}
                </span>
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    type="search"
                    value={consulta}
                    onChange={(evento) => aplicarConsulta(evento.target.value)}
                    placeholder={t('entry.searchPlaceholder')}
                    className="w-full rounded-full border border-border bg-background py-2.5 pl-9 pr-9 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                  />
                  {consulta && (
                    <button
                      type="button"
                      onClick={() => aplicarConsulta('')}
                      aria-label={t('entry.clearSearch')}
                      className="absolute right-2.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  )}
                </span>
              </label>

              {/* Orden: el control de mayor impacto al explorar el índice */}
              <label className="grid gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t('entry.sortLabel')}
                </span>
                <span className="relative block">
                  <select
                    value={orden}
                    onChange={(evento) => {
                      setOrden(evento.target.value as EntryIndexSortValue)
                      setPagina(1)
                    }}
                    className="w-full cursor-pointer appearance-none rounded-full border border-border bg-card py-2.5 pl-3.5 pr-10 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 lg:w-56"
                  >
                    {ENTRY_INDEX_SORT_OPTIONS.map((opcion) => (
                      <option key={opcion.value} value={opcion.value}>
                        {t(opcion.labelKey)}
                      </option>
                    ))}
                  </select>
                  <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                </span>
              </label>
            </div>
            {/* Filtros: tipo de contenido (chips) y nicho (select con buscador) */}
            <div className="grid gap-3 border-t border-border/70 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-end">
              <div className="grid gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                  {t('entry.filterType')}
                </span>
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('entry.filterType')}>
                  <button
                    type="button"
                    onClick={() => cambiarTipos([])}
                    aria-pressed={filtros.tipos.length === 0}
                    className={claseChip(filtros.tipos.length === 0)}
                  >
                    {t('entry.allTypes')}
                  </button>
                  {opcionesTipo.map((tipo) => {
                    const activo = filtros.tipos.includes(tipo)
                    return (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => alternarTipo(tipo)}
                        aria-pressed={activo}
                        className={claseChip(activo)}
                      >
                        {activo && <Check size={12} aria-hidden />}
                        {labelDeTipo(tipo)}
                      </button>
                    )
                  })}
                </div>
              </div>
              {opcionesNicho.length > 0 && (
                <div className="grid gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {t('entry.filterNiche')}
                  </span>
                  <SearchableMultiSelect
                    values={filtros.nichos}
                    onChange={cambiarNichos}
                    options={opcionesNicho}
                    placeholder={t('entry.allNiches')}
                    searchPlaceholder={t('entry.searchNiche')}
                  />
                </div>
              )}
            </div>

            {/* Contador de resultados: se anuncia a los lectores de pantalla */}
            <p className="mt-4 border-t border-border/70 pt-4 text-sm text-muted-foreground" aria-live="polite">
              {resultado.total === 1
                ? t('entry.resultsOne', { count: resultado.total })
                : t('entry.resultsMany', { count: resultado.total })}
            </p>

            {/* Chips de filtros activos: entender qué filtra y salir de ahí */}
            {chips.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {t('entry.activeFilters')}
                </span>
                {chips.map((chip) => (
                  <span
                    key={chip.key}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium"
                  >
                    <span className="max-w-[12rem] truncate">{chip.label}</span>
                    <button
                      type="button"
                      onClick={chip.quitar}
                      aria-label={t('entry.removeFilter', { label: chip.label })}
                      className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="text-xs font-medium text-brand-strong underline underline-offset-4 transition-colors hover:text-foreground"
                >
                  {t('entry.clearAll')}
                </button>
              </div>
            )}
          </div>

          {/* Grilla de guías: solo la página actual (el paginador navega el resto) */}
          {resultado.total > 0 ? (
            <div ref={grillaRef} className="mt-6 grid scroll-mt-24 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {resultado.items.map((entry) => (
                <EntryCard key={entry.slug} entry={entry} />
              ))}
            </div>
          ) : hayFiltros ? (
            <div className="grid place-items-center rounded-3xl border border-dashed border-border px-5 py-20 text-center">
              <div className="max-w-md">
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
                  <SearchX className="h-6 w-6 text-muted-foreground" aria-hidden />
                </div>
                <p className="mt-4 font-medium">{t('entry.emptyResults')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('entry.emptyResultsHint')}</p>
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-brand hover:text-brand-foreground"
                >
                  <X size={14} aria-hidden />
                  {t('entry.clearFilters')}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid place-items-center rounded-3xl border border-dashed border-border py-20 text-center">
              <p className="text-muted-foreground">{t('entry.empty')}</p>
              <a
                href={localizedPath('/catalogo')}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-medium text-brand-foreground transition hover:brightness-110"
              >
                {t('category.seeAll')}
              </a>
            </div>
          )}

          {/* Paginador: navega TODAS las guías del índice (numerado + prev/next) */}
          {resultado.totalPaginas > 1 && (
            <nav className="mt-10 flex flex-col items-center gap-3" aria-label={t('entry.paginationAria')}>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() => irAPagina(resultado.pagina - 1)}
                  disabled={resultado.pagina <= 1}
                  aria-label={t('entry.pagePrev')}
                  className="grid size-9 place-items-center rounded-full border border-border bg-card transition-colors hover:border-brand hover:text-brand-strong disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                {enlacesPagina.map((numero, indice) =>
                  numero === null ? (
                    <span key={`hueco-${indice}`} className="px-1 text-sm text-muted-foreground" aria-hidden>
                      …
                    </span>
                  ) : (
                    <button
                      key={numero}
                      type="button"
                      onClick={() => irAPagina(numero)}
                      aria-current={numero === resultado.pagina ? 'page' : undefined}
                      aria-label={t('entry.pageLabel', { page: numero })}
                      className={clasePagina(numero === resultado.pagina)}
                    >
                      {numero}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => irAPagina(resultado.pagina + 1)}
                  disabled={resultado.pagina >= resultado.totalPaginas}
                  aria-label={t('entry.pageNext')}
                  className="grid size-9 place-items-center rounded-full border border-border bg-card transition-colors hover:border-brand hover:text-brand-strong disabled:pointer-events-none disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('entry.showingRange', { from: resultado.desde, to: resultado.hasta, total: resultado.total })}
              </p>
            </nav>
          )}
        </section>

        {/* Enlazado interno hacia los hubs de nicho (cluster topical). */}
        <CategoryNav items={categories} />
      </main>

      <SiteFooter
        footer={footer}
        brand={{ name: brand.name, address: brandAddress }}
        social={social}
        logoUrl={brand.logoUrl}
        iconUrl={brand.iconUrl}
        whatsapp={brand.whatsapp}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onChange={change}
        total={total}
        onFinishCheckout={finishAffiliateCheckout}
        exchangeRate={exchangeRate}
        hasNonAffiliate={cart.some((item) => !item.url_afiliado_ali && !item.url_afiliado_amazon && !item.url_afiliado_store)}
      />
    </div>
  )
}
