import { appendFileSync } from 'fs'

const L = String.fromCharCode(60)
const R = String.fromCharCode(62)
const o = (t) => L + t + R
const k = (t) => L + '/' + t + R
const lines = []

lines.push('      ' + o('section') + ' className="mt-6 rounded-2xl border border-border bg-muted/30 p-4"')
lines.push('        ' + o('div') + ' className="flex items-center justify-between text-sm"')
lines.push('          ' + o('span') + ' className="text-muted-foreground"Base imponible' + k('span'))
lines.push('          ' + o('span') + ' className="font-medium"{moneyUsd(Number(inv.subtotal))}' + k('span'))
lines.push('        ' + k('div'))
lines.push('        ' + o('div') + ' className="mt-2 flex items-center justify-between text-sm"')
lines.push('          ' + o('span') + ' className="text-muted-foreground"IVA ({Number(inv.iva_rate)}%)' + k('span'))
lines.push('          ' + o('span') + ' className="font-medium"{moneyUsd(Number(inv.iva_amount))}' + k('span'))
lines.push('        ' + k('div'))
lines.push('        ' + o('div') + ' className="mt-2 flex items-center justify-between border-t border-border/70 pt-2"')
lines.push('          ' + o('span') + ' className="font-medium"Total' + k('span'))
lines.push('          ' + o('span') + ' className="text-lg font-semibold"{moneyUsd(Number(inv.total))}' + k('span'))
lines.push('        ' + k('div'))
lines.push('        {rate > 0 ? ' + o('p') + ' className="mt-2 text-xs text-muted-foreground"Tasa BCV: Bs. {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / USD' + k('p') + ' : null}')
lines.push('      ' + k('section'))

appendFileSync('components/invoice-print-view.tsx', '\n' + lines.join('\n'), 'utf8')
console.log('G5')