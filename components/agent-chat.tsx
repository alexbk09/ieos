'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
type UIMessageLike = {
  id: string
  role: 'system' | 'user' | 'assistant' | 'data'
  parts?: Array<{
    type: string
    text?: string
    toolInvocation?: {
      toolName?: string
      state?: string
      args?: unknown
      result?: unknown
    }
  }>
}
import { Bot, ExternalLink, Layers, LoaderCircle, Send, ShoppingBag, Sparkles, X } from 'lucide-react'
import { emitAddToCart } from '@/lib/cart-bridge'
import { moneyForProduct } from '@/lib/currency'
import { marketplaceForUrl } from '@/lib/affiliate'
import { trackAffiliateClick } from '@/lib/analytics-client'
import { AGENT_BRAND_NAME, AGENT_CATEGORY_PATH_PREFIX, AGENT_MAX_STEPS } from '@/lib/constants'
import { useLocale } from '@/components/i18n-provider'
import { useTranslations } from '@/hooks/use-translations'
import { useLocalizedPath } from '@/hooks/use-localized-path'


/** Claves i18n de las sugerencias iniciales (SOLO temas de la tienda). */
const SUGGESTION_KEYS = ['agent.suggest1', 'agent.suggest2', 'agent.suggest3', 'agent.suggest4']

/** Snapshot del producto tal cual lo devuelve buscarProductos (mismo shape CartProduct). */
type AgentProduct = {
  id: string
  name: string
  slug: string
  description?: string | null
  price_usd: number
  stock: number
  image_url?: string | null
  colors?: string[]
  pricing_type?: 'unit' | 'weight'
  price_per_kilo_usd?: number
  price_per_gram_usd?: number
  stock_grams?: number
  min_order_grams?: number
  unit_label?: string
  specifications?: Record<string, string>
  /** URL de afiliado de AliExpress (con tag de seguimiento). Opcional. */
  url_afiliado_ali?: string | null
  /** URL de afiliado de Amazon (con tag de seguimiento). Opcional. */
  url_afiliado_amazon?: string | null
  /** URL de afiliado genérica de la store (legado). Opcional. */
  url_afiliado_store?: string | null
  [key: string]: unknown
}

/** Categoría devuelta por buscarCategorias (orienta al cliente por tema). */
type AgentCategory = {
  id: string
  name: string
  slug: string
  description?: string | null
}

/** Mejor enlace de afiliado del producto: AliExpress → Amazon → store. */
function bestAffiliateUrl(prod: AgentProduct): string | null {
  return prod.url_afiliado_ali ?? prod.url_afiliado_amazon ?? prod.url_afiliado_store ?? null
}

/**
 * Tarjeta compacta de producto dentro del chat: precio, chip del marketplace
 * y CTA de compra por afiliado. Es UI pura: recibe datos ya resueltos por el
 * servicio del agente (services/agent.ts) y no consulta Supabase.
 */
function AgentProductCard({ prod, onBuy }: { prod: AgentProduct; onBuy: (productId: string, url: string) => void }) {
  const t = useTranslations()
  const affiliateUrl = bestAffiliateUrl(prod)
  const market = marketplaceForUrl(affiliateUrl)
  const isWeight = prod.pricing_type === 'weight'
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex gap-3">
        {prod.image_url && (
          <img src={prod.image_url} alt="" className="size-12 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-xs font-semibold">{prod.name}</p>
            {affiliateUrl && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${market.chipClassName}`}>
                {market.shortLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {/* Precio en DÓLARES: los afiliados se guardan en EUR (AliExpress) y
                se convierten con la configuración central, igual que el catálogo. */}
            {isWeight
              ? `${moneyForProduct(Number(prod.price_per_kilo_usd ?? 0), Boolean(affiliateUrl))}/kg · mín ${Number(prod.min_order_grams ?? 0)} g`
              : moneyForProduct(Number(prod.price_usd), Boolean(affiliateUrl))}
          </p>
          <p className="text-[10px] text-muted-foreground">{t('agent.stock')}: {prod.stock}</p>
        </div>
      </div>
      {affiliateUrl ? (
        <button
          type="button"
          onClick={() => onBuy(prod.id, affiliateUrl)}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-[11px] font-semibold text-navy-foreground transition hover:bg-brand hover:text-brand-foreground"
        >
          <ExternalLink size={12} /> {t('agent.buyOn', { market: market.shortLabel })}
        </button>
      ) : (
        <p className="text-[10px] text-amber-600 dark:text-amber-400">{t('agent.noAffiliate')}</p>
      )}
    </div>
  )
}

/** Chips de categorías navegables (/categoria/[slug]) devueltas por buscarCategorias. */
function AgentCategoryChips({ categories }: { categories: AgentCategory[] }) {
  // Enlaces internos en el idioma activo (mismo grafo de idiomas del sitio).
  const localizedPath = useLocalizedPath()
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((c) => (
        <a
          key={c.id}
          href={localizedPath(`${AGENT_CATEGORY_PATH_PREFIX}${c.slug}`)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-brand-strong"
        >
          <Layers size={12} /> {c.name}
        </a>
      ))}
    </div>
  )
}

/** Extrae de la cache local del producto el CartProduct para el carrito real. */
function toCartProductR(prod: AgentProduct | undefined): Record<string, unknown> {
  return {
    id: prod?.id ?? '',
    name: prod?.name ?? 'Producto',
    slug: prod?.slug ?? '',
    description: prod?.description ?? null,
    price_usd: Number(prod?.price_usd ?? 0),
    stock: Number(prod?.stock ?? 0),
    image_url: prod?.image_url ?? '',
    colors: prod?.colors ?? [],
    specifications: prod?.specifications ?? {},
    pricing_type: prod?.pricing_type === 'weight' ? 'weight' : 'unit',
    price_per_kilo_usd: Number(prod?.price_per_kilo_usd ?? 0),
    price_per_gram_usd: Number(prod?.price_per_gram_usd ?? 0),
    stock_grams: Number(prod?.stock_grams ?? 0),
    min_order_grams: Number(prod?.min_order_grams ?? 0),
    unit_label: prod?.unit_label ?? 'u',
    // Los enlaces viajan con el carrito para que el checkout de afiliado
    // (AliExpress/Amazon) pueda redirigir al marketplace correcto.
    url_afiliado_ali: prod?.url_afiliado_ali ?? null,
    url_afiliado_amazon: prod?.url_afiliado_amazon ?? null,
    url_afiliado_store: prod?.url_afiliado_store ?? null,
  }
}

/** Detecta tool-invocations en una UIMessage. */
function toolInvocationOf(m: UIMessageLike | undefined, name: string) {
  if (!m?.parts?.length) return null
  for (const p of m.parts) {
    if (p.type === 'tool-invocation' && p.toolInvocation?.toolName === name) {
      return p.toolInvocation
    }
  }
  return null
}

type AddArgs = { productId?: string; quantity?: number; unit?: string; colorName?: string }

export function AgentChat() {
  const [open, setOpen] = useState(false)
  // Idioma activo de la página: se envía a /api/chat para responder y devolver
  // los nombres de producto/categoría en el idioma del visitante.
  const locale = useLocale()
  const t = useTranslations()
  // Cache en ref de los productos vistos en la conversacion (resultado de buscarProductos).
  const cacheRef = useRef<Map<string, AgentProduct>>(new Map())

  const { messages, input, setInput, handleSubmit, setMessages, status, error } = useChat({
    api: '/api/chat',
    body: { locale },
    maxSteps: AGENT_MAX_STEPS,
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === 'agregarAlCarrito') {
        const args = (toolCall.args ?? {}) as AddArgs
        const prod = args.productId ? cacheRef.current.get(args.productId) : undefined
        if (!args.productId || !prod) {
          return { ok: false, error: t('agent.notFound') }
        }
        emitAddToCart({
          product: toCartProductR(prod),
          unit: args.unit,
          quantity: args.quantity,
          colorName: args.colorName,
        })
        return { ok: true }
      }
      const qargs = (toolCall.args ?? {}) as { query?: string }
      return { ok: false, error: t('agent.unknownTool', { name: qargs.query ?? toolCall.toolName }) }
    },
  })

  /** Abre el enlace de afiliado del producto en otra pestaña y registra el clic. */
  const openAffiliateLink = (productId: string, url: string) => {
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
    trackAffiliateClick(productId, url)
  }

  const bottomRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  /** Indexa los resultados de cada tool buscarProductos en la cache. */
  useEffect(() => {
    if (!open) return
    const cache = cacheRef.current
    let changed = false
    for (const m of messages) {
      const ti = toolInvocationOf(m, 'buscarProductos')
      if (ti?.state === 'result') {
        const res = ti.result as { ok?: boolean; error?: string; products?: AgentProduct[] } | undefined
        for (const p of res?.products ?? []) {
          if (!cache.has(p.id)) {
            cache.set(p.id, p)
            changed = true
          }
        }
      }
    }
    if (changed) {
      setMessages((prev) => [...prev])
    }
  }, [messages, open, setMessages])

  const isStreaming = status === 'submitted' || status === 'streaming'
  const pendingAdd = (() => {
    // Busca en el ultimo mensaje del asistente si hay tool-call pendiente de ejecutar.
    const last = messages[messages.length - 1]
    const ti = toolInvocationOf(last, 'agregarAlCarrito')
    if (ti?.state === 'call') return ti
    return null
  })()

  const pendingAddArgs = (pendingAdd?.args ?? {}) as AddArgs

  return (
    <div className="fixed bottom-6 right-6 z-[70] flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[32rem] w-[min(24rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border bg-navy px-5 py-4 text-navy-foreground">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-full bg-brand/20 text-brand-light">
                <Sparkles size={17} />
              </span>
              <div>
                <p className="text-sm font-semibold">{t('agent.title', { brand: AGENT_BRAND_NAME })}</p>
                <p className="text-xs text-navy-muted">{t('agent.subtitle')}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t('common.close')} className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X size={18} /></button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="grid gap-3 pt-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  {t('agent.greeting', { brand: AGENT_BRAND_NAME })}
                </p>
                {SUGGESTION_KEYS.map((key) => (
                  <button key={key} onClick={() => setInput(t(key))}
                    className="rounded-full border border-border px-4 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-brand hover:text-brand-strong">
                    {t(key)}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m) => {
              if (m.role !== 'user' && m.role !== 'assistant') return null
              return (
                <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div className={
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-brand-foreground'
                      : 'max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-background px-4 py-2.5 text-sm'
                  }>
                    {m.parts?.map((p, idx) => {
                      if (p.type === 'text' && p.text) {
                        return <p key={idx} className="whitespace-pre-wrap">{p.text}</p>
                      }
                      if (p.type === 'tool-invocation') {
                        const ti = p.toolInvocation
                        if (!ti) return null
                        if (ti.toolName === 'buscarCategorias') {
                          const res = ti.state === 'result' ? (ti.result as { ok?: boolean; error?: string; categories?: AgentCategory[] } | undefined) : undefined
                          const cats = res?.ok ? (res.categories ?? []) : []
                          const catError = ti.state === 'result' && !res?.ok ? (res?.error ?? t('agent.errorCategories')) : null
                          return (
                            <div key={idx} className="mt-2 grid gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-strong">
                                {ti.state === 'call' ? t('agent.searchingCategories') : catError ? t('agent.consultError') : cats.length > 0 ? t('agent.categoriesAvailable') : t('agent.noCategoryResults')}
                              </p>
                              {catError && (
                                <p className="text-[11px] font-medium text-red-500">{catError}</p>
                              )}
                              {ti.state === 'result' && cats.length > 0 && <AgentCategoryChips categories={cats} />}
                            </div>
                          )
                        }
                        if (ti.toolName === 'buscarProductos') {
                          const res = ti.state === 'result' ? (ti.result as { ok?: boolean; error?: string; products?: AgentProduct[] } | undefined) : undefined
                          const items = res?.ok ? (res.products ?? []) : []
                          const toolError = ti.state === 'result' && !res?.ok ? (res?.error ?? t('agent.errorProducts')) : null
                          return (
                            <div key={idx} className="mt-2 grid gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-strong">
                                {ti.state === 'call' ? t('agent.searchingProducts') : toolError ? t('agent.consultError') : items.length > 0 ? t('agent.resultsAvailable') : t('agent.noResults')}
                              </p>
                              {ti.state === 'call' && (
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <LoaderCircle size={13} className="animate-spin" /> {t('agent.consulting')}
                                </span>
                              )}
                              {toolError && (
											<p className="text-[11px] font-medium text-red-500">{toolError}</p>
										)}
										{ti.state === 'result' && items.length > 0 && (
                                <div className="space-y-2">
                                  {items.map((prod) => (
                                    <AgentProductCard key={prod.id} prod={prod} onBuy={openAffiliateLink} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        }
                        if (ti.toolName === 'agregarAlCarrito') {
                          const res = ti.state === 'result' ? (ti.result as { ok?: boolean } | undefined) : undefined
                          const done = ti.state === 'result' && res?.ok
                          return (
                            <div key={idx} className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                {ti.state === 'call' ? t('agent.adding') : done ? t('agent.added') : t('agent.addFailed')}
                              </p>
                            </div>
                          )
                        }
                      }
                      return null
                    })}
                  </div>
                </div>
              )
            })}

            {isStreaming && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="grid size-6 place-items-center rounded-full bg-brand/10 text-brand-strong"><Bot size={13} /></span>
                {status === 'submitted' ? t('agent.sending') : t('agent.thinking')}
              </div>
            )}

            {pendingAdd && (
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <ShoppingBag size={14} className="text-brand-strong" />
                  {t('agent.addToCartQuestion')}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {cacheRef.current.get(pendingAddArgs.productId ?? '')?.name ?? t('agent.productFallback')} · {t('agent.qtyShort')} {pendingAddArgs.quantity ?? '1'} {pendingAddArgs.unit ?? ''}
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                {t('agent.genericError')}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
            {/* aria-label: el placeholder no es un nombre accesible válido para
                lectores de pantalla, así el campo se anuncia correctamente. */}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('agent.placeholder')}
              aria-label={t('agent.placeholder')}
              className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
              disabled={isStreaming}
            />
            {/* hover:brightness en lugar de hover:bg-brand-strong: el acento oscuro
                que exige AA como texto deja el texto del botón por debajo de 4.5:1. */}
            <button type="submit" disabled={isStreaming || !input.trim()} aria-label={t('agent.send')}
              className="grid size-10 place-items-center rounded-full bg-brand text-brand-foreground transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50">
              {isStreaming ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)}
        className="grid size-14 place-items-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/30 transition-transform hover:scale-105"
        aria-label={open ? t('agent.closeAssistant') : t('agent.open')}>
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </div>
  )
}
