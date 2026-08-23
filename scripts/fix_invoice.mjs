import { readFileSync, writeFileSync } from 'fs'

const p = 'services/invoicing.ts'
let s = readFileSync(p, 'utf8')
const bad = 'function renderInvoiceEmailHtml(inv,cn){return " FACTURA +inv.invoice_number}'
const good = "function renderInvoiceEmailHtml(inv, cn) {\n  return 'Factura ' + inv.invoice_number + ' - Total: ' + moneyUsd(Number(inv.total)) + '\\n'\n}"

if (s.includes(bad)) {
  s = s.replace(bad, good)
  writeFileSync(p, s, 'utf8')
  console.log('FIXED')
} else {
  console.log('NOT_FOUND')
}