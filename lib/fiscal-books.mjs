/**
 * Lógica pura de libros fiscales (SENIAT).
 * Independiente de Supabase y sin dependencias de runtime.
 * Formato .mjs para que Node lo ejecute directamente en tests.
 *
 * Cubre:
 *  - Filtro de registros por período (inicio/fin).
 *  - Resumen del libro de ventas (desde invoices emitidas).
 *  - Resumen del libro de compras (desde facturas de proveedores).
 */

/**
 * Filtra registros por período de fechas.
 * @param {Array<{ issued_at?: string; fecha_emision?: string; created_at?: string }>} registros
 *   Registros con al menos una fecha (issued_at, fecha_emision o created_at).
 * @param {string} inicio Fecha ISO YYYY-MM-DD.
 * @param {string} fin Fecha ISO YYYY-MM-DD.
 * @returns {Array} Registros dentro del período.
 */
export function filtrarPorPeriodo(registros = [], inicio, fin) {
  if (!inicio || !fin) return registros ?? []
  const inicioDate = new Date(`${inicio}T00:00:00`)
  const finDate = new Date(`${fin}T23:59:59`)
  return (registros ?? []).filter((r) => {
    const fecha = r.issued_at ?? r.fecha_emision ?? r.created_at
    if (!fecha) return false
    const d = new Date(fecha)
    return d >= inicioDate && d <= finDate
  })
}

/**
 * Resume el libro de ventas desde facturas emitidas (SENIAT).
 * Agrupa: base imponible, IVA, exento y total.
 * @param {Array<{ subtotal: number; iva_amount: number; exento_amount: number; total: number }>} invoices
 *   Facturas emitidas (no anuladas).
 * @returns {{ cantidad: number; base_imponible: number; iva_amount: number; exento_amount: number; total: number }}
 */
export function resumirLibroVentas(invoices = []) {
  return (invoices ?? []).reduce(
    (acc, inv) => {
      acc.cantidad += 1
      acc.base_imponible += Number(inv.subtotal) || 0
      acc.iva_amount += Number(inv.iva_amount) || 0
      acc.exento_amount += Number(inv.exento_amount) || 0
      acc.total += Number(inv.total) || 0
      return acc
    },
    { cantidad: 0, base_imponible: 0, iva_amount: 0, exento_amount: 0, total: 0 },
  )
}

/**
 * Resume el libro de compras desde facturas de proveedores.
 * Agrupa: base imponible, IVA, exento y total.
 * @param {Array<{ base_imponible: number; iva_amount: number; exento_amount: number; total: number }>} facturas
 *   Facturas recibidas de proveedores.
 * @returns {{ cantidad: number; base_imponible: number; iva_amount: number; exento_amount: number; total: number }}
 */
export function resumirLibroCompras(facturas = []) {
  return (facturas ?? []).reduce(
    (acc, f) => {
      acc.cantidad += 1
      acc.base_imponible += Number(f.base_imponible) || 0
      acc.iva_amount += Number(f.iva_amount) || 0
      acc.exento_amount += Number(f.exento_amount) || 0
      acc.total += Number(f.total) || 0
      return acc
    },
    { cantidad: 0, base_imponible: 0, iva_amount: 0, exento_amount: 0, total: 0 },
  )
}