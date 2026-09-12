import { createPublicClient } from '@/lib/supabase/public'
import { SEO_TITLE_SIGNATURE_WORDS } from '@/lib/constants'
import { firmaTitulo } from '@/lib/entry-rules'

/**
 * Control anti-duplicado de ENTRADAS SEO.
 * ------------------------------------------------------------------
 * Google penaliza (o directamente ignora) artículos casi idénticos: publicar
 * 20 variaciones de "los mejores LED" es la definición de "contenido basura a
 * escala". Este servicio compara la FIRMA del título (primeras palabras
 * significativas, normalizadas) y el slug contra las entradas ya existentes,
 * y alimenta al modelo con la lista de títulos a evitar.
 *
 * POR QUÉ una firma y no el título completo: los títulos editoriales comparten
 * prefijos largos ("Los mejores...", "Guía de..."), así que la firma detecta
 * clones sin falsos positivos por diferencias triviales (año, guion, etc.).
 *
 * Regla de oro: los componentes nunca llaman a Supabase; esto vive en /services.
 */

// La firma se re-exporta para que el resto del módulo tenga un punto de entrada.
export { firmaTitulo } from '@/lib/entry-rules'

/**
 * Comprueba si ya existe una entrada con la misma firma de título o el mismo slug.
 * @param titulo Título candidato (propuesto por la IA o escrito a mano).
 * @param opciones.slug Slug candidato (se comprueba duplicado exacto).
 * @param opciones.excludeId Id de la entrada que se está editando (no auto-colisionar).
 * @returns { success, duplicado, tituloSimilar, slugDuplicado }
 */
export async function existeEntradaSimilar(
  titulo: string,
  opciones: { slug?: string; excludeId?: string } = {},
) {
  try {
    const firma = firmaTitulo(titulo, SEO_TITLE_SIGNATURE_WORDS)
    const slug = String(opciones.slug ?? '').trim()
    if (!firma && !slug) {
      return { success: true as const, duplicado: false, tituloSimilar: null, slugDuplicado: false }
    }

    const supabase = createPublicClient()
    // Prefiltro barato: la primera palabra de la firma reduce las filas leídas.
    let query = supabase.from('seo_entries').select('id,titulo,slug')
    const primeraPalabra = firma.split(' ')[0]
    if (primeraPalabra) query = query.ilike('titulo', '%' + primeraPalabra + '%')
    const { data, error } = await query.limit(200)
    if (error) {
      return { success: false as const, duplicado: false, tituloSimilar: null, slugDuplicado: false, error: error.message }
    }

    let tituloSimilar: string | null = null
    let slugDuplicado = false
    for (const row of (data ?? []) as any[]) {
      if (opciones.excludeId && row?.id === opciones.excludeId) continue
      if (slug && row?.slug === slug) slugDuplicado = true
      if (!tituloSimilar && firma && firmaTitulo(row?.titulo ?? '', SEO_TITLE_SIGNATURE_WORDS) === firma) {
        tituloSimilar = row?.titulo ?? null
      }
    }

    return {
      success: true as const,
      duplicado: Boolean(tituloSimilar) || slugDuplicado,
      tituloSimilar,
      slugDuplicado,
    }
  } catch (err: any) {
    console.error('[entry-dedupe] existeEntradaSimilar:', err?.message)
    return {
      success: false as const,
      duplicado: false,
      tituloSimilar: null,
      slugDuplicado: false,
      error: err?.message ?? 'Error verificando duplicados.',
    }
  }
}

/**
 * Recoge el contexto anti-duplicado que se le inyecta al modelo.
 * POR QUÉ se le pasa al LLM: prohibirle frases genéricas no basta; si ve los
 * títulos y keywords ya publicados, evita parafrasearlos (coste cero de
 * corrección posterior y menos reintentos).
 * @param limit Nº máximo de entradas recientes a considerar.
 * @returns { titulos, slugs, keywords }
 */
export async function contextoAntiDuplicado(limit = 60) {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('seo_entries')
      .select('titulo,slug,keywords')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return { titulos: [] as string[], slugs: [] as string[], keywords: [] as string[], error: error.message }

    const titulos: string[] = []
    const slugs: string[] = []
    const keywords: string[] = []
    for (const row of (data ?? []) as any[]) {
      if (row?.titulo) titulos.push(String(row.titulo))
      if (row?.slug) slugs.push(String(row.slug))
      for (const keyword of Array.isArray(row?.keywords) ? row.keywords : []) {
        const value = String(keyword ?? '').trim().toLowerCase()
        if (value && !keywords.includes(value)) keywords.push(value)
      }
    }
    return { titulos, slugs, keywords, error: null }
  } catch (err: any) {
    console.error('[entry-dedupe] contextoAntiDuplicado:', err?.message)
    return { titulos: [] as string[], slugs: [] as string[], keywords: [] as string[], error: err?.message }
  }
}
