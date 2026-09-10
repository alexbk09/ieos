import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CategoryPageView } from '@/components/category-page-view'
import type { CardProduct } from '@/components/product-card'
import { getSiteSettings } from '@/services/site-settings'
import {
  getCategoryBySlug,
  getCategoryNav,
  getCategorySlugs,
  getProductsByCategorySlug,
  type Product,
} from '@/services/catalog'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { htmlToPlainText, clampText } from '@/lib/schema/product-schema'

/**
 * Página indexable de categoría: /categoria/[slug].
 *
 * Estrategia pSEO (Programmatic SEO):
 *  - SSG + ISR (revalidate 300): cada categoría activa se sirve como HTML
 *    estático en CDN. Google recibe el listado de productos renderizado en
 *    servidor (no depende de JS), ideal para rankear por keywords de nicho
 *    ("comprar [categoría]", "[categoría] en Venezuela", etc.).
 *  - Cada producto de la grilla enlaza a su página /productos/[slug] real,
 *    creando una malla de enlazado interno que distribuye autoridad.
 *  - JSON-LD BreadcrumbList + ItemList se inyecta en servidor dentro del
 *    <head> (React 19 Server Component) para Rich Results de Google.
 *  - No se fabrica contenido: título, descripción y productos provienen de
 *    los datos reales de la tabla `categories` y `products`.
 */

/** ISR: se revalida cada 5 min como el resto de la tienda. */
export const revalidate = 300

/** Genera el HTML estático de todas las categorías activas en build time. */
export async function generateStaticParams() {
  const { slugs } = await getCategorySlugs()
  return slugs.map((slug) => ({ slug }))
}

/** Serializa un producto del servicio a la forma mínima de la card. */
function toCardProduct(product: Product): CardProduct {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price_usd: Number(product.price_usd),
    stock: Number(product.stock) || 0,
    image_url: product.image_url ?? '',
    colors: product.colors ?? [],
    peso: product.peso ?? null,
    tamaño: product.tamaño ?? null,
    specifications: product.specifications ?? {},
    pricing_type: product.pricing_type === 'weight' ? 'weight' : 'unit',
    price_per_gram_usd: Number(product.price_per_gram_usd) || 0,
    price_per_kilo_usd: Number(product.price_per_kilo_usd) || 0,
    stock_grams: Number(product.stock_grams) || 0,
    min_order_grams: Number(product.min_order_grams) || 0,
    unit_label: product.unit_label || 'u',
    low_stock_threshold: Number(product.low_stock_threshold ?? 10),
    bulk_discount_percent: Number(product.bulk_discount_percent ?? 0),
    url_afiliado_ali: product.url_afiliado_ali ?? null,
    url_afiliado_amazon: product.url_afiliado_amazon ?? null,
    url_afiliado_store: product.url_afiliado_store ?? null,
    categories: (product.categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? null,
    })),
    images: (product.images ?? []).map((img) => ({
      id: img.id,
      url: img.url,
      alt_text: img.alt_text,
      sort_order: img.sort_order,
      color_name: img.color_name ?? null,
    })),
    marca: product.marca ?? null,
  }
}

/** Metadatos SEO dinámicos de la categoría (title, description, OG, canonical). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const [{ category }, { settings }] = await Promise.all([getCategoryBySlug(slug), getSiteSettings()])

  if (!category) return { title: 'Categoría no encontrada' }

  const name = settings.company_name || 'ilumaX'
  // H1/título largo del hub (pSEO) con fallback al nombre de categoría.
  const hubTitle = category.seo_title?.trim() || `${category.name} — Catálogo`
  // Descripción: prioriza la intro editorial del hub; luego la descripción.
  const fuenteDescripcion = category.seo_intro ?? category.description
  const cleanDescription = fuenteDescripcion
    ? clampText(htmlToPlainText(fuenteDescripcion), 300)
    : `Compra ${category.name} en ${name}: productos seleccionados con envío internacional y compra segura.`

  return buildPageMetadata({
    title: `${hubTitle} | ${name}`,
    description: cleanDescription,
    path: `/categoria/${category.slug}`,
    siteName: name,
  })
}

/** Página server de categoría: listado indexable de productos. */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [{ category }, { products }, { settings }, { items: navCategories }] = await Promise.all([
    getCategoryBySlug(slug),
    getProductsByCategorySlug(slug),
    getSiteSettings(),
    getCategoryNav(),
  ])

  // 404 real si la categoría no existe o está inactiva.
  if (!category) notFound()

  const brandName = settings.company_name || 'ilumaX'
  const origin = absoluteUrl('/').replace(/\/+$/, '')
  const categoryUrl = absoluteUrl(`/categoria/${category.slug}`)

  // JSON-LD: BreadcrumbList + ItemList de los productos de la categoría.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: origin },
          { '@type': 'ListItem', position: 2, name: 'Catálogo', item: `${origin}/catalogo` },
          { '@type': 'ListItem', position: 3, name: category.name, item: categoryUrl },
        ],
      },
      {
        '@type': 'ItemList',
        name: category.name,
        itemListElement: (products ?? []).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.name,
          url: `${origin}/productos/${p.slug}`,
        })),
      },
      // FAQPage del nicho: refleja la FAQ visible del hub (Google exige que el
      // marcado coincida con el contenido de la página). Se omite si no hay FAQ.
      ...(category.seo_faq && category.seo_faq.length > 0
        ? [
            {
              '@type': 'FAQPage',
              mainEntity: category.seo_faq.map((f) => ({
                '@type': 'Question',
                name: f.pregunta,
                acceptedAnswer: { '@type': 'Answer', text: htmlToPlainText(f.respuesta) },
              })),
            },
          ]
        : []),
    ],
  }

  return (
    <>
      {/* JSON-LD en servidor dentro del <head> (Rich Results de Google). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <CategoryPageView
        category={{
          name: category.name,
          slug: category.slug,
          description: category.description,
          seo_title: category.seo_title ?? null,
          seo_intro: category.seo_intro ?? null,
          seo_faq: category.seo_faq ?? null,
        }}
        categories={navCategories}
        products={(products ?? []).map(toCardProduct)}
        navLinks={settings.nav_links}
        brand={{
          name: brandName,
          tagline: settings.tagline || '',
          logoUrl: settings.logo_url,
          iconUrl: settings.icon_url,
        }}
        footer={settings.footer_texts}
        social={settings.social_links}
        brandAddress={settings.address}
      />
    </>
  )
}
