import { z } from 'zod'
import type { SeoFaqItem } from '@/lib/seo-types'
import { validarCalidadSeo as validarCalidadSeoReglas } from '@/lib/seo-rules'
import {
  SEO_TEMPERATURE,
  SEO_MAX_TOKENS,
  SEO_TITLE_MIN_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  SEO_MIN_KEYWORDS,
  SEO_MAX_KEYWORDS,
  SEO_MIN_FAQ,
  SEO_MAX_FAQ,
  SEO_MIN_DESCRIPTION_CHARS,
  SEO_BANNED_PHRASES,
  SEO_REQUIRED_SECTIONS,
  SEO_OPTIONAL_SPECS_SECTION,
} from '@/lib/constants'

/**
 * Cerebro SEO del catálogo (DeepSeek).
 * ------------------------------------------------------------------
 * Convierte el título crudo de AliExpress en contenido ÚNICO y sin
 * duplicados (objetivo pSEO): título llamativo optimizado, HTML
 * semántico con jerarquía H2/H3, palabras clave long-tail y FAQ
 * estructurada (que luego alimenta el schema FAQPage de Google).
 *
 * POR QUÉ valida dos veces (Zod + reglas de negocio):
 *  - Zod garantiza la FORMA del JSON (tipos y longitudes).
 *  - `validarCalidadSeo` garantiza el FONDO (sin frases genéricas,
 *    con las secciones H2 obligatorias y sin H1 duplicado). Así el
 *    pipeline nunca guarda contenido que Google penalizaría.
 */

// ---------- Esquemas (contrato del LLM) ----------

/** Pregunta/respuesta frecuente generada por la IA. */
export const seoFaqItemSchema = z.object({
  pregunta: z.string().min(5).max(200),
  respuesta: z.string().min(20).max(600),
})

export const seoContentSchema = z.object({
  titulo_seo: z.string().min(10).max(SEO_TITLE_MAX_LENGTH),
  slug: z.string().min(3).max(80),
  descripcion_html: z.string().min(SEO_MIN_DESCRIPTION_CHARS),
  keywords: z.array(z.string().min(2).max(60)).min(SEO_MIN_KEYWORDS).max(SEO_MAX_KEYWORDS),
  faq: z.array(seoFaqItemSchema).min(SEO_MIN_FAQ).max(SEO_MAX_FAQ),
})
export type SeoContent = z.infer<typeof seoContentSchema>
export type { SeoFaqItem }

// ---------- Prompt del sistema (construido desde constantes) ----------

const SECCION_1 = SEO_REQUIRED_SECTIONS[0]
const SECCION_2 = SEO_REQUIRED_SECTIONS[1]
const FRASES_PROHIBIDAS = SEO_BANNED_PHRASES.slice(0, 6).join(', ')

const SYSTEM_PROMPT =
  'Redacta en espanol neutro contenido original y practico para esta ficha. Describe solo lo que respaldan nombre, contexto y specs; transforma datos comprobables en utilidad concreta, sin atribuir beneficios que no se deduzcan de ellos. ' +
  'TITULO_SEO: ' + SEO_TITLE_MIN_LENGTH + '-' + SEO_TITLE_MAX_LENGTH + ' caracteres. Incluye marca si existe, tipo de producto y una ventaja o uso verificable; integra la keyword si encaja. Debe distinguir esta ficha, no prometer resultados ni usar clickbait. ' +
  'SLUG: 3-8 palabras minusculas con guiones, sin numeros ni palabras vacias. ' +
  'DESCRIPCION_HTML: solo <h2>,<h3>,<p>,<ul>,<li>,<strong>; incluye <h2>' + SECCION_1 + '</h2> con bullets concretos y <h2>' + SECCION_2 + '</h2> con 3 preguntas en <h3> y respuestas breves en <p>; sin <h1>. Si hay specs, agrega <h2>' + SEO_OPTIONAL_SPECS_SECTION + '</h2> y un parrafo fluido de 2-4 frases que integre cada dato util sin enumerar claves. Explica su relevancia solo cuando sea evidente; no completes datos ausentes. ' +
  'KEYWORDS: elige ' + SEO_MIN_KEYWORDS + '-' + SEO_MAX_KEYWORDS + ' consultas long-tail distintas y naturales (prioriza 5-7 buenas frente a variantes repetidas). FAQ JSON: ' + SEO_MIN_FAQ + '-' + SEO_MAX_FAQ + ' preguntas concretas de comprador; prioriza 3 y responde sin repetir literalmente la descripcion. ' +
  'Evita clichés de AliExpress (' + FRASES_PROHIBIDAS + '), relleno, anglicismos innecesarios y afirmaciones de peso, tamano, material, compatibilidad, reseñas o rendimiento que no esten en los datos. No repitas texto entre campos. ' +
  'Responde solo JSON valido con esta forma: ' +
  '{"titulo_seo":"","slug":"","descripcion_html":"","keywords":[],"faq":[{"pregunta":"","respuesta":""}]}'

// ---------- Endpoint oficial ----------

const API_URL = 'https://api.deepseek.com/v1/chat/completions'
const MODEL = 'deepseek-chat'

// ---------- Validación de calidad ----------
// La lógica pura vive en lib/seo-rules.mjs (testeable con node --test).
// Este wrapper solo inyecta los valores de configuración centralizados.

/**
 * Valida el FONDO del contenido generado (frases genéricas, longitud del
 * título, secciones H2 obligatorias y ausencia de <h1> duplicado).
 * @param data Contenido SEO generado.
 * @param opciones.tieneSpecs TRUE si el producto trae especificaciones físicas:
 *   en ese caso la sección de especificaciones en prosa pasa a ser obligatoria.
 * @returns { ok, errores } — errores listos para re-prompt o para logging.
 */
export function validarCalidadSeo(
  data: SeoContent,
  opciones: { tieneSpecs?: boolean } = {},
): { ok: boolean; errores: string[] } {
  const resultado = validarCalidadSeoReglas(data, {
    bannedPhrases: [...SEO_BANNED_PHRASES],
    requiredSections: [...SEO_REQUIRED_SECTIONS],
    minTitleLength: SEO_TITLE_MIN_LENGTH,
  })

  // La sección de especificaciones en prosa es obligatoria SOLO cuando hay
  // datos físicos reales: así la ficha técnica nunca queda en blanco.
  const faltoEspecificaciones =
    Boolean(opciones.tieneSpecs) &&
    !String(data.descripcion_html ?? '')
      .toLowerCase()
      .includes(SEO_OPTIONAL_SPECS_SECTION.toLowerCase())
  if (faltoEspecificaciones) {
    resultado.errores.push(
      'Falta la seccion obligatoria "' + SEO_OPTIONAL_SPECS_SECTION + '" (el producto trae especificaciones fisicas).',
    )
    resultado.ok = false
  }

  return resultado
}

// ---------- Llamada al modelo ----------

/** Ejecuta una llamada a DeepSeek y devuelve el texto crudo de la respuesta. */
async function llamarDeepSeek(
  apiKey: string,
  messages: { role: 'system' | 'user'; content: string }[],
): Promise<{ success: true; text: string } | { success: false; error: string }> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: SEO_TEMPERATURE,
        max_tokens: SEO_MAX_TOKENS,
      }),
    })
    if (!res.ok) return { success: false, error: 'DeepSeek HTTP ' + res.status }
    const body = await res.json()
    const text = String(body?.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
    if (!text) return { success: false, error: 'DeepSeek devolvio una respuesta vacia.' }
    return { success: true, text }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Error llamando a DeepSeek.' }
  }
}

// ---------- API pública ----------

export type GenerateSeoInput = {
  /** Nombre/título de fábrica del producto (fuente autoritativa). */
  nombre?: string
  /** Contexto crudo adicional (precio, specs) serializado como JSON. */
  crudo?: string
  /** Especificaciones físicas extraídas por el scraper. */
  specs?: Record<string, string>
  /** Keyword del nicho para orientar el título (pSEO). */
  keyword?: string
  /** Marca detectada (se usa en el título si existe). */
  marca?: string
  /** Títulos ya existentes que el modelo debe evitar (anti-duplicado). */
  evitarTitulos?: string[]
}

/** TRUE si hay al menos una especificación física útil para redactar en prosa. */
function tieneEspecificaciones(specs?: Record<string, string>): boolean {
  return Object.values(specs ?? {}).some((valor) => String(valor ?? '').trim().length > 0)
}

/**
 * Genera el contenido SEO único de un producto.
 * Hace hasta 2 intentos: si el primero no pasa la validación de calidad,
 * reintenta una sola vez pasándole los errores para autocorregir (coste
 * acotado y mayor tasa de éxito).
 */
export async function generateSeoContent(input: GenerateSeoInput) {
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) return { success: false as const, error: 'Falta DEEPSEEK_API_KEY.' }
  if (!input?.nombre?.trim() && !input?.crudo?.trim()) return { success: false as const, error: 'Faltan datos.' }

  // Contexto que ve el modelo: datos reales + objetivos de optimización.
  const payload = JSON.stringify({
    nombre: input.nombre ?? '',
    marca: input.marca ?? '',
    keyword_objetivo: input.keyword ?? '',
    contexto: input.crudo ?? '',
    specs: input.specs ?? {},
    titulos_a_evitar: input.evitarTitulos ?? [],
  })
  const mensajeUsuario = payload

  let mensajes: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: mensajeUsuario },
  ]

  for (let intento = 0; intento < 2; intento += 1) {
    const respuesta = await llamarDeepSeek(key, mensajes)
    if (!respuesta.success) return { success: false as const, error: respuesta.error }

    let parsed: unknown
    try {
      parsed = JSON.parse(respuesta.text)
    } catch {
      return { success: false as const, error: 'La IA no devolvio JSON valido.' }
    }

    const valid = seoContentSchema.safeParse(parsed)
    if (!valid.success) return { success: false as const, error: 'JSON IA no valido contra Zod.' }

    const calidad = validarCalidadSeo(valid.data, { tieneSpecs: tieneEspecificaciones(input.specs) })
    if (calidad.ok) return { success: true as const, data: valid.data }

    // Reintento único: se le explican los errores para que autocorrija.
    if (intento === 0) {
      mensajes = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: mensajeUsuario },
        {
          role: 'user',
          content:
            'Tu respuesta anterior fue rechazada por estas razones: ' +
            calidad.errores.join(' ') +
            '. Corrige y devuelve de nuevo SOLO el JSON con la forma exigida.',
        },
      ]
      continue
    }

    return { success: false as const, error: 'Contenido SEO de baja calidad: ' + calidad.errores.join(' ') }
  }

  return { success: false as const, error: 'No se pudo generar contenido SEO de calidad.' }
}
