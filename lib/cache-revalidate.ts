import { revalidateTag } from 'next/cache'

/**
 * Invalidación on-demand de la caché de DATOS públicos (`unstable_cache`).
 * ------------------------------------------------------------------
 * POR QUÉ existe: los datos que se leen en todas las páginas (site_settings,
 * navegación de categorías) están memoizados para no repetir miles de consultas
 * a Supabase en el build y en ISR. Sin invalidarlos, un cambio guardado en el
 * panel tardaría hasta PUBLIC_DATA_REVALIDATE_SECONDS en verse.
 *
 * Se centraliza (mismo patrón que lib/sitemap-revalidate.ts) para no duplicar el
 * manejo defensivo: si se invoca fuera de un contexto de request (build, script)
 * NO rompe la operación de escritura, solo avisa.
 *
 * ⚠️ Next 16 exige el perfil en `revalidateTag`; 'max' purga la entrada de
 * inmediato y se vuelve a rellenar en la siguiente visita ("stale-while-refill").
 *
 * @param tag Etiqueta con la que se registró la entrada (ver lib/constants.ts).
 */
export function revalidarCacheDeDatos(tag: string) {
  try {
    revalidateTag(tag, 'max')
  } catch (err: unknown) {
    console.warn('[cache-revalidate] No se pudo invalidar la caché:', err instanceof Error ? err.message : err)
  }
}
