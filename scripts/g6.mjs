import { appendFileSync } from 'fs'

const L = String.fromCharCode(60)
const R = String.fromCharCode(62)
const o = (t) => L + t + R
const k = (t) => L + '/' + t + R
const lines = []

lines.push('      ' + o('footer') + ' className="mt-8 border-t border-border pt-4 text-center"')
lines.push('        ' + o('p') + ' className="text-sm text-muted-foreground"{inv.issuer_name} · RIF: {inv.issuer_rif}' + k('p'))
lines.push('      ' + k('footer'))
lines.push('    ' + k('div'))
lines.push('  )')
lines.push('}')

appendFileSync('components/invoice-print-view.tsx', '\n' + lines.join('\n'), 'utf8')
console.log('G6')