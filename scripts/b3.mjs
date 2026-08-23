import { appendFileSync } from 'fs'

const L = String.fromCharCode(60)
const R = String.fromCharCode(62)
const o = (t, at) => L + t + (at ? ' ' + at : '') + R
const k = (t) => L + '/' + t + R
const a = []
a.push('      ' + o('section', 'className="mt-6 overflow-hidden rounded-2xl border border-border"'))
a.push('        ' + o('table', 'className="w-full text-left text-sm"'))
a.push('          ' + o('thead', 'className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground"'))
a.push('            ' + o('tr'))
a.push('              ' + o('th', 'className="px-4 py-3 font-medium"') + 'Producto' + k('th'))
a.push('              ' + o('th', 'className="px-4 py-3 text-center font-medium"') + 'Cant.' + k('th'))
a.push('              ' + o('th', 'className="px-4 py-3 text-right font-medium"') + 'Precio USD' + k('th'))
a.push('              ' + o('th', 'className="px-4 py-3 text-right font-medium"') + 'Subtotal' + k('th'))
a.push('            ' + k('tr'))
a.push('          ' + k('thead'))
a.push('          ' + o('tbody'))
a.push('            {items.map((item, i) => (')
a.push('              ' + o('tr', 'key={i} className="border-t border-border/60"'))
a.push('                ' + o('td', 'className="px-4 py-3 font-medium"') + '{item.product_name}' + k('td'))
a.push('                ' + o('td', 'className="px-4 py-3 text-center"') + '{item.quantity}' + k('td'))
a.push('                ' + o('td', 'className="px-4 py-3 text-right"') + '{moneyUsd(Number(item.unit_price_usd))}' + k('td'))
a.push('                ' + o('td', 'className="px-4 py-3 text-right font-medium"') + '{moneyUsd(Number(item.unit_price_usd) * item.quantity)}' + k('td'))
a.push('              ' + k('tr'))
a.push('            ))}')
a.push('          ' + k('tbody'))
a.push('        ' + k('table'))
a.push('      ' + k('section'))

appendFileSync('components/invoice-print-view.tsx', '\n' + a.join('\n'), 'utf8')
console.log('B3 OK')