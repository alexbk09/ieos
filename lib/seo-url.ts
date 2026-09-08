// ============================================================
// Utilidades de URL absoluta para SEO (metadatos + JSON-LD).
//
// POR QUÉ existe este módulo:
//  - Google exige URLs absolutas en el marcado estructurado,
//    openGraph y canonical.
//  - La tienda usa SSG+ISR: en build time no existe `headers()`
//    (haría la página dinámica por request). La única fuente
//    fiable de origin es NEXT_PUBLIC_SITE_URL del deploy.
//  - En desarrollo se usa localhost para que el build local
//    no falle y la prueba en navegador funcione.
// ============================================================

/** Origin por defecto SOLO para desarrollo local. */
const DEFAULT_DEV_ORIGIN = 'http://localhost:3000'

/**
 * Devuelve el origin absoluto del sitio (sin barra final).
 * En producción NUNCA se inventa: requiere NEXT_PUBLIC_SITE_URL.
 */
export function getSiteOrigin(): string {
  const envOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (envOrigin) return envOrigin.replace(/\/+$/, '')

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[seo-url] Define NEXT_PUBLIC_SITE_URL en producción para canonical/JSON-LD correcto.',
    )
  }
  return DEFAULT_DEV_ORIGIN
}

/**
 * Convierte una ruta interna en URL absoluta.
 * @example absoluteUrl('/productos/luz-led') → 'https://dominio.com/productos/luz-led'
 */
export function absoluteUrl(path = ''): string {
  const base = getSiteOrigin()
  if (!path || path === '/') return `${base}/`
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${cleanPath}`
}