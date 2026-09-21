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
import { getEntriesForCategory, entryHeroImage } from '@/services/entries'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { OG_IMAGE_PATH } from '@/lib/constants'
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

/** ISR moderado: se revalida cada 24h para mantener la página estática sin
 * disparar regeneraciones masivas en background en Vercel. */
export const revalidate = 86400

/**
 * Genera el HTML estático de cada categoría activa por cada idioma PUBLICADO,
 * usando el slug LOCALIZADO de ese idioma (URL en el idioma del público).
 * Incluye también los slugs BASE para que las URLs antiguas sigan vivas.
 */
export async function generateStaticParams() {
  const { items } = await getCategorySlugs()
  const params: { locale: string; slug: string }[] = []
  const vistos = new Set<string>()
  for (const locale of publishedLocales()) {
    for (const item of items) {
      const slug = item.slug_i18n?.[locale] ?? item.slug
      const clave = `${locale}:${slug}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      params.push({ locale, slug })
    }
  }
  return params
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
      slug_localizado: c.slug_localizado,
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

/** Metadatos SEO dinámicos de la categoría (title, description, OG, canonical, hreflang). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  const [{ category }, { settings }] = await Promise.all([getCategoryBySlug(slug, locale), getSiteSettings(locale)])

  if (!category) return { title: 'Categoría no encontrada' }

  const name = settings.company_name || 'zonadehobbies'
  // H1/título largo del hub (pSEO) con fallback al nombre de categoría.
  const hubTitle = category.seo_title?.trim() || `${category.name} — Catálogo`
  // Descripción: prioriza la intro editorial del hub; luego la descripción.
  const fuenteDescripcion = category.seo_intro ?? category.description
  const cleanDescription = fuenteDescripcion
    ? clampText(htmlToPlainText(fuenteDescripcion), 300)
    : `Compra ${category.name} en ${name}: productos seleccionados con envío internacional y compra segura.`

  // Canónica con el slug LOCALIZADO del idioma (SEO por idioma).
  const canonicalSlug = category.slug_localizado ?? category.slug
  const path = buildLocalizedPath(`/categoria/${canonicalSlug}`, locale, { prefixDefaultLocale: false })

  // hreflang: una URL por idioma PUBLICADO, cada una con su slug localizado.
  const alternatesByLocale = Object.fromEntries(
    publishedLocales().map((l) => {
      const localizedSlug = category.slug_i18n?.[l] ?? category.slug
      return [l, buildLocalizedPath(`/categoria/${localizedSlug}`, l, { prefixDefaultLocale: false })]
    }),
  )

  return buildPageMetadata({
    title: `${hubTitle} | ${name}`,
    description: cleanDescription,
    path,
    // Imagen social por defecto (la categoría hereda la OG de marca).
    image: absoluteUrl(OG_IMAGE_PATH),
    siteName: name,
    alternatesByLocale,
  })
}

/** Página server de categoría: listado indexable de productos. */
export default async function CategoryPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  const [{ category }, { products }, { settings }, { items: navCategories }] = await Promise.all([
    // La resolución por locale habilita URLs localizadas (/fr/categoria/...) y
    // devuelve nombre/descripción/SEO del idioma pedido (con fallback).
    getCategoryBySlug(slug, locale),
    getProductsByCategorySlug(slug, 0, locale),
    getSiteSettings(locale),
    getCategoryNav(undefined, locale),
  ])

  // 404 real si la categoría no existe o está inactiva.
  if (!category) notFound()

  // Guías del nicho: completa el enlazado interno BIDIRECCIONAL (hub ↔ entrada).
  // Se consulta DESPUÉS porque necesita el id de la categoría ya resuelta.
  const { entries: guides } = await getEntriesForCategory(category.id, locale)

  const brandName = settings.company_name || 'zonadehobbies'
  const origin = absoluteUrl('/').replace(/\/+$/, '')
  // URL canónica del idioma: usa el slug LOCALIZADO (SEO por idioma).
  const canonicalSlug = category.slug_localizado ?? category.slug
  const categoryUrl = absoluteUrl(
    buildLocalizedPath(`/categoria/${canonicalSlug}`, locale, { prefixDefaultLocale: false }),
  )

  // JSON-LD: BreadcrumbList + ItemList de los productos de la categoría.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: origin },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Catálogo',
            item: absoluteUrl(buildLocalizedPath('/catalogo', locale, { prefixDefaultLocale: false })),
          },
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
          url: absoluteUrl(buildLocalizedPath(`/productos/${p.slug}`, locale, { prefixDefaultLocale: false })),
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
          // Firma editorial del hub (autoría visible = E-E-A-T).
          autor: category.autor ?? null,
        }}
        categories={navCategories}
        products={(products ?? []).map(toCardProduct)}
        guides={guides.map((guide) => ({
          titulo: guide.titulo,
          slugLocalizado: guide.slug_localizado ?? guide.slug,
          resumen: guide.resumen,
          // Misma cadena de prioridad que en el hub: nunca una tarjeta sin foto.
          imagenUrl: entryHeroImage(guide),
        }))}
        navLinks={settings.nav_links}
        brand={{
          name: brandName,
          tagline: settings.tagline || '',
          logoUrl: settings.logo_url,
          iconUrl: settings.icon_url,
          whatsapp: settings.whatsapp_number,
        }}
        footer={settings.footer_texts}
        social={settings.social_links}
        brandAddress={settings.address}
      />
    </>
  )
}
