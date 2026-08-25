'use client'

import { useMemo, useRef, useState } from 'react'
import { FileText, Minus, Package, Plus, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { FormInput, FormSubmitButton, FormTextarea } from '@/components/ui/form-field'
import { confirmAction } from '@/components/confirm-dialog'
import type { Product } from '@/services/catalog'
import type { QuoteSettings } from '@/services/quotes'
import { calculateQuoteTotals } from '@/lib/quote-calculator'
import { formatBolivars, formatRate, moneyUsd } from '@/lib/currency'

/** Redondea a 2 decimales (céntimos). */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Propiedades del creador de cotizaciones. */
type Props = {
  /** Productos disponibles del catálogo. */
  products: Product[]
  /** Tasa BCV del día. */
  exchangeRate: number
  /** Configuración de cotizaciones (descuento efectivo divisas). */
  quoteSettings: QuoteSettings
  /** Callback cuando se crea una cotización. */
  onCreated?: (quoteNumber: string) => void
  /** Cerrar el modal. */
  onClose?: () => void
}

/** Ítem temporal de la cotización en construcción. */
type DraftItem = {
  product: Product
  quantity: number
}

/**
 * Creador de cotizaciones con:
 * - Búsqueda de productos del catálogo.
 * - Selección con cantidades.
 * - Descuento manual por el vendedor (%).
 * - Método de pago (efectivo divisas aplica descuento automático configurable).
 * - Cálculo en vivo con desglose claro: total en divisas (con descuento por
 *   efectivo) y total en bolívares (sin ese descuento) para evitar confusión.
 */
export function QuoteCreator({ products, exchangeRate, quoteSettings, onCreated, onClose }: Props) {
  // Datos del cliente.
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', address: '' })
  const [discountPercent, setDiscountPercent] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash_divisa' | 'transfer_divisa' | 'other'>('other')
  const [notes, setNotes] = useState('')

  // Ítems y búsqueda.
  const [items, setItems] = useState<DraftItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)

  /** Descuento manual en porcentaje (0-100). */
  const manualPercent = Math.min(Math.max(Number(discountPercent || 0), 0), 100)
  /** Descuento por efectivo en divisas (solo si aplica). */
  const cashPercent =
    paymentMethod === 'cash_divisa'
      ? Math.min(Math.max(Number(quoteSettings.cash_divisa_discount_percent) || 0, 0), 100)
      : 0

  /** Productos filtrados por la búsqueda (excluye ya agregados). */
  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase()
    const addedIds = new Set(items.map((i) => i.product.id))
    const matches = term
      ? products.filter((p) => (p.name.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term)) && !addedIds.has(p.id))
      : products.filter((p) => !addedIds.has(p.id))
    return matches.slice(0, 8)
  }, [products, search, items])

  /** Agrega un producto seleccionado a la lista. */
  function addProduct(product: Product) {
    if (items.some((i) => i.product.id === product.id)) {
      toast.info('El producto ya fue agregado')
      return
    }
    setItems((current) => [...current, { product, quantity: 1 }])
    setSearch('')
    setSelectedProductId('')
    searchRef.current?.focus()
  }

  /** Actualiza la cantidad de un ítem. */
  function setQuantity(productId: string, quantity: number) {
    const qty = Math.max(1, Math.floor(quantity))
    setItems((current) => current.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i)))
  }

  /** Elimina un ítem de la lista. */
  async function removeItem(productId: string) {
    const item = items.find((i) => i.product.id === productId)
    if (!item) return

    const ok = await confirmAction({
      title: '¿Quitar este producto?',
      description: `${item.product.name} se eliminará de la cotización.`,
      confirmText: 'Sí, quitar',
      confirmClassName: 'bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-600 dark:text-white dark:hover:bg-rose-500',
    })
    if (!ok) return

    setItems((current) => current.filter((i) => i.product.id !== productId))
  }

  /** Calcula los totales en vivo con lógica pura. */
  const totals = useMemo(() => {
    return calculateQuoteTotals(
      items.map((i) => ({ quantity: i.quantity, unit_price_usd: Number(i.product.price_usd) })),
      {
        discountPercent: Number(discountPercent || 0),
        exchangeRate,
        cashDivisaDiscountPercent: quoteSettings.cash_divisa_discount_percent,
        paymentMethod,
      },
    )
  }, [items, discountPercent, exchangeRate, quoteSettings.cash_divisa_discount_percent, paymentMethod])

  /** Subtotal después del descuento manual (base para pago en bolívares). */
  const subtotalAfterManual = round2(totals.subtotal_usd - (totals.subtotal_usd * manualPercent) / 100)
  /** Monto en Bs. que pagaría si paga en bolívares (sin descuento efectivo). */
  const totalPayBolivaresUsd = subtotalAfterManual

  /** Envía la cotización al servidor. */
  async function submit() {
    if (!customer.name.trim()) {
      toast.error('El nombre del cliente es obligatorio')
      return
    }
    if (items.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customer.name,
          customer_email: customer.email,
          customer_phone: customer.phone,
          customer_address: customer.address,
          items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
          discount_percent: Number(discountPercent || 0),
          payment_method: paymentMethod,
          notes: notes || null,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudo crear la cotización', { description: result.error ?? 'Inténtalo de nuevo.' })
        return
      }
      toast.success('Cotización creada', { description: `N° ${result.quote.quote_number}` })
      onCreated?.(result.quote.quote_number)
      onClose?.()
    } catch {
      toast.error('Error de red al crear la cotización')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-5">
      {/* Datos del cliente */}
      <section className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Datos del cliente</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Nombre *" value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} placeholder="Nombre o razón social" />
          <FormInput label="Correo" type="email" value={customer.email} onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))} placeholder="cliente@correo.com" hint="Necesario para enviar por correo" />
          <FormInput label="Teléfono" value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} placeholder="+584120000000" />
          <FormInput label="Dirección" value={customer.address} onChange={(e) => setCustomer((c) => ({ ...c, address: e.target.value }))} placeholder="Ciudad, estado" />
        </div>
      </section>

      {/* Búsqueda de productos */}
      <section className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Buscar productos</p>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto por nombre…"
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>

        {search && searchResults.length > 0 && (
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border bg-background">
            {searchResults.map((product) => (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                className="flex w-full items-center justify-between gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt={product.name} className="size-9 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted"><Package size={16} /></span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">Stock: {product.stock}</p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold">{moneyUsd(Number(product.price_usd))}</span>
              </button>
            ))}
          </div>
        )}
        {search && searchResults.length === 0 && (
          <p className="mt-2 rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">No se encontraron productos.</p>
        )}

        {/* Selector rápido (todos los productos) */}
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selectedProductId}
            onChange={(e) => {
              if (!e.target.value) return
              const product = products.find((p) => p.id === e.target.value)
              if (product) addProduct(product)
            }}
            className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            <option value="">Agregar producto del catálogo…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {moneyUsd(Number(p.price_usd))}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Ítems seleccionados */}
      {items.length > 0 && (
        <section className="rounded-2xl border border-border bg-muted/30 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Productos seleccionados ({items.length})</p>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.product.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground">{moneyUsd(Number(item.product.price_usd))} c/u</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQuantity(item.product.id, item.quantity - 1)}
                    aria-label="Disminuir cantidad"
                    className="grid size-8 place-items-center rounded-lg border border-border transition hover:bg-muted"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-10 text-center text-sm font-medium">{item.quantity}</span>
                  <button
                    onClick={() => setQuantity(item.product.id, item.quantity + 1)}
                    aria-label="Aumentar cantidad"
                    className="grid size-8 place-items-center rounded-lg border border-border transition hover:bg-muted"
                  >
                    <Plus size={14} />
                  </button>
                  <span className="ml-2 w-20 text-right text-sm font-semibold">
                    {moneyUsd(Number(item.product.price_usd) * item.quantity)}
                  </span>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    aria-label="Eliminar producto"
                    className="grid size-8 place-items-center rounded-lg border border-destructive/30 text-destructive transition hover:bg-destructive/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Descuento y método de pago */}
      <section className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Descuento y pago</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput
            label="Descuento manual (%)"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder="0"
            hint="Descuento adicional aplicado por el vendedor"
          />
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Método de pago</span>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="other">Otro</option>
              <option value="transfer_divisa">Transferencia en divisas</option>
              <option value="cash_divisa">Efectivo en divisas ({quoteSettings.cash_divisa_discount_percent}% desc.)</option>
            </select>
          </label>
        </div>
        {paymentMethod === 'cash_divisa' && (
          <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
            💰 Se aplicará un <strong>{quoteSettings.cash_divisa_discount_percent}% de descuento</strong> automático por pago en efectivo en divisas.
            Este porcentaje se configura en Ajustes administrativos.
          </p>
        )}
      </section>

      {/* Nota al pie */}
      <FormTextarea
        label="Nota al pie"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Condiciones, garantía, tiempo de entrega…"
      />

      {/* Totales */}
      {items.length > 0 && (
        <section className="rounded-2xl border border-border bg-muted/30 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Resumen de totales</p>

          {/* Desglose de la cuenta */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{moneyUsd(totals.subtotal_usd)}</span>
            </div>
            {manualPercent > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Descuento manual ({manualPercent}%)</span>
                <span className="font-medium text-destructive">-{moneyUsd(round2((totals.subtotal_usd * manualPercent) / 100))}</span>
              </div>
            )}
            {cashPercent > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Descuento efectivo divisas ({cashPercent}%)</span>
                <span className="font-medium text-destructive">-{moneyUsd(round2(totals.discount_amount_usd - (totals.subtotal_usd * manualPercent) / 100))}</span>
              </div>
            )}
          </div>

          {/* Pago en divisas (USD) */}
          <div className="mt-4 rounded-2xl border-2 border-cyan-500/40 bg-cyan-500/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-cyan-700 dark:text-cyan-400">💵 PAGO EN DIVISAS (USD)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cashPercent > 0
                    ? 'Incluye el descuento por pago en efectivo en divisas'
                    : 'Monto total a pagar en divisas'}
                </p>
              </div>
              <p className="text-2xl font-black text-cyan-700 dark:text-cyan-400">{moneyUsd(totals.total_usd)}</p>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-cyan-500/20 pt-2 text-xs text-muted-foreground">
              <span>Equivalente en Bs.</span>
              <span className="font-semibold">{formatBolivars(totals.total_usd, exchangeRate)}</span>
            </div>
          </div>

          {/* Pago en bolívares (Bs.) */}
          <div className="mt-3 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">🇻🇪 PAGO EN BOLÍVARES (Bs.)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cashPercent > 0
                    ? 'Sin el descuento por efectivo en divisas (aplica solo a pagos en divisas)'
                    : 'Monto total a pagar en bolívares'}
                </p>
              </div>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                {formatBolivars(totalPayBolivaresUsd, exchangeRate)}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-emerald-500/20 pt-2 text-xs text-muted-foreground">
              <span>Tasa BCV</span>
              <span className="font-semibold">{formatRate(exchangeRate)} por USD</span>
            </div>
          </div>
        </section>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {onClose && (
          <button onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted">
            <X size={15} /> Cancelar
          </button>
        )}
        <FormSubmitButton loading={submitting} onClick={submit} loadingText="Creando cotización…">
          <FileText size={15} /> Crear cotización
        </FormSubmitButton>
      </div>
    </div>
  )
}