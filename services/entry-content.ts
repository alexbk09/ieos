import { z } from 'zod'
import {
  ENTRY_BANNED_PHRASES,
  ENTRY_MAX_CRITERIA,
  ENTRY_MAX_FAQ,
  ENTRY_MAX_KEYWORDS,
  ENTRY_MAX_TOKENS,
  ENTRY_MIN_FAQ,
  ENTRY_MIN_KEYWORDS,
  ENTRY_MIN_PRODUCTS,
  ENTRY_MIN_WORDS,
  ENTRY_READING_WORDS_PER_MINUTE,
  ENTRY_REQUIRED_SECTIONS,
  ENTRY_RESUMEN_MAX_LENGTH,
  ENTRY_RESUMEN_MIN_LENGTH,
  ENTRY_TEMPERATURE,
  ENTRY_TITLE_MAX_LENGTH,
  ENTRY_TITLE_MIN_LENGTH,
  ENTRY_TYPES,
  DEFAULT_AUTHOR,
  SEO_TITLE_SIGNATURE_WORDS,
} from '@/lib/constants'
import {
  calcularMinutosLectura,
  construirComparativa,
  firmaTitulo,
  validarCalidadEntrada,
} from '@/lib/entry-rules'
import { slugify } from '@/lib/slug'
import { DEEPSEEK_BASE_URL, DEEPSEEK_CHAT_MODEL } from '@/services/ai-provider'
import { buildEntryBrief, type EntryBrief } from '@/services/entry-brief'
import { existeEntradaSimilar } from '@/services/entry-dedupe'

/**
 * Cerebro de contenido de las ENTRADAS SEO (DeepSeek).
 * ------------------------------------------------------------------
 * Convierte un brief de datos REALES en un artículo único: título con intención,
 * HTML semántico con la estructura obligatoria, FAQ (schema FAQPage), keywords
 * long-tail, ángulo editorial y los criterios de la tabla comparativa.
 *
 * POR QUÉ valida dos veces y con datos reales:
 *  - Zod garantiza la FORMA del JSON (tipos y longitudes).
 *  - `validarCalidadEntrada` garantiza el FONDO (estructura, longitud, sin
 *    clichés): es el gate que evita el "contenido basura a escala".
 *  - La TABLA COMPARATIVA no se toma del modelo: se construye con las
 *    especificaciones reales del catálogo (`construirComparativa`). El modelo
 *    solo elige QUÉ criterios importan; los valores siempre son verificables.
 */

/** Respuesta del modelo (contrato del LLM). */
export const entryContentSchema = z.object({
  tipo: z.string().optional(),
  titulo: z.string().min(ENTRY_TITLE_MIN_LENGTH).max(ENTRY_TITLE_MAX_LENGTH),
  slug: z.string().min(3).max(90),
  resumen: z.string().min(ENTRY_RESUMEN_MIN_LENGTH).max(ENTRY_RESUMEN_MAX_LENGTH),
  cuerpo_html: z.string().min(ENTRY_MIN_WORDS),
  faq: z
    .array(
      z.object({
        pregunta: z.string().min(5).max(200),
        respuesta: z.string().min(20).max(700),
      }),
    )
    .min(ENTRY_MIN_FAQ)
    .max(ENTRY_MAX_FAQ),
  keywords: z.array(z.string().min(2).max(60)).min(ENTRY_MIN_KEYWORDS).max(ENTRY_MAX_KEYWORDS),
  keyword_objetivo: z.string().min(2).max(80),
  angulo: z.string().min(5).max(120),
  /** Criterios de comparación elegidos (los valores salen del catálogo). */
  criterios_comparativa: z.array(z.string().min(2).max(40)).max(ENTRY_MAX_CRITERIA).optional(),
})

export type EntryContentFromModel = z.infer<typeof entryContentSchema>

/** Entrada lista para persistir (comparativa y métricas ya calculadas). */
export type GeneratedEntry = {
  tipo: string
  titulo: string
  slug: string
  resumen: string
  cuerpo_html: string
  faq: { pregunta: string; respuesta: string }[]
  keywords: string[]
  keyword_objetivo: string
  angulo: string
  /** Tabla comparativa construida con especificaciones REALES. */
  comparativa: { criterios: { criterio: string; valores: { slug: string; valor: string }[] }[] } | null
  lectura_minutos: number
  /** Relaciones derivadas del brief (productos y nichos reales). */
  productIds: string[]
  categoryIds: string[]
  /** Firma del título: la usa el anti-duplicado del panel. */
  firma: string
  /**
   * Firma editorial por defecto (variable NEXT_PUBLIC_DEFAULT_AUTHOR).
   * Editable después en el panel; nunca queda sin autoría visible.
   */
  autor: string
}

export type GenerateEntryInput = {
  tipo?: string
  categoryIds?: string[]
  productIds?: string[]
}

// ---------- Prompt (construido desde lib/constants.ts) ----------

const SECCIONES = ENTRY_REQUIRED_SECTIONS.join('</h2>, <h2>')
const FRASES_PROHIBIDAS = ENTRY_BANNED_PHRASES.slice(0, 6).join(', ')

/**
 * Construye el prompt del artículo a partir del brief real.
 * POR QUÉ se le pasan los datos del catálogo y la lista de títulos existentes:
 *  - Datos reales → cero invenciones (ni marcas, ni precios, ni specs).
 *  - Títulos/keywords ya publicados → cero clones (el modelo evita parafrasear).
 */
export function construirPromptEntrada(tipo: string, brief: EntryBrief): string {
  const nichos = brief.categorias.map((categoria) => categoria.nombre).join(', ') || 'sin nicho'
  const productos = brief.productos
    .map((p) => `${p.nombre} (slug: ${p.slug}, precio aprox. ${p.precioUsd} USD)`)
    .join(' | ')
  const especificaciones = brief.productos
    .map((p) => `${p.slug}: ${JSON.stringify(p.especificaciones)}`)
    .join(' | ')
  const pares = brief.pares.map((par) => `${par.a.nombre} vs ${par.b.nombre}`).join(' | ')
  const titulosExistentes = brief.evitar.titulos.slice(0, 25).join(' | ')
  const keywordsExistentes = brief.evitar.keywords.slice(0, 40).join(', ')

  return (
    'Eres redactor SEO senior especializado en contenido de compra para una tienda de afiliados. ' +
    'Escribe en espanol neutro una entrada de tipo "' + tipo + '" sobre los nichos: ' + nichos + '. ' +
    'REGLAS OBLIGATORIAS: ' +
    '1) "titulo" de ' + ENTRY_TITLE_MIN_LENGTH + '-' + ENTRY_TITLE_MAX_LENGTH + ' caracteres, con gancho y especifico (nada de titulos genericos ni de relleno). ' +
    '2) "slug" de 3-8 palabras en minusculas separadas por guiones, sin numeros ni palabras vacias. ' +
    '3) "resumen" de ' + ENTRY_RESUMEN_MIN_LENGTH + '-' + ENTRY_RESUMEN_MAX_LENGTH + ' caracteres para la meta description. ' +
    '4) "cuerpo_html" de AL MENOS ' + ENTRY_MIN_WORDS + ' palabras usando SOLO <h2>,<h3>,<p>,<ul>,<li>,<strong>,<table>,<thead>,<tbody>,<tr>,<th>,<td>. ' +
    'DEBE incluir, en este orden, las secciones <h2>' + SECCIONES + '</h2>. PROHIBIDO usar <h1>. ' +
    '5) "faq": entre ' + ENTRY_MIN_FAQ + ' y ' + ENTRY_MAX_FAQ + ' preguntas reales de comprador con su respuesta. ' +
    '6) "keywords": entre ' + ENTRY_MIN_KEYWORDS + ' y ' + ENTRY_MAX_KEYWORDS + ' terminos long-tail en minusculas. ' +
    '7) "keyword_objetivo": la busqueda principal que debe captar la entrada. ' +
    '8) "angulo": el gancho editorial en una frase (ej: "para pisos pequenos", "regalo original"). ' +
    '9) "criterios_comparativa": hasta ' + ENTRY_MAX_CRITERIA + ' nombres de criterio a comparar (ej: "Potencia", "Conectividad"). Solo NOMBRES: los valores de la tabla los pone el sistema con datos reales. ' +
    'DATOS REALES (usa SOLO estos productos, nunca inventes otros): ' + productos + '. ' +
    'ESPECIFICACIONES REALES disponibles por producto: ' + especificaciones + '. ' +
    (pares ? 'PARES COMPARABLES sugeridos: ' + pares + '. ' : '') +
    'PROHIBIDO: usar frases genericas (' + FRASES_PROHIBIDAS + '), inventar marcas, precios, medidas o tecnologias, y afirmar certificaciones. ' +
    (titulosExistentes ? 'NO repitas ni parafrasees estos titulos ya publicados: ' + titulosExistentes + '. ' : '') +
    (keywordsExistentes ? 'NO repitas estas keywords ya usadas: ' + keywordsExistentes + '. ' : '') +
    'Responde EXCLUSIVAMENTE con JSON valido con la forma ' +
    '{"titulo":"","slug":"","resumen":"","cuerpo_html":"","faq":[{"pregunta":"","respuesta":""}],"keywords":[],"keyword_objetivo":"","angulo":"","criterios_comparativa":[]}'
  )
}

/** Ejecuta la llamada a DeepSeek y devuelve el texto crudo de la respuesta. */
async function llamarDeepSeek(
  apiKey: string,
  messages: { role: 'system' | 'user'; content: string }[],
): Promise<{ success: true; text: string } | { success: false; error: string }> {
  try {
    const res = await fetch(DEEPSEEK_BASE_URL.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: DEEPSEEK_CHAT_MODEL,
        messages,
        temperature: ENTRY_TEMPERATURE,
        max_tokens: ENTRY_MAX_TOKENS,
      }),
    })
    if (!res.ok) return { success: false, error: 'DeepSeek HTTP ' + res.status }
    const body = await res.json()
    const text = String(body?.choices?.[0]?.message?.content ?? '')
      .replace(/```json|```/g, '')
      .trim()
    if (!text) return { success: false, error: 'DeepSeek devolvio una respuesta vacia.' }
    return { success: true, text }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Error llamando a DeepSeek.' }
  }
}

// ---------- API pública ----------

/** Umbrales del gate en un solo objeto: se reutilizan en el reintento. */
const OPCIONES_GATE = {
  bannedPhrases: [...ENTRY_BANNED_PHRASES],
  requiredSections: [...ENTRY_REQUIRED_SECTIONS],
  minTitleLength: ENTRY_TITLE_MIN_LENGTH,
  maxTitleLength: ENTRY_TITLE_MAX_LENGTH,
  minResumenLength: ENTRY_RESUMEN_MIN_LENGTH,
  maxResumenLength: ENTRY_RESUMEN_MAX_LENGTH,
  minWords: ENTRY_MIN_WORDS,
  minFaq: ENTRY_MIN_FAQ,
  maxFaq: ENTRY_MAX_FAQ,
  minKeywords: ENTRY_MIN_KEYWORDS,
  maxKeywords: ENTRY_MAX_KEYWORDS,
  minProductos: ENTRY_MIN_PRODUCTS,
  allowedTipos: [...ENTRY_TYPES] as string[],
}

/**
 * Genera el contenido completo de una entrada a partir del brief REAL.
 * Hace hasta 2 intentos: si el primero no pasa el gate de calidad o propone un
 * título/slug duplicado, reintenta UNA vez explicándole los errores para que se
 * autocorrija (coste acotado y mayor tasa de éxito).
 */
export async function generateEntryContent(input: GenerateEntryInput) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return { success: false as const, error: 'Falta DEEPSEEK_API_KEY.' }

  const tipo = ENTRY_TYPES.includes(input?.tipo as any) ? String(input?.tipo) : ENTRY_TYPES[0]
  const briefResult = await buildEntryBrief({
    tipo,
    categoryIds: input?.categoryIds,
    productIds: input?.productIds,
  })
  if (!briefResult.success) return { success: false as const, error: briefResult.error }
  const brief = briefResult.data

  const systemPrompt = construirPromptEntrada(tipo, brief)
  const mensajeInicial = 'Genera la entrada ahora.'
  let messages: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: mensajeInicial },
  ]

  for (let intento = 0; intento < 2; intento += 1) {
    const respuesta = await llamarDeepSeek(apiKey, messages)
    if (!respuesta.success) return { success: false as const, error: respuesta.error }

    let parsed: unknown
    try {
      parsed = JSON.parse(respuesta.text)
    } catch {
      return { success: false as const, error: 'La IA no devolvio JSON valido.' }
    }

    const valid = entryContentSchema.safeParse(parsed)
    if (!valid.success) {
      return { success: false as const, error: 'JSON de la IA no valido contra Zod.' }
    }

    // El slug se re-genera en local: la URL nunca debe traer acentos ni signos.
    const slug = slugify(valid.data.slug || valid.data.titulo)
    // La tabla comparativa NO viene del modelo: se arma con specs REALES. El
    // modelo solo aporta los NOMBRES de los criterios que importan.
    const comparativa = construirComparativa(
      brief.productos.map((producto) => ({
        slug: producto.slug,
        specifications: producto.especificaciones,
      })),
      valid.data.criterios_comparativa ?? [],
      { maxCriterios: ENTRY_MAX_CRITERIA },
    )

    const candidata = {
      tipo,
      titulo: valid.data.titulo.trim(),
      slug,
      resumen: valid.data.resumen.trim(),
      cuerpo_html: valid.data.cuerpo_html,
      faq: valid.data.faq,
      keywords: valid.data.keywords,
      productos: brief.productos,
    }

    const gate = validarCalidadEntrada(candidata, OPCIONES_GATE)
    const duplicado = await existeEntradaSimilar(candidata.titulo, { slug })

    const errores = [...gate.errores]
    if (duplicado.success && duplicado.slugDuplicado) {
      errores.push('El slug "' + slug + '" ya esta en uso.')
    }
    if (duplicado.success && duplicado.tituloSimilar) {
      errores.push(
        'El titulo es casi identico a uno ya publicado ("' +
          duplicado.tituloSimilar +
          '"): elige otro angulo.',
      )
    }

    if (errores.length === 0) {
      const data: GeneratedEntry = {
        tipo,
        titulo: candidata.titulo,
        slug,
        resumen: candidata.resumen,
        cuerpo_html: candidata.cuerpo_html,
        faq: candidata.faq,
        keywords: candidata.keywords,
        keyword_objetivo: valid.data.keyword_objetivo.trim(),
        angulo: valid.data.angulo.trim(),
        comparativa: comparativa.criterios.length > 0 ? comparativa : null,
        lectura_minutos: calcularMinutosLectura(
          candidata.cuerpo_html,
          ENTRY_READING_WORDS_PER_MINUTE,
        ),
        productIds: brief.productos.map((producto) => producto.id),
        categoryIds: brief.categorias.map((categoria) => categoria.id),
        firma: firmaTitulo(candidata.titulo, SEO_TITLE_SIGNATURE_WORDS),
        // Firma editorial por defecto (configurable por entorno, editable luego
        // en el panel): la autoría visible es una señal E-E-A-T para Google.
        autor: DEFAULT_AUTHOR,
      }
      return { success: true as const, data }
    }

    // Reintento único y autocorrectivo: se le explican los errores al modelo.
    if (intento === 0) {
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: mensajeInicial },
        {
          role: 'user',
          content:
            'Tu respuesta anterior fue rechazada por estas razones: ' +
            errores.join(' ') +
            ' Corrige y devuelve de nuevo SOLO el JSON con la forma exigida.',
        },
      ]
      continue
    }

    return { success: false as const, error: 'Contenido de baja calidad: ' + errores.join(' ') }
  }

  return { success: false as const, error: 'No se pudo generar una entrada de calidad.' }
}
