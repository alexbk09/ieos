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
import { Bot, LoaderCircle, Send, ShoppingBag, Sparkles, X } from 'lucide-react'
import { emitAddToCart } from '@/lib/cart-bridge'

const SUGGESTIONS = [
  'Busca un panel LED',
  'Recomienda algo para un estudio',
  'Que hay por menos de 30 USD?',
]

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
  [key: string]: unknown
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
  // Cache en ref de los productos vistos en la conversacion (resultado de buscarProductos).
  const cacheRef = useRef<Map<string, AgentProduct>>(new Map())

  const { messages, input, setInput, handleSubmit, setMessages, status, error } = useChat({
    api: '/api/chat',
    maxSteps: 4,
    onToolCall: ({ toolCall }) => {
      if (toolCall.toolName === 'agregarAlCarrito') {
        const args = (toolCall.args ?? {}) as AddArgs
        const prod = args.productId ? cacheRef.current.get(args.productId) : undefined
        if (!args.productId || !prod) {
          return { ok: false, error: 'Producto no encontrado en esta conversacion. Busquemos de nuevo.' }
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
      return { ok: false, error: 'Herramienta desconocida: ' + (qargs.query ?? toolCall.toolName) }
    },
  })

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
                <p className="text-sm font-semibold">Asistente ilumaX</p>
                <p className="text-xs text-navy-muted">Compra inteligente con IA</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar"><X size={18} /></button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div className="grid gap-3 pt-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  Hola, soy tu asistente de compra. Busco en el catalogo real de ilumaX y agrego lo que apruebes.
                </p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => setInput(s)}
                    className="rounded-full border border-border px-4 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-brand hover:text-brand-strong">
                    {s}
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
                        if (ti.toolName === 'buscarProductos') {
                          const res = ti.state === 'result' ? (ti.result as { ok?: boolean; error?: string; products?: AgentProduct[] } | undefined) : undefined
                          const items = res?.ok ? (res.products ?? []) : []
                          const toolError = ti.state === 'result' && !res?.ok ? (res?.error ?? 'Error consultando el catalogo') : null
                          return (
                            <div key={idx} className="mt-2 grid gap-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-strong">
                                {ti.state === 'call' ? 'Buscando en el catalogo...' : toolError ? 'No se pudo consultar' : items.length > 0 ? 'Encontre estas opciones:' : 'Sin resultados para esa busqueda'}
                              </p>
                              {ti.state === 'call' && (
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <LoaderCircle size={13} className="animate-spin" /> Consultando...
                                </span>
                              )}
                              {toolError && (
											<p className="text-[11px] font-medium text-red-500">{toolError}</p>
										)}
										{ti.state === 'result' && items.length > 0 && (
                                <div className="space-y-2">
                                  {items.map((prod) => (
                                    <div key={prod.id} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                                      {prod.image_url && (
                                        <img src={prod.image_url} alt="" className="size-12 rounded-lg object-cover" />
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs font-semibold">{prod.name}</p>
                                        <p className="text-xs text-muted-foreground">${Number(prod.price_usd).toFixed(2)} USD</p>
                                        <p className="text-[10px] text-muted-foreground">Stock: {prod.stock}</p>
                                      </div>
                                    </div>
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
                                {ti.state === 'call' ? 'Agregando al carrito...' : done ? 'Producto agregado a tu solicitud' : 'No se pudo agregar'}
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
                {status === 'submitted' ? 'Enviando...' : 'Pensando...'}
              </div>
            )}

            {pendingAdd && (
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <ShoppingBag size={14} className="text-brand-strong" />
                  Agregar al carrito?
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {cacheRef.current.get(pendingAddArgs.productId ?? '')?.name ?? 'Producto'} · Cant {pendingAddArgs.quantity ?? '1'} {pendingAddArgs.unit ?? ''}
                </p>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                Ocurrio un error. Intenta de nuevo.
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ej: busco un panel LED de 24W"
              className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none transition-colors focus:border-brand disabled:opacity-50"
              disabled={isStreaming}
            />
            <button type="submit" disabled={isStreaming || !input.trim()} aria-label="Enviar"
              className="grid size-10 place-items-center rounded-full bg-brand text-brand-foreground transition-colors hover:bg-brand-strong disabled:pointer-events-none disabled:opacity-50">
              {isStreaming ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)}
        className="grid size-14 place-items-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-brand/30 transition-transform hover:scale-105"
        aria-label={open ? 'Cerrar asistente' : 'Abrir asistente de compra'}>
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </div>
  )
}
