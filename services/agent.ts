import { tool } from 'ai'
import { z } from 'zod'
import { createPublicClient } from '@/lib/supabase/public'
// Localización de los textos de producto/categoría devueltos al asistente.
import { resolveProductTranslations, resolveLocalizedValue } from '@/lib/i18n-content'
import { localeLlmName } from '@/lib/i18n-config'
// Estado de disponibilidad del marketplace (lógica pura compartida).
import { ALI_ESTADO } from '@/lib/ali-availability'
import {
  AGENT_BRAND_NAME,
  AGENT_MAX_CATEGORY_RESULTS,
  AGENT_MAX_PRODUCT_RESULTS,
  AGENT_MIN_QUERY_LENGTH,
  DEFAULT_LOCALE,
  SOURCE_LOCALE,
} from '@/lib/constants'

/** Envuelve una promesa sin esperarla: tracking fire-and-forget del agente. */
function trackAgentSearchInBackground(query: string, productIds: string[], resultsCount: number) {
  try {
    const supabase = createPublicClient()
    // Registro de la busqueda IA + impresiones de productos en una sola RPC.
    // Se usa una promesa async auto-ejecutada para no bloquear la respuesta
    // del modelo y capturar errores de red sin romper la conversacion.
    void (async () => {
      try {
        await supabase.rpc('track_agent_search', {
          p_query: query,
          p_results_count: resultsCount,
          p_product_ids: productIds.filter(Boolean),
        })
      } catch (e: any) {
        console.error('[agent] track_agent_search:', e?.message)
      }
    })()
  } catch {
    // El tracking nunca debe romper la conversacion del asistente.
  }
}

/**
 * Capa del Agente de Compra Inteligente (catalogo + afiliacion).
 * ------------------------------------------------------------------
 * Responsabilidad UNICA: exponer las tools con las que el LLM consulta el
 * catalogo REAL de Supabase (productos y categorias) y agrega al carrito.
 * Ningun componente llama supabase.from() directamente (regla de oro).
 * Usa cliente publico: RLS de products/categories permite SELECT publico.
 */

const AGENT_PRODUCT_SELECT =
  'id,name,slug,description,titulo_seo,translations,price_usd,stock,image_url,colors,pricing_type,' +
  'price_per_kilo_usd,price_per_gram_usd,stock_grams,min_order_grams,unit_label,' +
  'bulk_discount_percent,category_id,featured,specifications,ali_status,' +
  'url_afiliado_ali,url_afiliado_amazon,url_afiliado_store,' +
  'product_categories(categories(id,name,slug,name_i18n,slug_i18n)),product_images(id,url,alt_text,sort_order,color_name)'

/** Proyeccion ligera de categorias para orientar al cliente por tema. */
const AGENT_CATEGORY_SELECT = 'id,name,slug,description,name_i18n,slug_i18n'

/** Opciones de resolución i18n (fuente única: lib/constants.ts). */
const I18N_RESOLVE_OPTIONS = { sourceLocale: SOURCE_LOCALE, defaultLocale: DEFAULT_LOCALE }

/**
 * Prompt del sistema: define el ALCANCE del asistente.
 * El agente SOLO responde sobre la tienda (productos, categorias y compras
 * por afiliados AliExpress/Amazon). Cualquier tema ajeno se rechaza en una
 * frase y se reconduce al catalogo: se logra instruyendo el modelo, sin
 * listas negras fragiles de palabras.
 */
export function buildAgentSystemPrompt(locale: string) {
  // Idioma de respuesta = idioma activo del sitio. El prompt (alcance) es fijo;
  // solo cambia la instrucción final de idioma.
  const language = localeLlmName(locale)
  return [
  `Eres el asistente oficial de ${AGENT_BRAND_NAME}, una tienda que recomienda productos y cierra la compra como afiliado en AliExpress/Amazon.`,
  'ALCANCE PERMITIDO (solo puedes responder sobre esto):',
  '1) Productos del catalogo: caracteristicas, precios, stock, colores y disponibilidad.',
  '2) Categorias de la tienda y que productos las componen.',
  '3) Compras por afiliado: como comprar, enlaces de afiliado, redireccion a AliExpress/Amazon, envio, garantia y devoluciones del marketplace.',
  '4) Uso de la tienda: carrito, busqueda y navegacion.',
  `FUERA DE TEMA: si la pregunta no tiene relacion con la tienda, sus productos, sus categorias o las compras por afiliado (por ejemplo cultura general, noticias, codigo, tareas, consejos personales o politica), NO la respondas. Rechaza en una sola frase: "Solo puedo ayudarte con productos, categorias y compras por afiliados de ${AGENT_BRAND_NAME}." y ofrece volver al catalogo.`,
  'DATOS: usa siempre buscarProductos o buscarCategorias antes de hablar de productos, precios o stock. Nunca inventes datos ni enlaces.',
  'Si un producto no tiene enlace de afiliado, dilo con claridad y ofrece alternativas del catalogo.',
  'Para agregar al carrito, espera la confirmacion del cliente y pregunta cantidad y color.',
  'Si el producto es por peso (pricing_type=weight), confirma gramos o kilos y respeta min_order_grams.',
  `IDIOMA: responde SIEMPRE en ${language} (el idioma del visitante), breve (2 a 4 frases), con tono cercano y profesional.`,
  ].join(' ')
}

/** Prompt del sistema en el idioma por defecto (compatibilidad / uso directo). */
export const AGENT_SYSTEM_PROMPT = buildAgentSystemPrompt(DEFAULT_LOCALE)

/** Mapea una fila de products al snapshot que el frontend necesita para el carrito. */
function toCartProduct(p: any, locale: string) {
  // Textos del idioma activo (con fallback al idioma raíz).
  const { name } = resolveProductTranslations(
    p.translations,
    { name: p.name, titulo_seo: p.titulo_seo },
    locale,
    I18N_RESOLVE_OPTIONS,
  )
  return {
    id: p.id,
    name: name || p.name,
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
    // Enlaces de afiliado: el frontend los usa para el boton de compra y para
    // que el checkout hibrido redirija al marketplace correcto.
    url_afiliado_ali: p.url_afiliado_ali ?? null,
    url_afiliado_amazon: p.url_afiliado_amazon ?? null,
    url_afiliado_store: p.url_afiliado_store ?? null,
    has_affiliate_link: Boolean(p.url_afiliado_ali || p.url_afiliado_amazon || p.url_afiliado_store),
    categories: (p.product_categories ?? [])
      .map((pc: any) => pc.categories)
      .filter(Boolean)
      .map((c: any) => ({
        id: c.id,
        name: resolveLocalizedValue(c.name_i18n, locale, I18N_RESOLVE_OPTIONS) || c.name,
        slug: resolveLocalizedValue(c.slug_i18n, locale, I18N_RESOLVE_OPTIONS) || c.slug,
      })),
    images: p.product_images ?? [],
  }
}

export function createBuscarProductosTool(locale: string) {
  return tool({
  description:
    `Busca productos reales del catalogo ${AGENT_BRAND_NAME} por texto libre y/o por categoria. ` +
    'Devuelve el snapshot completo (precio, stock, colores y enlace de afiliado) ' +
    'util para recomendar y agregar al carrito.',
  parameters: z.object({
    query: z.string().describe('Termino a buscar (ej: panel led, perfil). Puede ir vacio si se filtra por categoria.'),
    categorySlug: z.string().optional().describe('Slug de categoria para acotar la busqueda (ver buscarCategorias).'),
    maxResults: z.number().min(1).max(AGENT_MAX_PRODUCT_RESULTS).default(AGENT_MAX_PRODUCT_RESULTS).describe('Resultados maximos'),
  }),
  execute: async ({ query, categorySlug, maxResults }) => {
    try {
      const supabase = createPublicClient()
      const term = query?.trim() ?? ''
      const catSlug = categorySlug?.trim() ?? ''

      // Filtro por categoria: resuelve su id y luego los productos vinculados
      // (product_categories). Sin coincidencias -> lista vacia.
      let categoryProductIds: string[] | null = null
      if (catSlug) {
        const { data: cat } = await supabase
          .from('categories')
          .select('id')
          .eq('slug', catSlug)
          .maybeSingle()
        if (!cat?.id) return { ok: true, products: [] }
        const { data: links } = await supabase
          .from('product_categories')
          .select('product_id')
          .eq('category_id', cat.id)
        categoryProductIds = [...new Set((links ?? []).map((r: any) => r.product_id))]
        if (categoryProductIds.length === 0) {
          // Analitica: la busqueda del agente sin resultados tambien se registra.
          trackAgentSearchInBackground(term || catSlug, [], 0)
          return { ok: true, products: [] }
        }
      }

      let dbQuery = supabase.from('products').select(AGENT_PRODUCT_SELECT).eq('is_available', true)
      // El filtro de texto solo se aplica con terminos utiles (evita un .or vacio).
      if (term.length >= AGENT_MIN_QUERY_LENGTH) {
        dbQuery = dbQuery.or('name.ilike.%' + term + '%,description.ilike.%' + term + '%')
      }
      if (categoryProductIds) {
        dbQuery = dbQuery.in('id', categoryProductIds)
      }

      const { data, error } = await dbQuery.order('sort_order', { ascending: true }).limit(maxResults)
      if (error) return { ok: false, error: 'No pudimos consultar el catalogo' }
      if (!data || data.length === 0) {
        trackAgentSearchInBackground(term || catSlug, [], 0)
        return { ok: true, products: [] }
      }
      // Los productos verificados como NO disponibles en AliExpress (migración
      // 0058) no se recomiendan: su ficha sigue viva (SEO-safe) pero la IA no
      // debe ofrecer como comprable algo que ya no lo es.
      const disponibles = (data as any[]).filter((p) => p.ali_status !== ALI_ESTADO.UNAVAILABLE)
      if (disponibles.length === 0) {
        trackAgentSearchInBackground(term || catSlug, [], 0)
        return { ok: true, products: [] }
      }
      const products = disponibles.map((p) => toCartProduct(p, locale))
      // Analitica: registra la busqueda y que productos mostro la IA al cliente.
      trackAgentSearchInBackground(term || catSlug, products.map((p) => p.id), products.length)
      return { ok: true, products }
    } catch {
      return { ok: false, error: 'Error interno consultando el catalogo' }
    }
  },
  })
}

export function createBuscarCategoriasTool(locale: string) {
  return tool({
  description:
    `Lista o busca las categorias reales del catalogo ${AGENT_BRAND_NAME}. Usala para ` +
    'orientar al cliente por tema y luego buscar productos con su slug.',
  parameters: z.object({
    query: z.string().optional().describe('Texto opcional (ej: iluminacion, hogar). Vacio = categorias principales.'),
    maxResults: z.number().min(1).max(AGENT_MAX_CATEGORY_RESULTS).default(AGENT_MAX_CATEGORY_RESULTS).describe('Resultados maximos'),
  }),
  execute: async ({ query, maxResults }) => {
    try {
      const supabase = createPublicClient()
      const term = query?.trim() ?? ''
      let dbQuery = supabase.from('categories').select(AGENT_CATEGORY_SELECT).eq('activa', true)
      if (term.length >= AGENT_MIN_QUERY_LENGTH) {
        dbQuery = dbQuery.or('name.ilike.%' + term + '%,slug.ilike.%' + term + '%,description.ilike.%' + term + '%')
      }
      const { data, error } = await dbQuery.order('name', { ascending: true }).limit(maxResults)
      if (error) return { ok: false, error: 'No pudimos consultar las categorias' }
      const categories = (data ?? []).map((c: any) => ({
        id: c.id,
        name: resolveLocalizedValue(c.name_i18n, locale, I18N_RESOLVE_OPTIONS) || c.name,
        slug: resolveLocalizedValue(c.slug_i18n, locale, I18N_RESOLVE_OPTIONS) || c.slug,
        description: c.description ?? null,
      }))
      // Analitica: la busqueda por categorias tambien cuenta como busqueda del agente.
      trackAgentSearchInBackground(term || 'categorias', [], categories.length)
      return { ok: true, categories }
    } catch {
      return { ok: false, error: 'Error interno consultando las categorias' }
    }
  },
  })
}

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

/**
 * Crea el juego de tools del asistente para un idioma concreto.
 * Se instancian POR PETICIÓN para que los nombres de producto y categoría se
 * devuelvan en el idioma activo del visitante (SEO/UX coherentes).
 */
export function createAgentTools(locale: string) {
  return {
    buscarProductos: createBuscarProductosTool(locale),
    buscarCategorias: createBuscarCategoriasTool(locale),
    agregarAlCarrito: agregarAlCarritoTool,
  }
}