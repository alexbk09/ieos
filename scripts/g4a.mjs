import { appendFileSync } from 'fs'

const L = String.fromCharCode(60)
const R = String.fromCharCode(62)
const o = (t) => L + t + R
const k = (t) => L + '/' + t + R
const lines = []

lines.push('      ' + o('section') + ' className="mt-6 grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-3"')
lines.push('        ' + o('div') + ' className="flex items-center gap-2"')
lines.push('            ' + o('p') + ' className="text-xs text-muted-foreground"Cliente' + k('p'))
lines.push('            ' + o('p') + ' className="text-sm font-medium"{inv.customer_name || "Consumidor Final"}' + k('p'))
lines.push('        ' + k('div'))

appendFileSync('components/invoice-print-view.tsx', '\n' + lines.join('\n'), 'utf8')
console.log('G4A')