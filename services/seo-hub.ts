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
 *   - seo_title: H1 largo tipo "Los mejores {nicho} — Guía {año}".
 *   - seo_intro: intro con H2 ("Guía de compra", "Cómo elegir ...").
 *   - seo_faq:   preguntas frecuentes del nicho (alimenta FAQPage).
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

/**
 * Construye el prompt del hub a partir del nicho. Los encabezados H2 son
 * los que Google usa para entender la estructura de la guía.
 */
function construirPrompt(nombreCategoria: string): string {
  return (
    'Eres redactor SEO senior especializado en paginas de categoria (hubs) de e-commerce. ' +
    'Genera contenido UNICO en espanol neutro para la categoria "' + nombreCategoria + '". ' +
    'REGLAS OBLIGATORIAS: ' +
    '1) "seo_title": titulo H1 atractivo de maximo ' + SEO_TITLE_MAX_LENGTH + ' caracteres, con patron de intencion de compra (ej: "Los mejores ' + nombreCategoria + ' — Guia y comparativa"). ' +
    '2) "seo_intro": HTML con SOLO <h2>,<h3>,<p>,<ul>,<li>. Incluye <h2>Guia de compra</h2>, <h2>Como elegir ' + nombreCategoria + '</h2> y un <h2>Consejos utiles</h2>. Minimo 200 caracteres utiles, sin relleno. ' +
    '3) "seo_faq": [' + SEO_MIN_FAQ + '-' + SEO_MAX_FAQ + '] preguntas frecuentes reales del nicho. ' +
    'PROHIBIDO inventar marcas especificas, precios o datos tecnicos. Responde EXCLUSIVAMENTE con JSON: ' +
    '{"seo_title":"","seo_intro":"","seo_faq":[{"pregunta":"","respuesta":""}]}'
  )
}

/**
 * Genera (o regenera) el contenido de hub de un nicho.
 * @param nombreCategoria Nombre legible de la categoría (ej: "Tira Led RGB").
 * @returns { success, data } | { success:false, error }
 */
export async function generateHubContent(nombreCategoria: string) {
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) return { success: false as const, error: 'Falta DEEPSEEK_API_KEY.' }
  const nombre = (nombreCategoria ?? '').trim()
  if (!nombre) return { success: false as const, error: 'Falta el nombre de la categoria.' }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: construirPrompt(nombre) },
          { role: 'user', content: JSON.stringify({ categoria: nombre }) },
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
