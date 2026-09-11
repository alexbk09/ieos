import { z } from 'zod'
import { normalizarTitulo } from '@/lib/seo-rules'
import {
  META_MAX_SPECS,
  META_MAX_MARCA_LENGTH,
  META_EXTRACTION_TEMPERATURE,
  META_EXTRACTION_MAX_TOKENS,
  META_EXTRACTION_MODEL,
} from '@/lib/constants'

/**
 * Servicio de extracción de MARCAS y ESPECIFICACIONES desde el título (Fase 2.7).
 * ------------------------------------------------------------------
 * POR QUÉ existe (hallazgo del diagnóstico):
 *   La API de afiliados de AliExpress NO expone marca (`brand` = 0/20) ni
 *   especificaciones (`product_props` ausente), y el HTML público ya no las
 *   sirve (`window.runParams = {}`, sin `specification--name`). La ÚNICA fuente
 *   fiable que queda es el TÍTULO del producto, que sí trae datos reales
 *   (ej: "100W Electric Lunch Box 1.8L 304 Stainless Steel").
 *
 * Regla anti-invención (crítica):
 *   Todo valor devuelto por la IA debe aparecer LITERALMENTE en el título; si no,
 *   se descarta. Así nunca se publican marcas o specs falsos.
 *
 * Contrato: { success: true, data } | { success: false, error }. Nunca lanza.
 */

/** Forma del JSON que debe devolver el modelo. */
const extraccionSchema = z.object({
  marca: z.string().max(META_MAX_MARCA_LENGTH).nullable().optional(),
  specs: z
    .array(z.object({ clave: z.string().min(2).max(40), valor: z.string().min(1).max(80) }))
    .max(META_MAX_SPECS)
    .default([]),
})

/** Resultado normalizado: marca (o null) y specs clave→valor. */
export type ExtraccionMeta = {
  marca: string | null
  specs: Record<string, string>
}

const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const DEEPSEEK_API_URL = `${DEEPSEEK_BASE_URL}/chat/completions`

const SYSTEM_PROMPT =
  'Eres un analista de datos de catalogo. Recibes el TITULO de un producto de AliExpress y debes devolver SOLO lo que aparece LITERALMENTE en ese titulo. ' +
  'REGLAS ESTRICTAS: ' +
  '1) "marca": el nombre de la marca del fabricante SOLO si aparece explicitamente en el titulo (suele ser una palabra capitalizada o un nombre comercial). Si no aparece, devuelve null. NUNCA use palabras genericas (Electric, Wireless, Portable, Pro, Mini, 100W...). ' +
  '2) "specs": lista de especificaciones tecnicas que aparezcan LITERALMENTE en el titulo, con etiqueta corta en espanol y el valor EXACTO tal como aparece. Ejemplos de etiquetas: Potencia, Capacidad, Voltaje, Material, Tamano, Cantidad, Color, Modelo, Conectividad. ' +
  '3) PROHIBIDO inventar, deducir, redondear o traducir valores: el valor debe ser copia literal del titulo (ej: "100W", "1.8L", "304", "Type-C"). ' +
  'Responde EXCLUSIVAMENTE con JSON valido: {"marca":"...|null","specs":[{"clave":"","valor":""}]}'

/** TRUE si el valor aparece de forma literal normalizada dentro del título. */
function apareceEnTitulo(valor: string, tituloNormalizado: string): boolean {
  const normalizado = normalizarTitulo(valor)
  return normalizado.length >= 2 && tituloNormalizado.includes(normalizado)
}

/**
 * Extrae marca y especificaciones reales a partir del título del producto.
 * @param titulo Título de fábrica del producto.
 * @returns Marca (o null) y specs verificados literalmente contra el título.
 */
export async function extraerMarcaYSpecs(
  titulo: string,
): Promise<{ success: true; data: ExtraccionMeta } | { success: false; error: string }> {
  const limpio = String(titulo ?? '').replace(/\s+/g, ' ').trim()
  if (limpio.length < 8) return { success: true, data: { marca: null, specs: {} } }

  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return { success: false, error: 'Falta DEEPSEEK_API_KEY.' }

  try {
    const respuesta = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: META_EXTRACTION_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ titulo: limpio }) },
        ],
        temperature: META_EXTRACTION_TEMPERATURE,
        max_tokens: META_EXTRACTION_MAX_TOKENS,
      }),
    })
    if (!respuesta.ok) return { success: false, error: `Extracción HTTP ${respuesta.status}.` }

    const cuerpo = await respuesta.json()
    const crudo = String(cuerpo?.choices?.[0]?.message?.content ?? '')
      .replace(/```json|```/g, '')
      .trim()
    const parsed = extraccionSchema.safeParse(safeJsonParse(crudo))
    if (!parsed.success) return { success: false, error: 'La IA no devolvió el JSON esperado.' }

    // Guard anti-invención: todo debe existir literalmente en el título.
    const tituloNormalizado = normalizarTitulo(limpio)

    const marcaCruda = parsed.data.marca?.trim() || ''
    const marca =
      marcaCruda && marcaCruda.length <= META_MAX_MARCA_LENGTH && apareceEnTitulo(marcaCruda, tituloNormalizado)
        ? marcaCruda
        : null

    const specs: Record<string, string> = {}
    for (const item of parsed.data.specs) {
      const clave = item.clave.trim()
      const valor = item.valor.trim()
      if (!clave || !valor) continue
      if (clave in specs) continue
      // El VALOR debe existir literalmente en el título (evita alucinaciones).
      if (!apareceEnTitulo(valor, tituloNormalizado)) continue
      specs[clave] = valor
      if (Object.keys(specs).length >= META_MAX_SPECS) break
    }

    return { success: true, data: { marca, specs } }
  } catch (err: any) {
    console.error('[aliMeta] extraerMarcaYSpecs:', err?.message)
    return { success: false, error: err?.message ?? 'Error extrayendo metadatos.' }
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
