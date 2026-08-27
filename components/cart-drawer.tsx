'use client'

import { ArrowUpRight, Minus, Plus, X } from 'lucide-react'
import { formatBolivars, formatRate, moneyUsd } from '@/lib/currency'
import type { CartItem } from '@/hooks/use-cart'

/**
 * Panel lateral del carrito de compra (drawer).
 * Muestra los productos agregados, permite cambiar cantidades y
 * confirmar la solicitud por WhatsApp. Compartido entre portada y catálogo.
 */
export function CartDrawer({ open, onClose, cart, onChange, total, onSubmit, submitting, requested, exchangeRate }: {
  open: boolean
  onClose: () => void
  cart: CartItem[]
  onChange: (id: string, amount: number) => void
  total: number
  onSubmit: () => void
  submitting: boolean
  requested: boolean
  exchangeRate: number
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-navy/40" onClick={onClose}>
      <aside onClick={(e) => e.stopPropagation()} className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-card p-6">
        <div className="flex items-center justify-between">
          <div><p className="font-mono text-xs uppercase tracking-widest text-brand-strong">Tu selección</p><h2 className="mt-1 text-2xl font-semibold">Solicitud</h2></div>
          <button onClick={onClose} aria-label="Cerrar carrito"><X size={20} /></button>
        </div>

        <div className="mt-8 flex-1 space-y-4 overflow-y-auto">
          {cart.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Aún no has agregado piezas.</p>
          ) : cart.map((item) => (
            <div key={item.id} className="flex gap-3 border-b border-border pb-4">
              <img src={item.image_url} alt="" className="size-16 rounded-xl object-cover" />
              <div className="flex-1">
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">{moneyUsd(item.price_usd)} · {formatBolivars(item.price_usd, exchangeRate)}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => onChange(item.id, -1)} className="grid size-6 place-items-center rounded-full border border-border"><Minus size={12} /></button>
                  <span className="w-4 text-center text-xs">{item.quantity}</span>
                  <button onClick={() => onChange(item.id, 1)} className="grid size-6 place-items-center rounded-full border border-border"><Plus size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-5">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Total estimado</span>
            <div className="text-right">
              <p className="font-semibold">{moneyUsd(total)}</p>
              <p className="text-xs text-muted-foreground">{formatBolivars(total, exchangeRate)} · tasa {formatRate(exchangeRate)}</p>
            </div>
          </div>
          <button disabled={!cart.length || submitting} onClick={onSubmit} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground disabled:cursor-not-allowed disabled:opacity-40">{submitting ? 'Enviando solicitud…' : 'Confirmar por WhatsApp'} <ArrowUpRight size={16} /></button>
          {requested && <p className="mt-3 text-center text-xs text-brand-strong">Inicia sesión para generar tu Solicitud ID.</p>}
        </div>
      </aside>
    </div>
  )
}