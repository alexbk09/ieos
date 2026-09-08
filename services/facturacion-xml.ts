import { createClient as createServerClient } from '@/lib/supabase/server'
import { generarXMLFactura, validarXMLFactura } from '@/lib/factura-xml'

/**
 * Servicio de facturación XML SENIAT.
 * Capa única de acceso a Supabase. Genera el XML de facturas emitidas
 * usando la lógica pura de lib/factura-xml.mjs y lo guarda vía la RPC
 * transaccional generar_xml_factura (valida permisos).
 */

// ---------- Tipos ----------

export type EnvioSeniat = {
  id: string
  invoice_id: string
  estado: 'generado' | 'firmado' | 'enviado' | 'rechazado' | 'anulado'
  payload_xml: string | null
  respuesta_seniat: Record<string, unknown>
  intentos: number
  created_at: string
}

// ---------- Consultas ----------

/**
 * Obtiene las facturas emitidas con su XML y estado de envío.
 */
export async function getFacturasParaXML(): Promise<{ data: any[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const [{ data: invoices }, { data: envios }] = await Promise.all([
    supabase.from('invoices').select('*').eq('status', 'issued').order('issued_at', { ascending: false }).limit(200),
    supabase.from('envio_facturas_seniat').select('*').order('created_at', { ascending: false }).limit(500),
  ])

  if (!invoices) return { data: null, error: { message: 'No se pudieron cargar las facturas.' } }

  const envioPorFactura = new Map<string, EnvioSeniat>()
  for (const envio of (envios ?? []) as EnvioSeniat[]) {
    if (!envioPorFactura.has(envio.invoice_id)) {
      envioPorFactura.set(envio.invoice_id, envio)
    }
  }

  const normalized = ((invoices ?? []) as any[]).map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    issued_at: inv.issued_at,
    customer_name: inv.customer_name,
    total: Number(inv.total ?? 0),
    xml_generado: inv.xml_generado ?? null,
    envio: envioPorFactura.get(inv.id) ?? null,
  }))

  return { data: normalized, error: null }
}

// ---------- Mutaciones ----------

/**
 * Genera el XML de una factura emitida y lo guarda (RPC).
 * Usa la calculadora pura para construir el XML y lo valida antes de enviar.
 * @param invoiceId ID de la factura emitida.
 */
export async function generarXML(invoiceId: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()

  // 1) Cargar la factura con sus ítems.
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invoiceError || !invoice) return { ok: false, error: { message: invoiceError?.message ?? 'Factura no encontrada.' } }

  // 2) Cargar configuración del emisor.
  const { data: settings } = await supabase.from('invoice_settings').select('issuer_name, issuer_rif, issuer_address').eq('id', 1).maybeSingle()

  // 3) Construir el XML con la lógica pura.
  const xml = generarXMLFactura(invoice, {
    issuer_name: (settings as any)?.issuer_name ?? invoice.issuer_name,
    issuer_rif: (settings as any)?.issuer_rif ?? invoice.issuer_rif,
    issuer_address: (settings as any)?.issuer_address ?? invoice.issuer_address,
  })

  // 4) Validar la estructura antes de guardar.
  const validacion = validarXMLFactura(xml)
  if (!validacion.valid) {
    return { ok: false, error: { message: `El XML generado es inválido: ${validacion.errores.join(', ')}` } }
  }

  // 5) Guardar vía RPC transaccional.
  const { data, error } = await supabase.rpc('generar_xml_factura', {
    p_invoice_id: invoiceId,
    p_xml: xml,
  })
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: Boolean(data), error: null }
}

/**
 * Descarga el XML de una factura (texto plano).
 * @param invoiceId ID de la factura.
 */
export async function getXMLFactura(invoiceId: string): Promise<{ data: string | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('invoices').select('xml_generado').eq('id', invoiceId).maybeSingle()
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data as any)?.xml_generado ?? null, error: null }
}