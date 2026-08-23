import { appendFileSync } from 'fs'

const L = String.fromCharCode(60)
const R = String.fromCharCode(62)
const o = (t) => L + t + R
const k = (t) => L + '/' + t + R
const lines = []

lines.push('        ' + o('div') + ' className="text-right"')
lines.push('          ' + o('p') + ' className="font-mono text-2xl font-black tracking-tight text-cyan-600"{inv.invoice_number}' + k('p'))
lines.push('          {inv.control_number ? ' + o('p') + ' className="mt-1 text-xs text-muted-foreground"N' + String.fromCharCode(176) + ' Control: {inv.control_number}' + k('p') + ' : null}')
lines.push('          ' + o('p') + ' className="mt-1 text-xs text-muted-foreground"Fecha: {issued}' + k('p'))
lines.push('          {inv.status === "cancelled" ? ' + o('span') + ' className="mt-2 inline-block rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"ANULADA' + k('span') + ' : null}')
lines.push('        ' + k('div'))
lines.push('      ' + k('header'))

appendFileSync('components/invoice-print-view.tsx', '\n' + lines.join('\n'), 'utf8')
console.log('G3B')