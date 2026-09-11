import { z } from 'zod'
import { normalizarResenas } from '@/lib/reviews'
import type { ProductReview } from '@/services/catalog'
import {
  REVIEWS_MAX_STORED,
  REVIEWS_MIN_TEXT_LENGTH,
  REVIEWS_MAX_TEXT_LENGTH,
  REVIEWS_TARGET_LANGUAGE,
  REVIEWS_TRANSLATION_MODEL,
  REVIEWS_TRANSLATION_TEMPERATURE,
  REVIEWS_TRANSLATION_MAX_TOKENS,
} from '@/lib/constants'

/**
 * Servicio de opiniones y valoraciones de producto (Fase 2.3).
 * ------------------------------------------------------------------
 * Responsabilidad exclusiva: convertir las reseñas CRUDAS extraídas del
 * marketplace en reseñas limpias y traducidas listas para `products.reviews`.
 *
 * Reglas de oro respetadas:
 *  - Capa de abstracción pura: NO toca Supabase ni React.
 *  - Contrato estable { success, data } | { success, error }.
 *  - Degradación elegante: si falta la clave de IA o el modelo falla, se
 *    devuelven las reseñas ORIGINALES (sin traducir) en vez de abortar el
 *    pipeline: el peso SEO de tener opiniones reales no se pierde.
 *  - Nunca inventa reseñas: solo traduce/limpia lo que ya existe.
 */

/** Reseña cruda tal como la devuelve el scraper/API. */
export type ResenaCruda = {
  autor?: string | null
  valoracion?: unknown
  texto?: unknown
  fecha?: string | null
}

/** Forma del JSON que debe devolver el modelo traductor. */
const respuestaTraduccionSchema = z.object({
  textos: z.array(z.string().min(1)),
})

// Endpoint y credencial del motor de traducción (solo servidor).
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const DEEPSEEK_API_URL = `${DEEPSEEK_BASE_URL}/chat/completions`

/** Instrucción del sistema para traducir reseñas sin alterar su sentido. */
const SYSTEM_PROMPT =
  'Eres traductor profesional de resenas de compradores para una tienda online. ' +
  'Traduce al idioma con codigo "' + REVIEWS_TARGET_LANGUAGE + '" cada texto del array "textos". ' +
  'REGLAS: 1) Devuelve EXACTAMENTE el mismo numero de elementos y en el mismo orden. ' +
  '2) No resumas, no amplies, no corrijas la opinion del comprador: traduce literalmente. ' +
  '3) No anadas opiniones nuevas ni inventes datos. ' +
  'Responde EXCLUSIVAMENTE con JSON valido con la forma: {"textos":["", ""]}'

/**
 * Traduce y normaliza una lista de reseñas crudas.
 * @param resenas Reseñas tal como llegan del scraper/API.
 * @returns Reseñas limpias (traducidas si es posible) listas para persistir.
 */
export async function traducirResenas(
  resenas: ResenaCruda[],
): Promise<{ success: true; data: ProductReview[] } | { success: false; error: string }> {
  try {
    // 1) Saneamiento determinista ANTES de gastar tokens de IA.
    const normalizadas = normalizarResenas(resenas, {
      maxStored: REVIEWS_MAX_STORED,
      minTextLength: REVIEWS_MIN_TEXT_LENGTH,
      maxTextLength: REVIEWS_MAX_TEXT_LENGTH,
    })
    if (normalizadas.length === 0) return { success: true, data: [] }

    // 2) Sin clave de IA se conserva el texto original (degradación elegante).
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
    if (!apiKey) return { success: true, data: normalizadas }

    // 3) Traducción en UNA sola llamada (coste acotado).
    const textos = normalizadas.map((r) => r.texto)
    const respuesta = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: REVIEWS_TRANSLATION_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ textos }) },
        ],
        temperature: REVIEWS_TRANSLATION_TEMPERATURE,
        max_tokens: REVIEWS_TRANSLATION_MAX_TOKENS,
      }),
    })
    if (!respuesta.ok) {
      console.error('[aliReviews] Traducción HTTP', respuesta.status)
      return { success: true, data: normalizadas }
    }

    const cuerpo = await respuesta.json()
    const crudo = String(cuerpo?.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim()
    const parsed = respuestaTraduccionSchema.safeParse(safeJsonParse(crudo))
    // Si la forma no es válida, se conservan los textos originales.
    if (!parsed.success) return { success: true, data: normalizadas }

    // 4) Se fusiona la traducción por índice (mismo orden garantizado).
    const traducidas = normalizadas.map((resena, i) => ({
      ...resena,
      texto: parsed.data.textos[i]?.trim() || resena.texto,
    }))
    return { success: true, data: traducidas }
  } catch (err: any) {
    console.error('[aliReviews] traducirResenas:', err?.message)
    return { success: false, error: err?.message ?? 'Error traduciendo opiniones.' }
  }
}

/** Parsea JSON tolerante (devuelve null si el texto no es JSON válido). */
function safeJsonParse(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}
