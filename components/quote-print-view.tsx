'use client'

import { CalendarDays, Mail, Phone, Printer, UserRound } from 'lucide-react'
import type { Quote } from '@/services/quotes'
import type { SiteSettings } from '@/services/site-settings'
import { moneyUsd } from '@/lib/currency'
import { PAYMENT_METHOD_LABELS, QUOTE_STATUS_LABELS } from '@/lib/quote-calculator'

/** Propiedades de la vista de impresión. */
type Props = {
  /** Cotización a imprimir. */
  quote: Quote
  /** Configuración de la empresa (logo, RIF, dirección). */
  settings: SiteSettings
  /** Datos fiscales del emisor (RIF y razón social). */
  invoiceSettings?: { issuer_name: string; issuer_rif: string; issuer_address: string } | null
}

/**
 * Vista de impresión de una cotización con formato moderno de empresa.
 * Muestra: logo de la empresa, datos del emisor, datos del cliente,
 * ítems con cantidades y precios, descuentos (manual y efectivo divisas),
 * totales en USD y Bs., nota de descuento y footer.
 */
export function QuotePrintView({ quote, settings, invoiceSettings }: Props) {
  const issuerRif = invoiceSettings?.issuer_rif ?? 'J-00000000-0'
  const issuerName = invoiceSettings?.issuer_name ?? settings.company_name
  const issuerAddress = invoiceSettings?.issuer_address ?? settings.address
  const items = quote.quote_items ?? []
  const discountLabel = []
  if (Number(quote.discount_percent) > 0) discountLabel.push(`${Number(quote.discount_percent)}%`)
  if (quote.payment_method === 'cash_divisa' && Number(quote.cash_divisa_discount_percent) > 0) {
    discountLabel.push(`${Number(quote.cash_divisa_discount_percent)}% efectivo`)
  }

  return (
    <div className="print-area mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-foreground shadow-sm print:border-0 print:shadow-none print:p-0 print:max-w-none">
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

      {/* Totales */}
      <section className="mt-6 ml-auto w-full max-w-sm rounded-2xl border border-border bg-muted/30 p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{moneyUsd(Number(quote.subtotal_usd))}</span>
          </div>
          {Number(quote.discount_amount_usd) > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Descuento {discountLabel.length > 0 ? `(${discountLabel.join(' + ')})` : ''}
              </span>
              <span className="font-medium text-destructive">-{moneyUsd(Number(quote.discount_amount_usd))}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="font-semibold">Total USD</span>
            <span className="text-lg font-bold">{moneyUsd(Number(quote.total_usd))}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Total Bs. (tasa {Number(quote.exchange_rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
            </span>
            <span className="font-medium">Bs. {Number(quote.total_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </section>

      {/* Nota de descuento por efectivo en divisas */}
      {quote.payment_method === 'cash_divisa' && Number(quote.cash_divisa_discount_percent) > 0 && (
        <section className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <span className="text-lg leading-none">💰</span>
            <span>
              <strong>Nota:</strong> Si el pago se realiza en <strong>efectivo en divisas</strong>, se aplica un{' '}
              <strong>{Number(quote.cash_divisa_discount_percent)}% de descuento</strong> al monto total de la cotización.
              Esta promoción ya está reflejada en el total mostrado.
            </span>
          </p>
        </section>
      )}

      {/* Nota general */}
      {quote.notes && (
        <section className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notas</p>
          <p className="mt-2 text-sm text-muted-foreground">{quote.notes}</p>
        </section>
      )}

      {/* Método de pago */}
      {quote.payment_method !== 'other' && (
        <p className="mt-4 text-xs text-muted-foreground">
          Método de pago seleccionado: <span className="font-medium">{PAYMENT_METHOD_LABELS[quote.payment_method] ?? quote.payment_method}</span>
        </p>
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