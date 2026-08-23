import { writeFileSync } from 'fs'

const L = String.fromCharCode(60)
const R = String.fromCharCode(62)
const a = []
a.push("'use client'")
a.push('')
a.push("import { moneyUsd } from '@/lib/currency'")
a.push("import { cn } from '@/lib/utils'")
a.push('')
a.push('export type InvoicePrintData = {')
a.push('  id: string; invoice_number: string; control_number: string | null')
a.push("  issued_at: string; status: 'issued' | 'cancelled'")
a.push('  issuer_name: string; issuer_rif: string; issuer_address: string | null')
a.push('  customer_name: string | null; customer_document: string | null')
a.push('  subtotal: number; iva_amount: number; iva_rate: number; total: number')
a.push('  exchange_rate: number')
a.push('  items: { product_name: string; quantity: number; unit_price_usd: number }[]')
a.push('  notes: string | null; cancelled_reason: string | null')
a.push('  footer_note?: string | null')
a.push('}')

writeFileSync('components/invoice-print-view.tsx', a.join('\n') + '\n', 'utf8')
console.log('B1 OK')