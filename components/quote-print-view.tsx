'use client'

import { CalendarDays, Mail, Phone, Printer, UserRound } from 'lucide-react'
import type { Quote } from '@/services/quotes'
import type { SiteSettings } from '@/services/site-settings'
import { moneyUsd } from '@/lib/currency'
import { PAYMENT_METHOD_LABELS, QUOTE_STATUS_LABELS } from '@/lib/quote-calculator'
import { cn } from '@/lib/utils'

/** Redondea a 2 decimales (céntimos). */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Formatea un monto en bolívares con separadores locales. */
function formatBs(n: number): string {
  return `Bs. ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Propiedades de la vista de impresión. */
type Props = {
  /** Cotización a imprimir. */
  quote: Quote
  /** Configuración de la empresa (logo, RIF, dirección). */
  settings: SiteSettings
  /** Datos fiscales del emisor (RIF y razón social). */
  invoiceSettings?: { issuer_name: string; issuer_rif: string; issuer_address: string } | null
  /** Vista embebida (preview dentro del modal). No participa en la impresión. */
  preview?: boolean
}

/**
 * Vista de impresión de una cotización con formato moderno de empresa.
 * Muestra: logo, datos del emisor y cliente, ítems con precios, desglose
 * de descuentos (manual y efectivo divisas) y dos totales bien diferenciados:
 *  - Pago en DIVISAS (USD): con el descuento por efectivo en divisas.
 *  - Pago en BOLÍVARES (Bs.): sin ese descuento, evitando confusiones.
 */
export function QuotePrintView({ quote, settings, invoiceSettings, preview = false }: Props) {
  const issuerRif = invoiceSettings?.issuer_rif ?? 'J-00000000-0'
  const issuerName = invoiceSettings?.issuer_name ?? settings.company_name
  const issuerAddress = invoiceSettings?.issuer_address ?? settings.address
  const items = quote.quote_items ?? []

  // ---------- Desglose de totales ----------
  const subtotal = Number(quote.subtotal_usd) || 0
  const manualPercent = Math.min(Math.max(Number(quote.discount_percent) || 0, 0), 100)
  const manualAmount = round2((subtotal * manualPercent) / 100)
  const afterManual = round2(subtotal - manualAmount)
  const cashPercent =
    quote.payment_method === 'cash_divisa'
      ? Math.min(Math.max(Number(quote.cash_divisa_discount_percent) || 0, 0), 100)
      : 0
  const cashAmount = round2((afterManual * cashPercent) / 100)
  const totalUsd = Number(quote.total_usd) || 0
  const totalDiscount = round2(manualAmount + cashAmount)
  const effectivePercent = round2(100 - ((100 - manualPercent) * (100 - cashPercent)) / 100)
  const rate = Number(quote.exchange_rate) || 0
  // Si paga en bolívares NO aplica el descuento por efectivo en divisas.
  const totalPayBolivares = round2(afterManual * rate)
  // Equivalente en Bs. del total en divisas (con el descuento por efectivo).
  const totalDivisasVes = round2(totalUsd * rate)

  /** Partes legibles de los descuentos aplicados. */
  const discountParts: string[] = []
  if (manualPercent > 0) discountParts.push(`${manualPercent}% manual`)
  if (cashPercent > 0) discountParts.push(`${cashPercent}% efectivo divisas`)

  return (
    <div
      className={cn(
        'mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-foreground shadow-sm',
        'print:border-0 print:shadow-none print:p-0 print:max-w-none',
        preview ? 'print-preview' : 'print-area',
      )}
    >
      {/* Header: logo + datos empresa */}
      <header className="flex items-start justify-between gap-6 border-b border-border pb-6">
        <div className="flex items-center gap-4">
          {settings.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logo_url} alt={settings.company_name} className="size-16 rounded-2xl object-cover" />
          ) : (
            <span className="grid size-16 place-items-center rounded-2xl bg-accent font-mono text-lg font-black text-primary">iX</span>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight">{issuerName}</h1>
            {settings.tagline && <p className="text-sm text-muted-foreground">{settings.tagline}</p>}
            <p className="mt-1 text-xs text-muted-foreground">RIF: {issuerRif}</p>
            <p className="text-xs text-muted-foreground">{issuerAddress}</p>
            <p className="text-xs text-muted-foreground">{settings.email}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-black tracking-tight text-cyan-600">{quote.quote_number}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(quote.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
          <p className="mt-2 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
          </p>
          {quote.valid_until && (
            <p className="mt-2 flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
              <CalendarDays size={12} /> Válida hasta {new Date(quote.valid_until).toLocaleDateString('es-VE')}
            </p>
          )}
        </div>
      </header>

      {/* Datos del cliente */}
      <section className="mt-6 grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <UserRound size={15} className="shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Cliente</p>
            <p className="text-sm font-medium">{quote.customer_name}</p>
          </div>
        </div>
        {quote.customer_email && (
          <div className="flex items-center gap-2">
            <Mail size={15} className="shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Correo</p>
              <p className="truncate text-sm">{quote.customer_email}</p>
            </div>
          </div>
        )}
        {quote.customer_phone && (
          <div className="flex items-center gap-2">
            <Phone size={15} className="shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Teléfono</p>
              <p className="text-sm">{quote.customer_phone}</p>
            </div>
          </div>
        )}
      </section>

      {/* Tabla de ítems */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 text-center font-medium">Cant.</th>
              <th className="px-4 py-3 text-right font-medium">Precio USD</th>
              <th className="px-4 py-3 text-right font-medium">Subtotal USD</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id || i} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{item.product_name}</td>
                <td className="px-4 py-3 text-center">{item.quantity}</td>
                <td className="px-4 py-3 text-right">{moneyUsd(Number(item.unit_price_usd))}</td>
                <td className="px-4 py-3 text-right font-medium">{moneyUsd(Number(item.unit_price_usd) * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Desglose de descuentos y totales por método de pago */}
      <section className="mt-6 rounded-2xl border border-border bg-muted/30 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Resumen de totales</p>

        {/* Desglose de la cuenta */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{moneyUsd(subtotal)}</span>
          </div>
          {manualAmount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Descuento manual ({manualPercent}%)</span>
              <span className="font-medium text-destructive">-{moneyUsd(manualAmount)}</span>
            </div>
          )}
          {cashAmount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Descuento efectivo divisas ({cashPercent}%)</span>
              <span className="font-medium text-destructive">-{moneyUsd(cashAmount)}</span>
            </div>
          )}
          {totalDiscount > 0 && (
            <div className="flex items-center justify-between border-t border-dashed pt-2 text-sm">
              <span className="text-muted-foreground">Descuento total ({effectivePercent}%)</span>
              <span className="font-medium text-destructive">-{moneyUsd(totalDiscount)}</span>
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
            <div className="text-right">
              <p className="text-2xl font-black text-cyan-700 dark:text-cyan-400">{moneyUsd(totalUsd)}</p>
              <p className="text-xs text-muted-foreground">Tasa {rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>
          {discountParts.length > 0 && (
            <p className="mt-2 text-xs font-medium text-cyan-700/80 dark:text-cyan-400/80">
              Descuento aplicado: {discountParts.join(' + ')}
            </p>
          )}
          <div className="mt-2 border-t border-cyan-500/20 pt-2 text-xs text-muted-foreground">
            Equivale a <span className="font-semibold">{formatBs(totalDivisasVes)}</span> al tipo de cambio del día
          </div>
        </div>

        {/* Pago en bolívares (Bs.) */}
        <div className="mt-3 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">🇻🇪 PAGO EN BOLÍVARES (Bs.)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {cashPercent > 0
                  ? 'No incluye el descuento por efectivo en divisas (aplica solo a pagos en divisas)'
                  : 'Monto total a pagar en bolívares'}
              </p>
            </div>
            <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{formatBs(totalPayBolivares)}</p>
          </div>
          <div className="mt-2 border-t border-emerald-500/20 pt-2 text-xs text-muted-foreground">
            Tasa BCV: <span className="font-semibold">{formatBs(rate)}</span> por USD · Descuento aplicado:{' '}
            <span className="font-semibold">{manualPercent > 0 ? `${manualPercent}% manual` : '—'}</span>
          </div>
        </div>

        {/* Nota aclaratoria del descuento por efectivo */}
        {cashPercent > 0 && (
          <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
            💰 <strong>Importante:</strong> El descuento del <strong>{cashPercent}% por pago en efectivo en divisas</strong> se
            aplica únicamente si el pago se realiza en divisas. Si el pago se realiza en bolívares, el monto a pagar es{' '}
            <strong>{formatBs(totalPayBolivares)}</strong>.
          </p>
        )}
      </section>

      {/* Método de pago */}
      {quote.payment_method !== 'other' && (
        <p className="mt-4 text-xs text-muted-foreground">
          Método de pago seleccionado:{' '}
          <span className="font-medium">{PAYMENT_METHOD_LABELS[quote.payment_method] ?? quote.payment_method}</span>
        </p>
      )}

      {/* Nota general */}
      {quote.notes && (
        <section className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notas</p>
          <p className="mt-2 text-sm text-muted-foreground">{quote.notes}</p>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-8 border-t border-border pt-4 text-center">
        <p className="text-sm text-muted-foreground">
          {settings.footer_texts?.slogan ?? settings.company_name} · {issuerName}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {issuerAddress} · {settings.email} · Tel: {settings.whatsapp_number}
        </p>
        <p className="mt-4 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <Printer size={12} /> Imprimir para firmar
        </p>
      </footer>
    </div>
  )
}