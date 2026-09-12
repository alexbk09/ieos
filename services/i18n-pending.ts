import { createClient as createServerClient } from '@/lib/supabase/server'
import { isSourceLocaleNamePending, missingCategoryLocales, missingProductLocales } from '@/lib/i18n-translate'
import { I18N_PENDING_BATCH_LIMIT } from '@/lib/constants'
import {
  traducirCategoria,
  traducirNombreCategoriaAlIdiomaRaiz,
  traducirProducto,
} from '@/services/i18n-translate'

/**
 * Servicio del panel "Idiomas y Traducciones".
 * ------------------------------------------------------------------
 * Detecta qué productos y categorías tienen contenido SIN traducir y los traduce
 * en tandas acotadas, reutilizando los servicios de i18n (la MISMA lógica que el
 * backfill por consola, pero disparada desde la UI). Los componentes nunca tocan
 * Supabase: todo pasa por aquí (regla de oro).
 */

/** Resumen de traducciones pendientes por tipo de entidad. */
export type PendingTranslationsSummary = {
  products: number
  categories: number
  total: number
}

/** Resultado de una tanda de traducción automática. */
export type TranslatePendingResult = {
  products: { translated: number; failed: number }
  categories: { translated: number; failed: number }
  /** Pendientes que quedan tras la tanda (alimenta el progreso en vivo). */
  pending: PendingTranslationsSummary
}

/** Proyección mínima para evaluar pendientes (evita traer columnas pesadas). */
const PRODUCT_PENDING_COLUMNS = 'id,translations,description'
const CATEGORY_PENDING_COLUMNS =
  'id,name,name_i18n,slug_i18n,seo_title_i18n,seo_intro_i18n,seo_faq_i18n,seo_title,seo_intro,seo_faq'

/**
 * ¿La categoría necesita trabajo de i18n?
 * Cubre los dos desfases posibles:
 *  1. Le faltan idiomas DESTINO (traducciones de la ficha).
 *  2. Su nombre base aún no está redactado en el idioma RAÍZ (data heredada del
 *     pipeline antiguo, escrita en inglés): es lo que hacía que el filtro del
 *     catálogo en español mostrara nombres en inglés.
 */
function categoriaPendiente(row: any): boolean {
  return missingCategoryLocales(row).length > 0 || isSourceLocaleNamePending(row)
}

/**
 * IDs de productos con al menos un idioma destino sin traducir.
 * @returns Lista de IDs y el error de Supabase (null si todo fue bien).
 */
async function getPendingProductIds(): Promise<{ ids: string[]; error: any }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('products').select(PRODUCT_PENDING_COLUMNS)
  if (error) return { ids: [], error }
  const ids = (data ?? [])
    .filter((row: any) => missingProductLocales(row).length > 0)
    .map((row: any) => String(row.id))
  return { ids, error: null }
}

/**
 * IDs de categorías que necesitan trabajo de i18n (idiomas destino o el nombre
 * del idioma raíz aún sin redactar).
 * @returns Lista de IDs y el error de Supabase (null si todo fue bien).
 */
async function getPendingCategoryIds(): Promise<{ ids: string[]; error: any }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('categories').select(CATEGORY_PENDING_COLUMNS)
  if (error) return { ids: [], error }
  const ids = (data ?? []).filter((row: any) => categoriaPendiente(row)).map((row: any) => String(row.id))
  return { ids, error: null }
}

/**
 * Cuenta cuántos productos y categorías tienen traducciones pendientes.
 * Lectura ligera: solo las columnas necesarias para decidir el estado.
 */
export async function getPendingTranslationsSummary(): Promise<{
  data: PendingTranslationsSummary | null
  error: any
}> {
  const [productos, categorias] = await Promise.all([getPendingProductIds(), getPendingCategoryIds()])
  if (productos.error || categorias.error) return { data: null, error: productos.error ?? categorias.error }

  const products = productos.ids.length
  const categories = categorias.ids.length
  return { data: { products, categories, total: products + categories }, error: null }
}

/**
 * Traduce una tanda ACOTADA de contenido pendiente (productos primero, luego
 * categorías) reutilizando los servicios de i18n. El límite mantiene cada
 * petición HTTP corta: el panel repite tandas hasta terminar (progreso visible).
 * @param options.limit Nº máximo de entidades a traducir en esta tanda.
 */
export async function translatePendingBatch(
  options: { limit?: number } = {},
): Promise<{ data: TranslatePendingResult | null; error: any }> {
  const limit = Math.max(1, Math.floor(options.limit ?? I18N_PENDING_BATCH_LIMIT))

  const [productos, categorias] = await Promise.all([getPendingProductIds(), getPendingCategoryIds()])
  if (productos.error || categorias.error) return { data: null, error: productos.error ?? categorias.error }

  const result: TranslatePendingResult = {
    products: { translated: 0, failed: 0 },
    categories: { translated: 0, failed: 0 },
    pending: {
      products: productos.ids.length,
      categories: categorias.ids.length,
      total: productos.ids.length + categorias.ids.length,
    },
  }

  // Presupuesto único por tanda (productos primero). Cada entidad consume 1.
  let budget = limit

  for (const id of productos.ids) {
    if (budget <= 0) break
    budget -= 1
    const r = await traducirProducto(id)
    if (!r.success) result.products.failed += 1
    else if (r.data.traducidos.length > 0) result.products.translated += 1
  }

  for (const id of categorias.ids) {
    if (budget <= 0) break
    budget -= 1

    // 1) NOMBRE en el idioma raíz: repara la data heredada en inglés (es lo que
    //    el filtro en español mostraba mal). Sin pendiente, no llama al modelo.
    const raiz = await traducirNombreCategoriaAlIdiomaRaiz(id)
    // 2) Idiomas destino pendientes, redactados DESDE el nombre raíz ya correcto.
    const r = await traducirCategoria(id)

    // Un fallo en cualquier paso cuenta como categoría fallida; un cambio real en
    // cualquiera de los dos cuenta como traducida (alimenta la barra de progreso).
    if (!raiz.success || !r.success) result.categories.failed += 1
    else if (raiz.data.actualizado || r.data.traducidos.length > 0) result.categories.translated += 1
  }

  // Recalcular pendientes restantes para reflejar el progreso real en la UI.
  const restante = await getPendingTranslationsSummary()
  if (restante.data) result.pending = restante.data

  return { data: result, error: null }
}
