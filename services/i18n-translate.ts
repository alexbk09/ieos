import { createClient as createServerClient } from '@/lib/supabase/server'
import { revalidarSitemap } from '@/lib/sitemap-revalidate'
// Núcleo puro de traducción (mismo prompt que el backfill; cero duplicación).
import {
  TARGET_LOCALES,
  buildCategoryMessages,
  buildEntryMessages,
  buildProductMessages,
  buildSourceLocaleNameMessages,
  chunkLocales,
  isSourceLocaleNamePending,
  mergeCategoryTranslations,
  mergeEntryTranslations,
  mergeProductTranslations,
  mergeSourceLocaleName,
  missingEntryLocales,
  parseSourceLocaleName,
  parseTranslationResponse,
  requestTranslation,
} from '@/lib/i18n-translate'
import {
  SOURCE_LOCALE,
  TRANSLATION_API_URL,
  TRANSLATION_LOCALE_BATCH_SIZE,
  TRANSLATION_MAX_TOKENS,
  TRANSLATION_MODEL,
  TRANSLATION_NAME_MAX_TOKENS,
  TRANSLATION_TEMPERATURE,
} from '@/lib/constants'

/**
 * Servicio de traducción de contenido (categorías y productos).
 * ------------------------------------------------------------------
 * Capa ÚNICA de escritura de los campos *_i18n (regla de oro: los componentes
 * nunca tocan Supabase). Reutiliza el núcleo puro `lib/i18n-translate.mjs`, que
 * es el MISMO que usa el backfill: un solo prompt en todo el sistema.
 *
 * Estrategia de coste: SOLO traduce los idiomas que faltan, en UNA llamada por
 * entidad. Si ya está todo traducido, no llama al modelo (coste cero).
 */

/** Lee la API key del motor de traducción. Solo servidor: nunca se expone. */
function getTranslationApiKey(): string {
  return (process.env.DEEPSEEK_API_KEY ?? '').trim()
}

/** Normaliza un campo JSONB a objeto plano. */
function asMap(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

/** Resultado de una traducción de categoría. */
export type TraduccionCategoriaResult =
  | {
      success: true
      data: {
        name_i18n: Record<string, string>
        slug_i18n: Record<string, string>
        description_i18n: Record<string, string>
        seo_title_i18n: Record<string, string>
        seo_intro_i18n: Record<string, string>
        seo_faq_i18n: Record<string, { pregunta: string; respuesta: string }[]>
        /** Idiomas que se acaban de traducir ([] si ya estaba completo). */
        traducidos: string[]
      }
    }
  | { success: false; error: string }

/**
 * Traduce y persiste los idiomas que falten de una categoría.
 * Cubre el contenido básico (nombre, slug, descripción) y el editorial del hub
 * (título H1, guía de compra y FAQ). El idioma raíz (español) nunca se traduce:
 * se hereda de `name`/`slug`, por lo que su URL ya indexada permanece intacta.
 * @param categoriaId UUID de la categoría.
 * @param options.locales Locales concretos a traducir (por defecto, todos los destino).
 */
export async function traducirCategoria(
  categoriaId: string,
  options: { locales?: string[] } = {},
): Promise<TraduccionCategoriaResult> {
  try {
    const apiKey = getTranslationApiKey()
    if (!apiKey) return { success: false, error: 'Falta la clave del motor de traducción.' }

    const supabase = await createServerClient()
    const { data: row, error: readError } = await supabase
      .from('categories')
      // Select en UNA sola cadena: concatenar rompería la inferencia de tipos de
      // PostgREST y degradaría `row` a GenericStringError.
      .select(
        'id,name,slug,description,seo_title,seo_intro,seo_faq,name_i18n,slug_i18n,description_i18n,seo_title_i18n,seo_intro_i18n,seo_faq_i18n',
      )
      .eq('id', categoriaId)
      .maybeSingle()
    if (readError) return { success: false, error: readError.message }
    if (!row) return { success: false, error: 'La categoría no existe.' }

    const names = asMap(row.name_i18n)
    const slugs = asMap(row.slug_i18n)
    const descriptions = asMap(row.description_i18n)
    const seoTitles = asMap(row.seo_title_i18n)
    const seoIntros = asMap(row.seo_intro_i18n)
    const seoFaqs = asMap(row.seo_faq_i18n)
    const pendientes = (options.locales ?? TARGET_LOCALES).filter((locale) => {
      // El contenido básico es obligatorio para publicar el idioma.
      if (!names[locale] || !slugs[locale]) return true
      // El contenido editorial solo se exige si existe en el idioma raíz.
      const faltaSeoTitle = Boolean(row.seo_title) && !seoTitles[locale]
      const faltaSeoIntro = Boolean(row.seo_intro) && !seoIntros[locale]
      const faltaSeoFaq = Array.isArray(row.seo_faq) && row.seo_faq.length > 0 && !seoFaqs[locale]
      return faltaSeoTitle || faltaSeoIntro || faltaSeoFaq
    })

    // Nada que traducir: evitar una llamada al modelo (coste cero).
    if (pendientes.length === 0) {
      return {
        success: true,
        data: {
          name_i18n: names,
          slug_i18n: slugs,
          description_i18n: descriptions,
          seo_title_i18n: seoTitles,
          seo_intro_i18n: seoIntros,
          seo_faq_i18n: seoFaqs,
          traducidos: [],
        },
      }
    }

    const respuesta = await requestTranslation({
      apiKey,
      apiUrl: TRANSLATION_API_URL,
      model: TRANSLATION_MODEL,
      temperature: TRANSLATION_TEMPERATURE,
      maxTokens: TRANSLATION_MAX_TOKENS,
      messages: buildCategoryMessages({
        nombre: row.name,
        descripcion: row.description ?? '',
        seoTitle: row.seo_title ?? null,
        seoIntro: row.seo_intro ?? null,
        seoFaq: row.seo_faq ?? null,
        locales: pendientes,
      }),
    })
    if (!respuesta.success) return { success: false, error: respuesta.error }

    const parsed = parseTranslationResponse(respuesta.text)
    if (!parsed.success) return { success: false, error: parsed.error }

    const mapas = mergeCategoryTranslations(row, parsed.data)
    const { error: updateError } = await supabase.from('categories').update(mapas).eq('id', categoriaId)
    if (updateError) return { success: false, error: updateError.message }

    // La landing del hub cambió de idioma: se revalida su página y el sitemap.
    revalidarSitemap({ categoriaSlug: row.slug })

    return { success: true, data: { ...mapas, traducidos: pendientes } }
  } catch (err: any) {
    console.error('[i18n-translate] traducirCategoria:', err?.message)
    return { success: false, error: err?.message ?? 'Error traduciendo la categoría.' }
  }
}

/** Resultado de redactar el nombre base de una categoría en el idioma raíz. */
export type TraduccionNombreRaizResult =
  | {
      success: true
      data: {
        /** TRUE = el dato base se reescribió en el idioma raíz. */
        actualizado: boolean
        /** Nombre resultante (el nuevo si hubo cambio). */
        nombre: string
        /** Nombre base anterior (para el log/UI). */
        anterior: string
      }
    }
  | { success: false; error: string }

/**
 * Redacta en el IDIOMA RAÍZ el nombre de una categoría cuyo dato base quedó
 * guardado en otro idioma (inglés) por el pipeline antiguo.
 * ------------------------------------------------------------------
 * POR QUÉ hace falta: `name_i18n[SOURCE_LOCALE]` se hereda del dato base, así que
 * un `name` en inglés se servía como "español" en el filtro del catálogo, la
 * portada y los hubs. Corregir el dato base arregla todos esos sitios a la vez.
 *
 * Garantías:
 *  - NO toca `slug`/`slug_i18n`: la URL ya indexada nunca cambia.
 *  - NO toca los idiomas ya traducidos (solo reescribe el idioma raíz).
 *  - Coste cero cuando el nombre ya está redactado en el idioma raíz (no se
 *    llama al modelo) ni cuando el modelo devuelve el mismo texto (no se escribe).
 *
 * @param categoriaId UUID de la categoría.
 * @param options.forzar TRUE = redacta aunque el detector lo considere al día.
 */
export async function traducirNombreCategoriaAlIdiomaRaiz(
  categoriaId: string,
  options: { forzar?: boolean } = {},
): Promise<TraduccionNombreRaizResult> {
  try {
    const apiKey = getTranslationApiKey()
    if (!apiKey) return { success: false, error: 'Falta la clave del motor de traducción.' }

    const supabase = await createServerClient()
    const { data, error: readError } = await supabase
      .from('categories')
      .select('id,name,slug,name_i18n')
      .eq('id', categoriaId)
      .maybeSingle()
    if (readError) return { success: false, error: readError.message }
    if (!data) return { success: false, error: 'La categoría no existe.' }

    // Cast explícito: la proyección parcial degrada la inferencia de PostgREST.
    const row = data as { id: string; name: string; slug: string; name_i18n: Record<string, string> | null }
    const anterior = row.name

    // Dato ya redactado en el idioma raíz: no se gasta una llamada al modelo.
    if (!options.forzar && !isSourceLocaleNamePending(row)) {
      return { success: true, data: { actualizado: false, nombre: anterior, anterior } }
    }

    const respuesta = await requestTranslation({
      apiKey,
      apiUrl: TRANSLATION_API_URL,
      model: TRANSLATION_MODEL,
      temperature: TRANSLATION_TEMPERATURE,
      maxTokens: TRANSLATION_NAME_MAX_TOKENS,
      messages: buildSourceLocaleNameMessages({ nombre: anterior }),
    })
    if (!respuesta.success) return { success: false, error: respuesta.error }

    const parsed = parseSourceLocaleName(respuesta.text)
    if (!parsed.success) return { success: false, error: parsed.error }

    const cambios = mergeSourceLocaleName(row, parsed.name)
    if (!cambios) return { success: false, error: 'El motor devolvió un nombre vacío.' }

    // Mismo texto (ej: un nombre idéntico en ambos idiomas): nada que escribir.
    if (cambios.name === anterior) {
      return { success: true, data: { actualizado: false, nombre: anterior, anterior } }
    }

    const { error: updateError } = await supabase
      .from('categories')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', categoriaId)
    if (updateError) return { success: false, error: updateError.message }

    // El nombre visible del filtro/hub cambió: se revalida landing y sitemap.
    revalidarSitemap({ categoriaSlug: row.slug })

    return { success: true, data: { actualizado: true, nombre: cambios.name, anterior } }
  } catch (err: any) {
    console.error('[i18n-translate] traducirNombreCategoriaAlIdiomaRaiz:', err?.message)
    return { success: false, error: err?.message ?? 'Error redactando el nombre en el idioma raíz.' }
  }
}

/** Resultado de una traducción de producto. */
export type TraduccionProductoResult =
  | {
      success: true
      data: {
        translations: Record<string, any>
        traducidos: string[]
        /** Idiomas que aún quedan por traducir (el cliente repite tandas). */
        pendientes: number
      }
    }
  | { success: false; error: string }

/**
 * Traduce y persiste los idiomas que falten del contenido de un producto:
 * nombre, título SEO, cuerpo de la ficha (descripción HTML) y FAQ estructurada.
 * Se guarda en `products.translations` (JSONB): no se duplican filas, así stock,
 * precios y enlaces internos siguen intactos.
 * @param productoId UUID del producto.
 * @param options.locales Locales concretos a traducir (por defecto, todos los destino).
 */
export async function traducirProducto(
  productoId: string,
  options: { locales?: string[] } = {},
): Promise<TraduccionProductoResult> {
  try {
    const apiKey = getTranslationApiKey()
    if (!apiKey) return { success: false, error: 'Falta la clave del motor de traducción.' }

    const supabase = await createServerClient()
    const { data: row, error: readError } = await supabase
      .from('products')
      .select('id,name,titulo_seo,description,seo_faq,translations')
      .eq('id', productoId)
      .maybeSingle()
    if (readError) return { success: false, error: readError.message }
    if (!row) return { success: false, error: 'El producto no existe.' }

    const translations = asMap(row.translations)
    const pendientes = (options.locales ?? TARGET_LOCALES).filter((locale) => {
      const entry = asMap(translations[locale])
      // El nombre es obligatorio; la descripción solo si existe en el idioma raíz.
      if (!entry.name) return true
      return Boolean(row.description) && !entry.description
    })

    if (pendientes.length === 0) {
      return { success: true, data: { translations, traducidos: [], pendientes: 0 } }
    }

    // Traducción POR LOTES (misma razón que en las entradas): la descripción
    // HTML de una ficha puede desbordar el límite de tokens si se piden varios
    // idiomas de una vez, y la respuesta llegaría cortada (JSON incompleto).
    let nuevas = mergeProductTranslations(translations, {})
    const traducidos: string[] = []

    for (const lote of chunkLocales(pendientes, TRANSLATION_LOCALE_BATCH_SIZE)) {
      const respuesta = await requestTranslation({
        apiKey,
        apiUrl: TRANSLATION_API_URL,
        model: TRANSLATION_MODEL,
        temperature: TRANSLATION_TEMPERATURE,
        maxTokens: TRANSLATION_MAX_TOKENS,
        messages: buildProductMessages({
          nombre: row.name,
          tituloSeo: row.titulo_seo,
          descripcion: row.description ?? null,
          seoFaq: row.seo_faq ?? null,
          locales: lote,
        }),
      })
      if (!respuesta.success) return { success: false, error: respuesta.error }

      if (respuesta.finishReason === 'length') {
        return {
          success: false,
          error: 'La traducción se cortó por límite de tokens en el lote [' + lote.join(', ') + '].',
        }
      }

      const parsed = parseTranslationResponse(respuesta.text)
      if (!parsed.success) {
        return { success: false, error: parsed.error + ' Lote: [' + lote.join(', ') + '].' }
      }

      nuevas = mergeProductTranslations(nuevas, parsed.data)
      traducidos.push(...lote)
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({ translations: nuevas })
      .eq('id', productoId)
    if (updateError) return { success: false, error: updateError.message }

    return { success: true, data: { translations: nuevas, traducidos, pendientes: pendientes.length - traducidos.length } }
  } catch (err: any) {
    console.error('[i18n-translate] traducirProducto:', err?.message)
    return { success: false, error: err?.message ?? 'Error traduciendo el producto.' }
  }
}

/** Reexporta el idioma raíz para consumidores que lo necesiten. */
export { SOURCE_LOCALE }

/** Resultado de una traducción de entrada SEO. */
export type TraduccionEntradaResult =
  | {
      success: true
      data: {
        traducidos: string[]
        /** Idiomas que aún quedan por traducir (el cliente repite tandas). */
        pendientes: number
      }
    }
  | { success: false; error: string }

/**
 * Traduce y persiste los idiomas que falten de una ENTRADA SEO.
 * Cubre título, resumen (meta description), cuerpo del artículo y FAQ.
 * El idioma raíz nunca se traduce (se hereda del dato base) y el slug localizado
 * se genera en local: la URL ya indexada permanece intacta al añadir idiomas.
 * @param entradaId UUID de la entrada.
 * @param options.locales Locales concretos a traducir (por defecto, todos los destino).
 */
export async function traducirEntrada(
  entradaId: string,
  options: { locales?: string[] } = {},
): Promise<TraduccionEntradaResult> {
  try {
    const apiKey = getTranslationApiKey()
    if (!apiKey) return { success: false, error: 'Falta la clave del motor de traducción.' }

    const supabase = await createServerClient()
    const { data: row, error: readError } = await supabase
      .from('seo_entries')
      .select(
        'id,titulo,slug,resumen,cuerpo_html,faq,titulo_i18n,slug_i18n,resumen_i18n,cuerpo_html_i18n,faq_i18n',
      )
      .eq('id', entradaId)
      .maybeSingle()
    if (readError) return { success: false, error: readError.message }
    if (!row) return { success: false, error: 'La entrada no existe.' }

    const permitidos = options.locales ?? TARGET_LOCALES
    // Solo se traduce lo que FALTA: si ya está todo, coste cero (ni una llamada).
    const pendientes = missingEntryLocales(row).filter((locale) => permitidos.includes(locale))
    if (pendientes.length === 0) return { success: true, data: { traducidos: [], pendientes: 0 } }

    // Traducción POR LOTES: un artículo completo NO cabe en una sola respuesta
    // para 5 idiomas (el modelo la cortaba por límite de tokens y el JSON
    // llegaba incompleto). Los mapas se acumulan lote a lote y se guardan una
    // sola vez al final (una única escritura en la base).
    let mapas = mergeEntryTranslations(row, {})
    const traducidos: string[] = []

    for (const lote of chunkLocales(pendientes, TRANSLATION_LOCALE_BATCH_SIZE)) {
      const respuesta = await requestTranslation({
        apiKey,
        apiUrl: TRANSLATION_API_URL,
        model: TRANSLATION_MODEL,
        temperature: TRANSLATION_TEMPERATURE,
        maxTokens: TRANSLATION_MAX_TOKENS,
        messages: buildEntryMessages({
          titulo: row.titulo,
          resumen: row.resumen ?? '',
          cuerpoHtml: row.cuerpo_html ?? '',
          faq: row.faq ?? null,
          locales: lote,
        }),
      })
      if (!respuesta.success) return { success: false, error: respuesta.error }

      // Corte por límite de tokens: mensaje CLARO (antes decía "JSON no válido",
      // que despistaba). El lote queda identificado para poder reintentarlo.
      if (respuesta.finishReason === 'length') {
        return {
          success: false,
          error:
            'La traducción se cortó por límite de tokens en el lote [' +
            lote.join(', ') +
            ']. Vuelve a intentarlo: los idiomas ya traducidos se conservan.',
        }
      }

      const parsed = parseTranslationResponse(respuesta.text)
      if (!parsed.success) {
        return {
          success: false,
          error: parsed.error + ' Lote: [' + lote.join(', ') + '].',
        }
      }

      mapas = mergeEntryTranslations({ ...row, ...mapas }, parsed.data)
      traducidos.push(...lote)
    }

    const { error: updateError } = await supabase
      .from('seo_entries')
      .update(mapas)
      .eq('id', entradaId)
    if (updateError) return { success: false, error: updateError.message }

    // Cambió el idioma de la entrada: se revalida su página y el sitemap.
    revalidarSitemap({ entradaSlug: row.slug })

    // `pendientes` permite al cliente repetir tandas hasta terminar sin que una
    // sola petición se acerque al límite de tiempo de la plataforma.
    return { success: true, data: { traducidos, pendientes: pendientes.length - traducidos.length } }
  } catch (err: any) {
    console.error('[i18n-translate] traducirEntrada:', err?.message)
    return { success: false, error: err?.message ?? 'Error traduciendo la entrada.' }
  }
}
