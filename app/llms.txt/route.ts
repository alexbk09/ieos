import { getSiteSettings } from '@/services/site-settings'
import { getSitemapProducts } from '@/services/aliProducts'
import { getSitemapCategories } from '@/services/catalog'
import { absoluteUrl } from '@/lib/seo-url'
import { SITEMAP_REVALIDATE_SECONDS } from '@/lib/constants'

/**
 * /llms.txt — índice curado para motores de IA (ChatGPT, Gemini, Perplexity).
 * ------------------------------------------------------------------
 * El estándar llms.txt propone un archivo de texto plano con los enlaces
 * clave de la web para que los LLM extraigan estructura, categorías y
 * fichas de producto de forma limpia, sin parsear HTML.
 *
 * Se deriva del MISMO origen de datos que el sitemap (capa /services) y se
 * cachea con ISR: se mantiene fresco sin coste por request.
 */

// Next exige que el segment config `revalidate` sea un literal estático.
// El valor debe coincidir con SITEMAP_REVALIDATE_SECONDS (1 hora).
export const revalidate = 3600

export async function GET() {
  const [{ settings }, { items: categories }, products] = await Promise.all([
    getSiteSettings(),
    getSitemapCategories(),
    getSitemapProducts(),
  ])

  const name = settings.company_name || 'ilumaX'
  const tagline = settings.tagline || ''
  const lines: string[] = []

  lines.push('# ' + name)
  if (tagline) lines.push('> ' + tagline)
  lines.push('')

  // Hubs de categoría (pSEO) primero: son las páginas de mayor valor.
  lines.push('## Categorias')
  lines.push('')
  if (categories.length === 0) {
    lines.push('- Sin categorias publicadas todavia.')
  } else {
    for (const category of categories) {
      lines.push('- ' + category.slug + ': ' + absoluteUrl('/categoria/' + category.slug))
    }
  }
  lines.push('')

  // Fichas de producto indexables.
  lines.push('## Productos')
  lines.push('')
  if (products.success && products.data && products.data.length > 0) {
    for (const product of products.data) {
      lines.push('- ' + product.slug + ': ' + absoluteUrl('/productos/' + product.slug))
    }
  } else {
    lines.push('- Sin productos indexables todavia.')
  }
  lines.push('')

  lines.push('## Recursos')
  lines.push('')
  lines.push('- Sitemap: ' + absoluteUrl('/sitemap.xml'))
  lines.push('- Catalogo: ' + absoluteUrl('/catalogo'))

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=' + SITEMAP_REVALIDATE_SECONDS + ', stale-while-revalidate',
    },
  })
}
