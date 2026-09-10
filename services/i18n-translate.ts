import { createClient as createServerClient } from '@/lib/supabase/server'
import { revalidarSitemap } from '@/lib/sitemap-revalidate'
// Núcleo puro de traducción (mismo prompt que el backfill; cero duplicación).
import {
  TARGET_LOCALES,
  buildCategoryMessages,
  buildProductMessages,
  parseTranslationResponse,
  requestTranslation,
  mergeCategoryTranslations,
  mergeProductTranslations,
} from '@/lib/i18n-translate'
import {
  SOURCE_LOCALE,
  TRANSLATION_API_URL,
  TRANSLATION_MAX_TOKENS,
  TRANSLATION_MODEL,
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
        /** Idiomas que se acaban de traducir ([] si ya estaba completo). */
        traducidos: string[]
      }
    }
  | { success: false; error: string }

/**
 * Traduce y persiste los idiomas que falten de una categoría.
 * El idioma raíz (inglés) nunca se traduce: se hereda de `name`/`slug`, por lo
 * que su URL ya indexada permanece intacta.
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
      .select('id,name,slug,description,name_i18n,slug_i18n,description_i18n')
      .eq('id', categoriaId)
      .maybeSingle()
    if (readError) return { success: false, error: readError.message }
    if (!row) return { success: false, error: 'La categoría no existe.' }

    const names = asMap(row.name_i18n)
    const slugs = asMap(row.slug_i18n)
    const descriptions = asMap(row.description_i18n)
    const pendientes = (options.locales ?? TARGET_LOCALES).filter((locale) => !names[locale] || !slugs[locale])

    // Nada que traducir: evitar una llamada al modelo (coste cero).
    if (pendientes.length === 0) {
      return {
        success: true,
        data: { name_i18n: names, slug_i18n: slugs, description_i18n: descriptions, traducidos: [] },
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

/** Resultado de una traducción de producto. */
export type TraduccionProductoResult =
  | { success: true; data: { translations: Record<string, any>; traducidos: string[] } }
  | { success: false; error: string }

/**
 * Traduce y persiste los idiomas que falten del nombre/título SEO de un producto.
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
      .select('id,name,titulo_seo,translations')
      .eq('id', productoId)
      .maybeSingle()
    if (readError) return { success: false, error: readError.message }
    if (!row) return { success: false, error: 'El producto no existe.' }

    const translations = asMap(row.translations)
    const pendientes = (options.locales ?? TARGET_LOCALES).filter((locale) => !translations[locale]?.name)

    if (pendientes.length === 0) {
      return { success: true, data: { translations, traducidos: [] } }
    }

    const respuesta = await requestTranslation({
      apiKey,
      apiUrl: TRANSLATION_API_URL,
      model: TRANSLATION_MODEL,
      temperature: TRANSLATION_TEMPERATURE,
      maxTokens: TRANSLATION_MAX_TOKENS,
      messages: buildProductMessages({
        nombre: row.name,
        tituloSeo: row.titulo_seo,
        locales: pendientes,
      }),
    })
    if (!respuesta.success) return { success: false, error: respuesta.error }

    const parsed = parseTranslationResponse(respuesta.text)
    if (!parsed.success) return { success: false, error: parsed.error }

    const nuevas = mergeProductTranslations(translations, parsed.data)
    const { error: updateError } = await supabase
      .from('products')
      .update({ translations: nuevas })
      .eq('id', productoId)
    if (updateError) return { success: false, error: updateError.message }

    return { success: true, data: { translations: nuevas, traducidos: pendientes } }
  } catch (err: any) {
    console.error('[i18n-translate] traducirProducto:', err?.message)
    return { success: false, error: err?.message ?? 'Error traduciendo el producto.' }
  }
}

/** Reexporta el idioma raíz para consumidores que lo necesiten. */
export { SOURCE_LOCALE }
