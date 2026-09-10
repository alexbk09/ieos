import { revalidatePath } from 'next/cache'

/**
 * Revalidación on-demand del sitemap y las páginas afectadas.
 * ------------------------------------------------------------------
 * POR QUÉ existe: el sitemap (app/sitemap.ts) se sirve con ISR de 1 hora.
 * Sin esta capa, un producto recién creado tarda hasta 60 minutos en
 * aparecer en /sitemap.xml. Aquí forzamos la regeneración INMEDIATA tras
 * cualquier alta/edición/baja, tanto manual como por el pipeline.
 *
 * Se centraliza para no duplicar la lógica en cada punto de guardado.
 * Es defensivo: si se invoca fuera de un contexto de request (build, etc.)
 * no rompe la operación de escritura.
 *
 * @param opciones Rutas específicas a revalidar además del sitemap.
 */
export function revalidarSitemap(opciones?: { productoSlug?: string | null; categoriaSlug?: string | null }) {
  try {
    // El sitemap SIEMPRE se revalida: es la fuente que Google recrawlea.
    revalidatePath('/sitemap.xml')
    if (opciones?.productoSlug) revalidatePath('/productos/' + opciones.productoSlug)
    if (opciones?.categoriaSlug) revalidatePath('/categoria/' + opciones.categoriaSlug)
  } catch (err: unknown) {
    // Fuera de request scope (ej. build): se ignora sin romper la escritura.
    console.warn('[sitemap-revalidate] No se pudo revalidar:', err instanceof Error ? err.message : err)
  }
}
