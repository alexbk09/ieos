import { writeFileSync } from 'fs'

const content = "// Vista de factura SENIAT - generado por script"
writeFileSync('components/invoice-print-view.tsx', content, 'utf8')
console.log('OK')