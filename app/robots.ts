import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo-url'

/**
 * robots.txt dinámico en /robots.txt.
 * Reemplaza al archivo estático public/robots.txt que tenía el dominio
 * hardcodeado (ilumax.ve). Ahora la URL del sitemap se deriva de
 * NEXT_PUBLIC_SITE_URL para que funcione en cualquier entorno/deploy.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/dashboard', '/api', '/login', '/perfil', '/auth', '/manual'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
