import { z } from 'zod'
import type { SeoFaqItem } from '@/lib/seo-types'
import {
  SEO_TEMPERATURE,
  SEO_MAX_TOKENS,
  SEO_TITLE_MAX_LENGTH,
  SEO_MIN_FAQ,
  SEO_MAX_FAQ,
} from '@/lib/constants'

/**
 * Generador de contenido editorial para "Categorías de Nicho" (hubs).
 * ------------------------------------------------------------------
 * Una landing de categoría con solo una grilla de productos rankea poco.
 * Este servicio usa DeepSeek para producir, UNA sola vez por nicho:
 *   - seo_title: un H1 específico y útil para el nicho.
 *   - seo_intro: intro con H2 ("Guía de compra", "Cómo elegir ...").
 *   - seo_faq:   preguntas frecuentes visibles del nicho.
 *
 * Se guarda en la tabla `categories` y alimenta /categoria/[slug].
 */

export const hubContentSchema = z.object({
  seo_title: z.string().min(10).max(SEO_TITLE_MAX_LENGTH),
  seo_intro: z.string().min(200),
  seo_faq: z.array(z.object({
    pregunta: z.string().min(5).max(200),
    respuesta: z.string().min(20).max(600),
  })).min(SEO_MIN_FAQ).max(SEO_MAX_FAQ),
})
export type HubContent = {
  seo_title: string
  seo_intro: string
  seo_faq: SeoFaqItem[]
}

const API_URL = 'https://api.deepseek.com/v1/chat/completions'
const MODEL = 'deepseek-chat'

export type HubProductContext = {
  name: string
  specifications?: Record<string, string>
}

export type HubGenerationContext = {
  description?: string | null
  products?: HubProductContext[]
}

/**
 * Construye el prompt del hub a partir del nicho. Los encabezados H2 son
 * los que Google usa para entender la estructura de la guía.
 */
function construirPrompt(nombreCategoria: string, tieneCatalogo: boolean): string {
  return (
    'Redacta en espanol neutro una pagina de categoria original y util para quien esta decidiendo que comprar en "' + nombreCategoria + '". ' +
    (tieneCatalogo
      ? 'Usa la descripcion, los productos y sus especificaciones del mensaje de datos como contexto real. Puedes citar ejemplos de esos productos, pero no afirmes que son los unicos disponibles, los mas vendidos ni que tienen una ventaja no demostrada. '
      : 'No hay contexto de productos disponible: orienta sobre criterios generales de compra sin afirmar que el catalogo incluye marcas, modelos, funciones o rangos de precio concretos. ') +
    'SEO_TITLE: maximo ' + SEO_TITLE_MAX_LENGTH + ' caracteres. Debe identificar el nicho y ofrecer un motivo concreto para entrar (orientacion para elegir, diferencias o necesidades); evita el patron repetido "Los mejores... guia y comparativa", superlativos vacios y promesas. ' +
    'SEO_INTRO: HTML solo con <h2>,<h3>,<p>,<ul>,<li>. Incluye en este orden <h2>Guia de compra</h2>, <h2>Como elegir ' + nombreCategoria + '</h2> y <h2>Consejos utiles</h2>. Escribe 180-240 palabras sustantivas: criterios de decision, compromisos entre opciones y comprobaciones que el comprador puede hacer. Integra los datos del catalogo solo donde aporten una decision concreta; cada seccion debe ser distinta, sin introducciones obvias ni relleno. ' +
    'SEO_FAQ: genera ' + SEO_MIN_FAQ + '-' + SEO_MAX_FAQ + ' dudas reales y especificas del nicho; prioriza 3 con respuestas breves y prudentes. No afirmes disponibilidad ni caracteristicas del catalogo. ' +
    'Escribe para ayudar primero y atraer con relevancia, no con clickbait. Responde solo JSON valido: ' +
    '{"seo_title":"","seo_intro":"","seo_faq":[{"pregunta":"","respuesta":""}]}'
  )
}

/**
 * Genera (o regenera) el contenido de hub de un nicho.
 * @param nombreCategoria Nombre legible de la categoría (ej: "Tira Led RGB").
 * @returns { success, data } | { success:false, error }
 */
export async function generateHubContent(nombreCategoria: string, context: HubGenerationContext = {}) {
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) return { success: false as const, error: 'Falta DEEPSEEK_API_KEY.' }
  const nombre = (nombreCategoria ?? '').trim()
  if (!nombre) return { success: false as const, error: 'Falta el nombre de la categoria.' }
  const products = (context.products ?? []).slice(0, 6).map((product) => ({
    name: String(product.name ?? '').trim().slice(0, 140),
    specifications: Object.fromEntries(
      Object.entries(product.specifications ?? {})
        .filter(([key, value]) => key.trim() && String(value ?? '').trim())
        .slice(0, 8)
        .map(([key, value]) => [key.trim().slice(0, 40), String(value).trim().slice(0, 80)]),
    ),
  })).filter((product) => product.name)
  const description = String(context.description ?? '').trim().slice(0, 500)
  const hasCatalogContext = Boolean(description || products.length)

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: construirPrompt(nombre, hasCatalogContext) },
          {
            role: 'user',
            content: JSON.stringify({ categoria: nombre, descripcion: description, productos: products }),
          },
        ],
        temperature: SEO_TEMPERATURE,
        max_tokens: SEO_MAX_TOKENS,
      }),
    })
    if (!res.ok) return { success: false as const, error: 'DeepSeek HTTP ' + res.status }
    const body = await res.json()
    const text = String(body?.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    const valid = hubContentSchema.safeParse(parsed)
    if (!valid.success) return { success: false as const, error: 'JSON de hub no valido contra Zod.' }
    return { success: true as const, data: valid.data as HubContent }
  } catch (err: any) {
    console.error('[seo-hub] generateHubContent:', err?.message)
    return { success: false as const, error: err?.message ?? 'Error generando contenido de hub.' }
  }
}
