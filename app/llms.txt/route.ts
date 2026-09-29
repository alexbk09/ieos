import { getSiteSettings } from '@/services/site-settings'
import { getSitemapProducts } from '@/services/aliProducts'
import { getPrimaryCategories, getSitemapCategories } from '@/services/catalog'
import { getSitemapEntries } from '@/services/entries'
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
export const revalidate = false

export async function GET() {
  const [{ settings }, { items: categories }, { data: primaryCategories }, products, { items: entries }] = await Promise.all([
    getSiteSettings(),
    getSitemapCategories(),
    getPrimaryCategories(),
    getSitemapProducts(),
    getSitemapEntries(),
  ])

  const name = settings.company_name || 'zonadehobbies'
  const tagline = settings.tagline || ''
  const lines: string[] = []

  lines.push('# ' + name)
  if (tagline) lines.push('> ' + tagline)
  lines.push('')

  const parentsWithProducts = new Set(
    categories.map((category) => category.parent_id).filter((id): id is string => Boolean(id)),
  )

  lines.push('## Hobbies')
  lines.push('')
  const publishedParents = (primaryCategories ?? []).filter((category) => parentsWithProducts.has(category.id))
  if (publishedParents.length === 0) {
    lines.push('- Sin hobbies publicados todavia.')
  } else {
    for (const category of publishedParents) {
      lines.push('- ' + category.name + ': ' + absoluteUrl('/' + category.slug))
    }
  }
  lines.push('')

  lines.push('## Subcategorias')
  lines.push('')
  if (categories.length === 0) {
    lines.push('- Sin subcategorias publicadas todavia.')
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

  // Entradas SEO: guías y comparativas (contenido informacional; ayuda a los
  // motores de IA a entender los clusters temáticos del sitio).
  lines.push('## Guias y comparativas')
  lines.push('')
  if (entries.length === 0) {
    lines.push('- Sin guias publicadas todavia.')
  } else {
    for (const entry of entries) {
      lines.push('- ' + entry.slug + ': ' + absoluteUrl('/guias/' + entry.slug))
    }
  }
  lines.push('')

  lines.push('## Recursos')
  lines.push('')
  lines.push('- Sitemap: ' + absoluteUrl('/sitemap.xml'))
  lines.push('- Catalogo: ' + absoluteUrl('/catalogo'))
  lines.push('- Guias: ' + absoluteUrl('/guias'))

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=' + SITEMAP_REVALIDATE_SECONDS + ', stale-while-revalidate',
    },
  })
}
