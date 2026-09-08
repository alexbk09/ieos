import { tool } from 'ai'
import { z } from 'zod'
import { createPublicClient } from '@/lib/supabase/public'

/**
 * Capa del Agente de Compra Inteligente.
 * Centraliza las tools que el LLM usa para consultar el catalogo real de
 * Supabase. Ningun componente llama supabase.from() directamente (regla de oro).
 * Usa cliente publico: RLS de products permite SELECT publico.
 */

const AGENT_PRODUCT_SELECT =
  'id,name,slug,description,price_usd,stock,image_url,colors,pricing_type,' +
  'price_per_kilo_usd,price_per_gram_usd,stock_grams,min_order_grams,unit_label,' +
  'bulk_discount_percent,category_id,featured,specifications,' +
  'product_categories(categories(id,name,slug)),product_images(id,url,alt_text,sort_order,color_name)'

export const AGENT_SYSTEM_PROMPT =
  'Eres el Asistente de Compra de ilumaX (tienda LED Venezuela). Habla espanol breve. ' +
  'Usa buscarProductos antes de recomendar. Nunca inventes precios/stock. ' +
  'Espera confirmacion y pregunta cantidad/color antes de agregarAlCarrito.'

/** Mapea una fila de products al snapshot que el frontend necesita para el carrito. */
function toCartProduct(p: any) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price_usd: Number(p.price_usd),
    stock: p.stock,
    image_url: p.image_url ?? '',
    colors: p.colors ?? [],
    specifications: p.specifications ?? {},
    category_id: p.category_id,
    featured: p.featured ?? false,
    pricing_type: p.pricing_type === 'weight' ? 'weight' : 'unit',
    price_per_kilo_usd: Number(p.price_per_kilo_usd ?? 0),
    price_per_gram_usd: Number(p.price_per_gram_usd ?? 0),
    stock_grams: Number(p.stock_grams ?? 0),
    min_order_grams: Number(p.min_order_grams ?? 0),
    unit_label: p.unit_label ?? 'u',
    bulk_discount_percent: Number(p.bulk_discount_percent ?? 0),
    categories: (p.product_categories ?? []).map((pc: any) => pc.categories).filter(Boolean),
    images: p.product_images ?? [],
  }
}

export const buscarProductosTool = tool({
  description:
    'Busca productos reales del catalogo ilumaX por texto libre. ' +
    'Devuelve el snapshot completo util para recomendar y agregar al carrito.',
  parameters: z.object({
    query: z.string().describe('Termino a buscar (ej: panel led, perfil)'),
    maxResults: z.number().min(1).max(6).default(6).describe('Resultados maximos'),
  }),
  execute: async ({ query, maxResults }) => {
    try {
      const supabase = createPublicClient()
      const term = query.trim()
      const { data, error } = await supabase
        .from('products')
        .select(AGENT_PRODUCT_SELECT)
        .eq('is_available', true)
        .or('name.ilike.%' + term + '%,description.ilike.%' + term + '%')
        .order('sort_order', { ascending: true })
        .limit(maxResults)
      if (error) return { ok: false, error: 'No pudimos consultar el catalogo' }
      if (!data || data.length === 0) return { ok: true, products: [] }
      const products = (data as any[]).map(toCartProduct)
      return { ok: true, products }
    } catch {
      return { ok: false, error: 'Error interno consultando el catalogo' }
    }
  },
})

export const agregarAlCarritoSchema = z.object({
  productId: z.string().describe('ID del producto (UUID) aprobado por el cliente'),
  quantity: z.number().min(1).describe('Cantidad: unidades o gramos segun el producto'),
  unit: z.string().optional().describe("Unidad ('u', 'g' o 'kg')"),
  colorName: z.string().optional().describe('Color exacto elegido'),
})

/** Tool sin execute: la ejecuta el frontend via onToolCall (mutar carrito React). */
export const agregarAlCarritoTool = tool({
  description: 'Agrega al carrito el producto que el cliente aprobo.',
  parameters: agregarAlCarritoSchema,
})

export const AGENT_TOOLS = {
  buscarProductos: buscarProductosTool,
  agregarAlCarrito: agregarAlCarritoTool,
}
