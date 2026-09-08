'use client'

import { ArrowUpRight, Minus, Plus, ShieldCheck, X } from 'lucide-react'
import { formatBolivars, formatRate, moneyUsd } from '@/lib/currency'
import { formatWeight } from '@/lib/price-calculator'
import type { CartItem } from '@/hooks/use-cart'

/**
 * Panel lateral del carrito ("Resumen de tu selección").
 *
 * Este componente ya NO contiene formularios de pago, ingreso de
 * direcciones de envío físicas ni pasarelas de tarjetas. Su único
 * propósito es resumir la selección del cliente (productos, cantidades,
 * imágenes de variantes y total de referencia) y ofrecer el botón
 * "Finalizar Compra Segura en AliExpress" para cerrar la compra en el
 * marketplace real vía enlaces de afiliado.
 */
export function CartDrawer({ open, onClose, cart, onChange, total, onFinishCheckout, exchangeRate, hasNonAffiliate }: {
  open: boolean
  onClose: () => void
  cart: CartItem[]
  onChange: (id: string, amount: number) => void
  /** Total de referencia en USD (no es lo que se cobra localmente). */
  total: number
  /** Acción principal: redirige al marketplace de afiliado. */
  onFinishCheckout: () => void
  exchangeRate: number
  /** Indica si algún producto no tiene enlace de afiliado configurado. */
  hasNonAffiliate?: boolean
}) {
  if (!open) return null

  /** Precio por línea según el tipo (peso o unidad). */
  function lineAmount(item: CartItem): number {
    const isWeight = item.pricing_type === 'weight'
    if (isWeight) {
      const perGram = Number(item.price_per_gram_usd) || 0
      const grams = item.weight_grams ?? item.quantity
      return grams * perGram
    }
    return item.price_usd * item.quantity
  }

  /** Etiqueta de cantidad visible (gramos/kilos o unidades). */
  function qtyLabel(item: CartItem): string {
    const isWeight = item.pricing_type === 'weight'
    if (isWeight) return formatWeight(item.weight_grams ?? item.quantity)
    const unit = item.unit_label || 'u'
    return `${item.quantity} ${unit}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy/40" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-brand-strong">Paso 2 · Resumen</p>
            <h2 className="mt-1 text-2xl font-semibold">Tu selección</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Confirmas y te llevamos al producto real en AliExpress / Amazon.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar carrito"><X size={20} /></button>
        </div>

        <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
          {cart.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Aún no has agregado piezas.</p>
          ) : cart.map((item) => (
            <div key={item.cartItemId} className="flex gap-3 border-b border-border pb-4">
              {(() => {
                // Muestra la imagen del color seleccionado si existe, si no la general.
                const colorImage = item.color_name
                  ? (item.images ?? []).find((img) => img.color_name === item.color_name)?.url
                  : undefined
                const displayImage = colorImage ?? item.image_url
                return displayImage
                  ? <img src={displayImage} alt="" className="size-16 rounded-xl object-cover" />
                  : <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">Sin img</div>
              })()}
              <div className="flex-1">
                <p className="text-sm font-medium">{item.name}</p>
                {item.color_name && (
                  <p className="text-xs font-medium text-brand-strong">🎨 {item.color_name}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.pricing_type === 'weight'
                    ? `${moneyUsd(Number(item.price_per_gram_usd) || 0)} /g`
                    : moneyUsd(item.price_usd)}
                  {' · '}{moneyUsd(lineAmount(item))} <span className="opacity-60">(ref)</span>
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => onChange(item.cartItemId, -1)} className="grid size-6 place-items-center rounded-full border border-border"><Minus size={12} /></button>
                  <span className="w-16 text-center text-xs">{qtyLabel(item)}</span>
                  <button onClick={() => onChange(item.cartItemId, 1)} className="grid size-6 place-items-center rounded-full border border-border"><Plus size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-5">
          {/* Total de REFERENCIA: nunca es un cobro local */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total estimado<span className="text-muted-foreground/70"> (referencia)</span></p>
              <p className="text-xs text-muted-foreground/70">El cobro final lo hace AliExpress/Amazon en USD.</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{moneyUsd(total)}</p>
              <p className="text-xs text-muted-foreground">{formatBolivars(total, exchangeRate)} · tasa {formatRate(exchangeRate)}</p>
            </div>
          </div>

          {hasNonAffiliate && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
              Algunos productos aún no tienen enlace de afiliado. Se te notificará al finalizar.
            </p>
          )}

          {/* Botón principal: NO es un pago local, es salida segura al marketplace */}
          <button
            disabled={!cart.length}
            onClick={onFinishCheckout}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#e62e04] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-900/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShieldCheck size={17} />
            Finalizar Compra Segura en AliExpress
            <ArrowUpRight size={16} />
          </button>

          <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
            No solicitamos tarjetas ni direcciones de envío aquí.<br />
            Te redirigimos al producto oficial para que pagues protegido en el marketplace.
          </p>
        </div>
      </aside>
    </div>
  )
}