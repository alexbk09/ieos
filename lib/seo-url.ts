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
 * Codifica una ruta para que sea una URL VÁLIDA (RFC 3986).
 * POR QUÉ: algunos slugs importados pueden contener caracteres no ASCII
 * (ej. "canon" con eñe). Google RECHAZA en el sitemap las URLs con caracteres
 * sin escapar ("Invalid URL"), así que aquí se convierten a percent-encoding
 * UTF-8. Se usa encodeURI a propósito:
 *  - preserva '/' (no rompe los segmentos de la ruta);
 *  - NO re-codifica '%' → nunca produce doble codificación.
 * Si la ruta trae una secuencia '%' inválida, encodeURI lanza y se devuelve
 * el valor original (nunca rompe el render).
 */
function encodeUrlPath(path: string): string {
  try {
    return encodeURI(path)
  } catch {
    return path
  }
}

/**
 * Convierte una ruta interna en URL absoluta y válida (RFC 3986).
 * @example absoluteUrl('/productos/luz-led') → 'https://dominio.com/productos/luz-led'
 * @example absoluteUrl('/productos/cañon')   → 'https://dominio.com/productos/ca%C3%B1on'
 */
export function absoluteUrl(path = ''): string {
  const base = getSiteOrigin()
  if (!path || path === '/') return `${base}/`
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${encodeUrlPath(cleanPath)}`
}

/**
 * Convierte la URL de un recurso (imagen) en URL absoluta.
 * Google EXIGE URLs absolutas en el sitemap de imágenes.
 *  - URLs ya absolutas (Supabase Storage, CDN de AliExpress) se devuelven intactas.
 *  - Rutas relativas (ej. /products/webp/x.webp) se prefijan con el origin del sitio.
 * @example absoluteAssetUrl('/products/webp/a.webp') → 'https://dominio.com/products/webp/a.webp'
 */
export function absoluteAssetUrl(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const base = getSiteOrigin()
  const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return `${base}${encodeUrlPath(cleanPath)}`
}

/**
 * Indica si un recurso pertenece al DOMINIO PROPIO del sitio.
 * POR QUÉ: un sitemap debe contener ÚNICAMENTE URLs del propio sitio. Las
 * imágenes alojadas en un dominio ajeno (p. ej. el CDN de AliExpress) solo
 * son válidas para Google si ese dominio está verificado en Search Console;
 * si no lo está, generan errores y "ensucian" el sitemap.
 *  - Rutas relativas ('/products/webp/x.webp') SIEMPRE son del sitio.
 *  - URLs absolutas o protocol-relative: solo si su host coincide con el
 *    origin del sitio.
 */
export function isOwnOriginUrl(value: string | null | undefined): boolean {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed) return false
  // Ruta relativa real (no empieza por '//' ni por esquema): es del sitio.
  if (!/^(https?:)?\/\//i.test(trimmed)) return true
  try {
    const candidate = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed
    return new URL(candidate).host === new URL(getSiteOrigin()).host
  } catch {
    return false
  }
}

/**
 * Devuelve el recurso como URL absoluta SOLO si es del dominio propio.
 * Para recursos externos (CDN de AliExpress, storage ajeno…) retorna '',
 * de modo que el sitemap nunca publique URLs de otro dominio.
 */
export function ownOriginAssetUrl(value: string | null | undefined): string {
  if (!isOwnOriginUrl(value)) return ''
  return absoluteAssetUrl(value)
}