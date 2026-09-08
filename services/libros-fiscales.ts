import { createClient as createServerClient } from '@/lib/supabase/server'
import { filtrarPorPeriodo, resumirLibroCompras, resumirLibroVentas } from '@/lib/fiscal-books'

/**
 * Servicio de libros fiscales automatizados.
 * Capa única de acceso a Supabase. Genera el libro de ventas desde
 * la tabla invoices (facturas emitidas) y el libro de compras desde
 * la tabla facturas_proveedor. El resumen/filtro del período usa la
 * lógica pura de lib/fiscal-books.mjs (con tests).
 */

// ---------- Tipos ----------

export type FacturaProveedor = {
  id: string
  proveedor_id: string | null
  numero_factura: string
  emisor_rif: string
  emisor_nombre: string | null
  base_imponible: number
  iva_amount: number
  exento_amount: number
  total: number
  fecha_emision: string
  created_at: string
  proveedor_nombre?: string | null
}

// ---------- Consultas ----------

/**
 * Obtiene las facturas emitidas (no anuladas) para generar el libro de ventas.
 */
export async function getInvoicesParaLibroVentas(): Promise<{ data: any[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number, issuer_rif, customer_name, customer_document, subtotal, iva_amount, exento_amount, total, issued_at')
    .eq('status', 'issued')
    .order('issued_at', { ascending: false })
    .limit(2000)
  if (error) return { data: null, error: { message: error.message } }
  return { data: data ?? [], error: null }
}

/**
 * Obtiene las facturas de proveedores para el libro de compras.
 */
export async function getFacturasProveedor(): Promise<{ data: FacturaProveedor[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('facturas_proveedor')
    .select('*, proveedores(nombre)')
    .order('fecha_emision', { ascending: false })
    .limit(2000)
  if (error) return { data: null, error: { message: error.message } }

  const normalized = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    proveedor_id: row.proveedor_id,
    numero_factura: row.numero_factura,
    emisor_rif: row.emisor_rif,
    emisor_nombre: row.emisor_nombre,
    base_imponible: Number(row.base_imponible ?? 0),
    iva_amount: Number(row.iva_amount ?? 0),
    exento_amount: Number(row.exento_amount ?? 0),
    total: Number(row.total ?? 0),
    fecha_emision: row.fecha_emision,
    created_at: row.created_at,
    proveedor_nombre: (row.proveedores as any)?.nombre ?? null,
  }))

  return { data: normalized, error: null }
}

/**
 * Genera el libro de ventas de un período.
 * @param inicio Fecha ISO YYYY-MM-DD.
 * @param fin Fecha ISO YYYY-MM-DD.
 */
export async function getLibroVentas(inicio: string, fin: string): Promise<{ data: { registros: any[]; resumen: any } | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await getInvoicesParaLibroVentas()
  if (error) return { data: null, error }

  const registros = filtrarPorPeriodo((data ?? []) as any[], inicio, fin)
  const resumen = resumirLibroVentas(registros)

  return { data: { registros, resumen }, error: null }
}

/**
 * Genera el libro de compras de un período.
 * @param inicio Fecha ISO YYYY-MM-DD.
 * @param fin Fecha ISO YYYY-MM-DD.
 */
export async function getLibroCompras(inicio: string, fin: string): Promise<{ data: { registros: FacturaProveedor[]; resumen: any } | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await getFacturasProveedor()
  if (error) return { data: null, error }

  const registros = filtrarPorPeriodo((data ?? []) as any[], inicio, fin)
  const resumen = resumirLibroCompras(registros)

  return { data: { registros, resumen }, error: null }
}

// ---------- Mutaciones ----------

/**
 * Registra una factura de proveedor (libro de compras).
 */
export async function crearFacturaProveedor(input: {
  proveedor_id?: string | null
  numero_factura: string
  emisor_rif: string
  emisor_nombre?: string | null
  base_imponible: number
  iva_amount: number
  exento_amount?: number
  total: number
  fecha_emision: string
}): Promise<{ data: FacturaProveedor | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  if (!input.numero_factura.trim() || !input.emisor_rif.trim()) {
    return { data: null, error: { message: 'El número de factura y el RIF del emisor son obligatorios.' } }
  }

  const { data, error } = await supabase
    .from('facturas_proveedor')
    .insert({
      proveedor_id: input.proveedor_id ?? null,
      numero_factura: input.numero_factura.trim(),
      emisor_rif: input.emisor_rif.trim(),
      emisor_nombre: input.emisor_nombre?.trim() || null,
      base_imponible: Number(input.base_imponible) || 0,
      iva_amount: Number(input.iva_amount) || 0,
      exento_amount: Number(input.exento_amount) || 0,
      total: Number(input.total) || 0,
      fecha_emision: input.fecha_emision || new Date().toISOString().slice(0, 10),
    })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as FacturaProveedor, error: null }
}

/**
 * Registra una exportación de libro fiscal (historial).
 */
export async function registrarExportacion(tipo: 'compra' | 'venta', inicio: string, fin: string, formato: 'pdf' | 'excel'): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('libros_fiscales_exportaciones').insert({
    tipo,
    periodo_inicio: inicio,
    periodo_fin: fin,
    formato,
  })
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}

/**
 * Obtiene el historial de exportaciones.
 */
export async function getExportaciones(): Promise<{ data: any[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('libros_fiscales_exportaciones').select('*').order('created_at', { ascending: false }).limit(50)
  if (error) return { data: null, error: { message: error.message } }
  return { data: data ?? [], error: null }
}