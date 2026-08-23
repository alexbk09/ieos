import { appendFileSync } from 'fs'

const L = String.fromCharCode(60)
const R = String.fromCharCode(62)
const ok = (t) => L + t + R
const ck = (t) => L + '/' + t + R
const lines = []

lines.push('      ' + ok('section') + ' className="mt-6 overflow-hidden rounded-2xl border border-border"')
lines.push('        ' + ok('table') + ' className="w-full text-left text-sm"')
lines.push('          ' + ok('thead') + ' className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground"')
lines.push('            ' + ok('tr'))
lines.push('              ' + ok('th') + ' className="px-4 py-3 font-medium"Producto' + ck('th'))
lines.push('              ' + ok('th') + ' className="px-4 py-3 text-center font-medium"Ctd.' + ck('th'))
lines.push('              ' + ok('th') + ' className="px-4 py-3 text-right font-medium"Precio' + ck('th'))
lines.push('              ' + ok('th') + ' className="px-4 py-3 text-right font-medium"Subtotal' + ck('th'))
lines.push('            ' + ck('tr'))
lines.push('          ' + ck('thead'))
lines.push('          ' + ok('tbody'))
lines.push('            {items.map((item, i) => (')
lines.push('              ' + ok('tr') + ' key={i} className="border-t border-border/60"')
lines.push('                ' + ok('td') + ' className="px-4 py-3 font-medium"{item.product_name}' + ck('td'))
lines.push('                ' + ok('td') + ' className="px-4 py-3 text-center"{item.quantity}' + ck('td'))
lines.push('                ' + ok('td') + ' className="px-4 py-3 text-right"{moneyUsd(Number(item.unit_price_usd))}' + ck('td'))
lines.push('                ' + ok('td') + ' className="px-4 py-3 text-right font-medium"{moneyUsd(Number(item.unit_price_usd) * item.quantity)}' + ck('td'))
lines.push('              ' + ck('tr'))
lines.push('            ))}')
lines.push('          ' + ck('tbody'))
lines.push('        ' + ck('table'))
lines.push('      ' + ck('section'))

appendFileSync('components/invoice-print-view.tsx', '\n' + lines.join('\n'), 'utf8')
console.log('G4B')