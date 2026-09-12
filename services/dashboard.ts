import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de métricas del Dashboard administrativo (plataforma de afiliación).
 * ------------------------------------------------------------------
 * Responde a UNA pregunta: "¿cómo está el negocio AHORA?" para el modelo REAL
 * del proyecto: catálogo de afiliados (AliExpress/Amazon) + contenido pSEO.
 *
 * Reemplaza las métricas legadas del sistema de tienda física (ventas,
 * finanzas, logística), cuyos módulos quedaron ocultos en HIDDEN_MODULE_SLUGS.
 * Aquí solo se mide lo que el sistema actual produce:
 *   1. Catálogo de afiliación (productos, nichos/categorías, marcas, proveedores).
 *   2. Contenido pSEO (entradas/guias y hubs de nicho).
 *   3. Automatización AliExpress (historial del scraper).
 *
 * Regla de oro: los componentes NUNCA consultan Supabase; todo pasa por aquí.
 * Se usan conteos (count/head) y proyecciones mínimas para que el panel siga
 * siendo rápido aunque el catálogo crezca a miles de filas.
 */

/** KPIs del catálogo de afiliación. */
export type DashboardCatalogo = {
  productosTotal: number
  productosActivos: number
  productosConAfiliado: number
  productosSinMarca: number
  categoriasTotal: number
  categoriasActivas: number
  categoriasConHub: number
  marcasTotal: number
  proveedoresTotal: number
}

/** KPIs del contenido pSEO (guías/comparativas). */
export type DashboardContenido = {
  entradasTotal: number
  entradasPublicadas: number
  entradasBorrador: number
  entradasRevision: number
  entradasArchivadas: number
}

/** KPIs de la automatización del scraper AliExpress. */
export type DashboardScraper = {
  total: number
  exitos: number
  errores: number
  ultimos: { url_producto: string; estado: string; created_at: string }[]
}

export type DashboardOverview = {
  catalogo: DashboardCatalogo
  contenido: DashboardContenido
  scraper: DashboardScraper
}

/**
 * Agrega todas las métricas del Dashboard en una sola pasada paralela.
 * @returns { data } con los conteos, o { error } si alguna consulta falla.
 */
export async function getDashboardOverview(): Promise<{
  data: DashboardOverview | null
  error: { message: string } | null
}> {
  try {
    const supabase = await createServerClient()

    const [
      productosTotal,
      productosActivos,
      productosConAfiliado,
      productosSinMarca,
      categorias,
      marcas,
      proveedores,
      entradas,
      scraperTotal,
      scraperExitos,
      scraperErrores,
      scraperUltimos,
    ] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_available', true),
      // Productos publicables como afiliado: tienen al menos un enlace de salida.
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .or('url_afiliado_ali.not.is.null,url_afiliado_amazon.not.is.null,url_afiliado_store.not.is.null'),
      supabase.from('products').select('id', { count: 'exact', head: true }).is('marca_id', null),
      // Categorías = nichos. Solo se proyectan las columnas necesarias.
      supabase.from('categories').select('activa, seo_title'),
      supabase.from('marcas').select('id', { count: 'exact', head: true }),
      supabase.from('proveedores').select('id', { count: 'exact', head: true }),
      supabase.from('seo_entries').select('estado'),
      supabase.from('scraper_logs').select('id', { count: 'exact', head: true }),
      supabase.from('scraper_logs').select('id', { count: 'exact', head: true }).eq('estado', 'exito'),
      supabase.from('scraper_logs').select('id', { count: 'exact', head: true }).eq('estado', 'error'),
      supabase.from('scraper_logs').select('url_producto, estado, created_at').order('created_at', { ascending: false }).limit(5),
    ])

    // Solo se informa el primer error visible; el resto de métricas se conserva.
    const primerError =
      productosTotal.error ?? categorias.error ?? entradas.error ?? scraperTotal.error ?? null

    const categoriasRows = (categorias.data ?? []) as { activa: boolean | null; seo_title: string | null }[]
    const entradasRows = (entradas.data ?? []) as { estado: string }[]

    const data: DashboardOverview = {
      catalogo: {
        productosTotal: productosTotal.count ?? 0,
        productosActivos: productosActivos.count ?? 0,
        productosConAfiliado: productosConAfiliado.count ?? 0,
        productosSinMarca: productosSinMarca.count ?? 0,
        categoriasTotal: categoriasRows.length,
        categoriasActivas: categoriasRows.filter((c) => c.activa !== false).length,
        categoriasConHub: categoriasRows.filter((c) => Boolean(c.seo_title?.trim())).length,
        marcasTotal: marcas.count ?? 0,
        proveedoresTotal: proveedores.count ?? 0,
      },
      contenido: {
        entradasTotal: entradasRows.length,
        entradasPublicadas: entradasRows.filter((e) => e.estado === 'publicado').length,
        entradasBorrador: entradasRows.filter((e) => e.estado === 'borrador').length,
        entradasRevision: entradasRows.filter((e) => e.estado === 'revision').length,
        entradasArchivadas: entradasRows.filter((e) => e.estado === 'archivado').length,
      },
      scraper: {
        total: scraperTotal.count ?? 0,
        exitos: scraperExitos.count ?? 0,
        errores: scraperErrores.count ?? 0,
        ultimos: (scraperUltimos.data ?? []) as DashboardScraper['ultimos'],
      },
    }

    return { data, error: primerError ? { message: primerError.message } : null }
  } catch (err: any) {
    console.error('[dashboard] getDashboardOverview:', err?.message)
    return { data: null, error: { message: err?.message ?? 'Error cargando el resumen del panel.' } }
  }
}
