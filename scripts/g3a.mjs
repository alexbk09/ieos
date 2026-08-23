import { appendFileSync } from 'fs'

const L = String.fromCharCode(60)
const R = String.fromCharCode(62)
const lines = []
const o = (t) => L + t + R
const k = (t) => L + '/' + t + R

lines.push('      ' + o('header') + ' className="flex items-start justify-between gap-6 border-b border-border pb-6"')
lines.push('        ' + o('div'))
lines.push('          ' + o('h1') + ' className="text-xl font-bold tracking-tight"{inv.issuer_name}' + k('h1'))
lines.push('          ' + o('p') + ' className="mt-1 text-xs text-muted-foreground"RIF: {inv.issuer_rif}' + k('p'))
appendFileSync('components/invoice-print-view.tsx', '\n' + lines.join('\n'), 'utf8')
console.log('G3A')