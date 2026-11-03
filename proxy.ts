import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { DEFAULT_LOCALE, buildLocalizedPath } from '@/lib/i18n-config'

/**
 * Proxy (middleware) del sitio.
 * ------------------------------------------------------------------
 * Cumple dos responsabilidades INDEPENDIENTES:
 *
 *  1) SESIÓN: en /admin, /dashboard y /auth refresca la cookie de Supabase
 *     (comportamiento original, intacto).
 *
 *  2) IDIOMA (estrategia "as-needed"): el idioma por defecto se sirve SIN
 *     prefijo para NO cambiar ninguna URL ya indexada. Un request a /catalogo
 *     se resuelve por REWRITE interno hacia /es/catalogo:
 *       - La URL visible no cambia → cero migración y cero saltos 301 en los
 *         enlaces internos (mejor velocidad y mejor crawl budget).
 *       - Las páginas siguen siendo HTML estático (ISR) servido desde CDN.
 *     A la inversa, /es/... redirige 301 a su versión sin prefijo para que
 *     exista UNA sola URL canónica por página en el idioma por defecto.
 */

/** Rutas privadas que requieren refresco de la sesión de Supabase. */
const SESSION_PREFIXES = ['/admin', '/dashboard', '/auth']

/** ¿La ruta pertenece a un área con sesión? */
function isSessionRoute(pathname: string): boolean {
  return SESSION_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1) Áreas con sesión: refresco de cookies de Supabase (sin tocar el idioma).
  if (isSessionRoute(pathname)) return updateSession(request)

  // 2) El idioma por defecto NUNCA lleva prefijo: /es/... → /...  (301 canónico).
  if (pathname === `/${DEFAULT_LOCALE}` || pathname.startsWith(`/${DEFAULT_LOCALE}/`)) {
    const url = request.nextUrl.clone()
    url.pathname = buildLocalizedPath(
      pathname.slice(DEFAULT_LOCALE.length + 1) || '/',
      DEFAULT_LOCALE,
      { prefixDefaultLocale: false },
    )
    return NextResponse.redirect(url, 301)
  }

  // 3) Ruta pública sin prefijo: se sirve el HTML del idioma por defecto con un
  //    rewrite interno (la URL visible se mantiene → las URLs actuales no cambian).
  const url = request.nextUrl.clone()
  url.pathname = buildLocalizedPath(pathname, DEFAULT_LOCALE, { prefixDefaultLocale: true })
  return NextResponse.rewrite(url)
}

/**
 * Rutas donde corre el proxy:
 *  - Áreas con sesión (auth).
 *  - Páginas públicas (para la resolución "as-needed" del idioma).
 * Se EXCLUYEN /api, /_next, sitemap.xml, robots.txt, llms.txt, el archivo de
 * verificación de Google y los ficheros estáticos para no penalizar el rendimiento ni el crawl.
 *
 * ⚠️ IMPORTANTE: esto es una LISTA BLANCA. Toda ruta pública nueva (como
 * /guias) DEBE añadirse aquí; si no, no se reescribe al idioma por defecto y
 * Next responde 404 (busca app/(site)/<ruta> y solo existe [locale]/<ruta>).
 */
export const config = {
  matcher: [
    '/admin/:path*',
    '/dashboard/:path*',
    '/auth/:path*',
    '/',
    '/catalogo/:path*',
    '/categoria/:path*',
    '/productos/:path*',
    // Hub y entradas de contenido (guías y comparativas).
    '/guias/:path*',
    // Documentos legales (términos, privacidad y aviso de afiliado) + hub de
    // políticas. Toda ruta pública nueva DEBE estar aquí o Next responde 404.
    '/terminos/:path*',
    '/privacidad/:path*',
    '/afiliados/:path*',
    '/politicas/:path*',
    '/es/:path*',
    // Hubs principales dinámicos (p. ej. /gaming, /desk-setup). Solo raíz:
    // rutas reservadas, archivos y locales quedan fuera de esta regla.
    '/((?!(?:api|_next|sitemap\\.xml|robots\\.txt|llms\\.txt|favicon\\.ico|google8222e40aea313a4f\\.html|es|en|fr|de|it|pt|catalogo|categoria|productos|guias|terminos|privacidad|afiliados|politicas)(?:/|$))[^/]+)',
  ],
}
