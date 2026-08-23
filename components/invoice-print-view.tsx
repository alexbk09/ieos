'use client'

import { moneyUsd } from '@/lib/currency'
import { cn } from '@/lib/utils'

export type InvoicePrintData = {
  id: string; invoice_number: string; control_number: string | null
  issued_at: string; status: 'issued' | 'cancelled'
  issuer_name: string; issuer_rif: string; issuer_address: string | null
  customer_name: string | null; customer_document: string | null
  subtotal: number; iva_amount: number; iva_rate: number; total: number
  exchange_rate: number
  items: { product_name: string; quantity: number; unit_price_usd: number }[]
  notes: string | null; cancelled_reason: string | null
  footer_note?: string | null
}


type Props = { invoice: InvoicePrintData; preview?: boolean }

export function InvoicePrintView({ invoice: inv, preview = false }: Props) {
  const items = inv.items ?? []
  const rate = Number(inv.exchange_rate) || 0
  const issued = new Date(inv.issued_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })
  return (
    <div className={cn('mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 text-foreground shadow-sm', 'print:border-0 print:shadow-none print:p-0 print:max-w-none', preview ? 'print-preview' : 'print-area')}>
      <header className="flex items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{inv.issuer_name}</h1>
          <p className="mt-1 text-xs text-muted-foreground">RIF: {inv.issuer_rif}</p>
          {inv.issuer_address ? <p className="mt-1 text-xs text-muted-foreground">{inv.issuer_address}</p> : null}
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-black tracking-tight text-cyan-600">{inv.invoice_number}</p>
          {inv.control_number ? <p className="mt-1 text-xs text-muted-foreground">N° Control: {inv.control_number}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">Fecha: {issued}</p>
          {inv.status === "cancelled" ? <span className="mt-2 inline-block rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-400">ANULADA</span> : null}
        </div>
      </header>
      <section className="mt-6 grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Cliente</p>
          <p className="text-sm font-medium">{inv.customer_name || "Consumidor Final"}</p>
        </div>
        {inv.customer_document ? <div><p className="text-xs text-muted-foreground">Documento</p><p className="text-sm">{inv.customer_document}</p></div> : null}
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 text-center font-medium">Cant.</th>
              <th className="px-4 py-3 text-right font-medium">Precio USD</th>
              <th className="px-4 py-3 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{item.product_name}</td>
                <td className="px-4 py-3 text-center">{item.quantity}</td>
                <td className="px-4 py-3 text-right">{moneyUsd(Number(item.unit_price_usd))}</td>
                <td className="px-4 py-3 text-right font-medium">{moneyUsd(Number(item.unit_price_usd) * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="mt-6 rounded-2xl border border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Base imponible</span>
          <span className="font-medium">{moneyUsd(Number(inv.subtotal))}</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">IVA ({Number(inv.iva_rate)}%)</span>
          <span className="font-medium">{moneyUsd(Number(inv.iva_amount))}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-border/70 pt-2">
          <span className="font-medium">Total</span>
          <span className="text-lg font-semibold">{moneyUsd(Number(inv.total))}</span>
        </div>
        {rate > 0 ? <p className="mt-2 text-xs text-muted-foreground">Tasa BCV: Bs. {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USD</p> : null}
      </section>
      <footer className="mt-8 border-t border-border pt-4 text-center">
        <p className="text-sm text-muted-foreground">{inv.issuer_name} · RIF: {inv.issuer_rif}</p>
        {inv.footer_note ? <p className="mt-1 text-xs text-muted-foreground">{inv.footer_note}</p> : null}
      </footer>
    </div>
  )
}