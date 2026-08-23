import io
p = 'services/invoicing.ts'
s = io.open(p, 'r', encoding='utf-8').read()
bad = 'function renderInvoiceEmailHtml(inv,cn){return " FACTURA +inv.invoice_number}'
good = "function renderInvoiceEmailHtml(inv, cn) {\n  return 'Factura ' + inv.invoice_number + ' - Total: ' + moneyUsd(Number(inv.total)) + '\\n'\n}"
if bad in s:
    s = s.replace(bad, good)
    io.open(p, 'w', encoding='utf-8').write(s)
    print('FIXED')
else:
    print('NOT_FOUND')