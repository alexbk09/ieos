import { z } from 'zod'

export const seoContentSchema = z.object({
  titulo_seo: z.string().min(10).max(60),
  slug: z.string().min(3).max(80),
  descripcion_html: z.string().min(200),
})
export type SeoContent = z.infer<typeof seoContentSchema>

const SYSTEM_PROMPT =
  'Eres redactor SEO senior de AliExpress en espanol neutro. Convierte el JSON de entrada en contenido unico para ficha afiliada. Traduce a espanol sin anglicismos. NO inventes peso/tamano/material (usa solo datos de entrada). NO repitas frases. descripcion_html SOLO con <h2>,<h3>,<p>,<ul>,<li>: incluye <h2>Caracteristicas principales</h2> con bullets, <h2>Especificaciones fisicas</h2> si hay peso/tamano, y <h2>Preguntas Frecuentes (FAQ)</h2> con 3 <h3> y <p> cortos. titulo_seo: 40-60 caracteres marca+beneficio+producto. slug: 3-8 palabras en minusculas con guiones. Responde SOLO JSON {"titulo_seo":"","slug":"","descripcion_html":""}'

const API_URL = 'https://api.deepseek.com/v1/chat/completions'
const MODEL = 'deepseek-chat'

export async function generateSeoContent(input: { nombre?: string; crudo?: string; specs?: Record<string, string> }) {
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) return { success: false as const, error: 'Falta DEEPSEEK_API_KEY.' }
  if (!input?.nombre?.trim() && !input?.crudo?.trim()) return { success: false as const, error: 'Faltan datos.' }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(input) },
        ],
        temperature: 0.4,
        max_tokens: 900,
      }),
    })
    if (!res.ok) return { success: false as const, error: 'DeepSeek HTTP ' + res.status }
    const body = await res.json()
    const text = String(body?.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    const valid = seoContentSchema.safeParse(parsed)
    if (!valid.success) return { success: false as const, error: 'JSON IA no valido contra Zod.' }
    return { success: true as const, data: valid.data }
  } catch (err: any) {
    return { success: false as const, error: err?.message ?? 'Error llamando a DeepSeek.' }
  }
}