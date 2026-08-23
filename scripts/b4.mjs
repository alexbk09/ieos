import { appendFileSync } from 'fs'

const L = String.fromCharCode(60)
const R = String.fromCharCode(62)
const o = (t, at) => L + t + (at ? ' ' + at : '') + R
const k = (t) => L + '/' + t + R
const a = []
a.push('      ' + o('section', 'className="mt-6 rounded-2xl border border-border bg-muted/30 p-4"'))
a.push('        ' + o('div', 'className="flex items-center justify-between text-sm"'))
a.push('          ' + o('span', 'className="text-muted-foreground"') + 'Base imponible' + k('span'))
a.push('          ' + o('span', 'className="font-medium"') + '{moneyUsd(Number(inv.subtotal))}' + k('span'))
a.push('        ' + k('div'))
a.push('        ' + o('div', 'className="mt-2 flex items-center justify-between text-sm"'))
a.push('          ' + o('span', 'className="text-muted-foreground"') + 'IVA ({Number(inv.iva_rate)}%)' + k('span'))
a.push('          ' + o('span', 'className="font-medium"') + '{moneyUsd(Number(inv.iva_amount))}' + k('span'))
a.push('        ' + k('div'))
a.push('        ' + o('div', 'className="mt-2 flex items-center justify-between border-t border-border/70 pt-2"'))
a.push('          ' + o('span', 'className="font-medium"') + 'Total' + k('span'))
a.push('          ' + o('span', 'className="text-lg font-semibold"') + '{moneyUsd(Number(inv.total))}' + k('span'))
a.push('        ' + k('div'))
a.push('        {rate > 0 ? ' + o('p', 'className="mt-2 text-xs text-muted-foreground"') + 'Tasa BCV: Bs. {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USD' + k('p') + ' : null}')
a.push('      ' + k('section'))
a.push('      ' + o('footer', 'className="mt-8 border-t border-border pt-4 text-center"'))
a.push('        ' + o('p', 'className="text-sm text-muted-foreground"') + '{inv.issuer_name} · RIF: {inv.issuer_rif}' + k('p'))
a.push('        {inv.footer_note ? ' + o('p', 'className="mt-1 text-xs text-muted-foreground"') + '{inv.footer_note}' + k('p') + ' : null}')
a.push('      ' + k('footer'))
a.push('    ' + k('div'))
a.push('  )')
a.push('}')

appendFileSync('components/invoice-print-view.tsx', '\n' + a.join('\n'), 'utf8')
console.log('B4 OK')