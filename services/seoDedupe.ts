import { createPublicClient } from '@/lib/supabase/public'
import { SEO_TITLE_SIGNATURE_WORDS } from '@/lib/constants'
import { firmaTitulo } from '@/lib/seo-rules'

// Las funciones puras viven en lib/seo-rules.mjs (testeables con node --test).
// Se re-exportan aquí para mantener el punto de entrada del módulo.
export { normalizarTitulo, firmaTitulo } from '@/lib/seo-rules'

/**
 * Control anti-duplicado de títulos (calidad pSEO).
 * ------------------------------------------------------------------
 * Google ignora (o penaliza) fichas con títulos casi idénticos. Este
 * servicio compara la "firma" de un título candidato contra el catálogo
 * real para evitar publicar contenido duplicado.
 *
 * POR QUÉ compara una firma y no el título completo:
 *  - Los títulos de AliExpress comparten prefijos largos ("Envase
 *    Triangular...", "Nuevo 2024..."). La firma (las primeras N
 *    palabras significativas, normalizadas) detecta esos clones sin
 *    falsos positivos por diferencias triviales.
 *
 * Regla de oro: los componentes NUNCA llaman a supabase directamente;
 * toda lectura del catálogo pasa por esta capa.
 */

/**
 * Comprueba si ya existe en el catálogo un producto con la misma firma.
 * @param titulo Título candidato (titulo_seo generado).
 * @param slugExcluir Slug del propio producto (para no auto-colisionar en updates).
 * @returns { success, duplicado, tituloSimilar } — tituloSimilar es el que colisiona.
 */
export async function existeTituloSimilar(titulo: string, slugExcluir?: string) {
  try {
    const firma = firmaTitulo(titulo, SEO_TITLE_SIGNATURE_WORDS)
    if (!firma) return { success: true as const, duplicado: false, tituloSimilar: null }

    // Prefiltro barato en la BD: la primera palabra de la firma reduce filas.
    const primeraPalabra = firma.split(' ')[0]
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('products')
      .select('titulo_seo,name,slug')
      .or('titulo_seo.ilike.%' + primeraPalabra + '%,name.ilike.%' + primeraPalabra + '%')
      .limit(200)
    if (error) return { success: false as const, duplicado: false, tituloSimilar: null, error: error.message }

    let tituloSimilar: string | null = null
    for (const row of (data ?? []) as any[]) {
      if (slugExcluir && row?.slug === slugExcluir) continue
      const candidato = (row?.titulo_seo || row?.name || '') as string
      if (firmaTitulo(candidato, SEO_TITLE_SIGNATURE_WORDS) === firma) {
        tituloSimilar = candidato
        break
      }
    }

    return { success: true as const, duplicado: Boolean(tituloSimilar), tituloSimilar }
  } catch (err: any) {
    console.error('[seoDedupe] existeTituloSimilar:', err?.message)
    return { success: false as const, duplicado: false, tituloSimilar: null, error: err?.message ?? 'Error verificando duplicado.' }
  }
}
