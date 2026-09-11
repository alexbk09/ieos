import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSiteSettings } from '@/services/site-settings'
import { getPublicProductBySlug, getPublicProductSlugs, getRelatedProducts, getCategoryNav, type Product } from '@/services/catalog'
import { ProductDetailPageView, type DetailProduct } from '@/components/product-detail-page'
import type { CardProduct } from '@/components/product-card'
import { buildProductSchema, buildBreadcrumbSchema, buildFaqSchema, htmlToPlainText, clampText, toAbsoluteUrl } from '@/lib/schema/product-schema'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLanguageAlternates } from '@/lib/seo'
import { buildLocalizedPath, publishedLocales, DEFAULT_LOCALE } from '@/lib/i18n-config'

/**
 * Página pública de detalle de producto: /productos/[slug].
 *
 * Estrategia pSEO anti-penalización:
 *  - SSG + ISR (revalidate 300): HTML estático en CDN y revalidación
 *    cada 5 min. Google NO ve contenido generado por JS.
 *  - JSON-LD application/ld+json se inyecta EN SERVIDOR dentro del
 *    <head> por React 19 (Server Component), no con useEffect — el
 *    marcado viaja en el HTML crudo sin ejecutar JavaScript.
 *  - Los datos del schema provienen de la tabla `products` real
 *    (misma capa /services), por lo que son 100% consistentes con
 *    la UI (evita "content mismatch" que Google penaliza).
 *  - No se inventan reseñas (aggregateRating/review) ni se fabrica
 *    contenido: descripción, precio, imágenes y URL de afiliado se
 *    leen de los metadatos REALES del producto.
 */

/** ISR: la página se revalida cada 5 minutos como el resto de la tienda. */
export const revalidate = 300

/**
 * Genera el HTML estático de cada producto visible por cada idioma PUBLICADO.
 * (El slug del producto aún no se localiza; el prefijo de idioma sí.)
 */
export async function generateStaticParams() {
  const { slugs } = await getPublicProductSlugs()
  const params: { locale: string; slug: string }[] = []
  for (const locale of publishedLocales()) {
    for (const slug of slugs) params.push({ locale, slug })
  }
  return params
}

/** Serializa el producto tipado del servicio a la forma mínima del cliente. */
function toDetailProduct(product: NonNullable<Awaited<ReturnType<typeof getPublicProductBySlug>>['product']>): DetailProduct {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price_usd: Number(product.price_usd),
    precio_original: product.precio_original ?? null,
    image_url: product.image_url ?? null,
    stock: Number(product.stock) || 0,
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
    weight_grams: product.weight_grams,
    featured: product.featured,
    is_available: product.is_available,
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
    // Valoraciones y opiniones reales (migración 0052).
    rating_average: product.rating_average ?? null,
    rating_count: product.rating_count ?? null,
    reviews: (product.reviews ?? []).map((r) => ({
      autor: r.autor,
      valoracion: r.valoracion,
      texto: r.texto,
      fecha: r.fecha,
    })),
  }
}

/** Serializa un producto a la forma de card (módulo de productos relacionados). */
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

/** Metadatos SEO dinámicos (title, description, OG, canonical, robots). */
export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params
  const [{ product }, { settings }] = await Promise.all([getPublicProductBySlug(slug, locale), getSiteSettings()])

  if (!product) {
    return { title: 'Producto no encontrado' }
  }

  const brandName = settings.company_name || 'ilumaX'
  // titulo_seo es el título SEO que configura el admin (migración 0042).
  const seoTitle = product.titulo_seo?.trim() || product.name
  const cleanDescription = clampText(htmlToPlainText(product.description), 300)
  const description = cleanDescription
    ? cleanDescription
    : `${product.name} — disponible en ${brandName}. Compra segura a través de nuestro enlace de afiliado.`

  const productUrl = absoluteUrl(buildLocalizedPath(`/productos/${product.slug}`, locale, { prefixDefaultLocale: false }))
  // hreflang: el slug del producto aún no se localiza, pero sí el prefijo de idioma.
  const alternatesByLocale = Object.fromEntries(
    publishedLocales().map((l) => [
      l,
      buildLocalizedPath(`/productos/${product.slug}`, l, { prefixDefaultLocale: false }),
    ]),
  )
  const image = product.images?.[0]?.url ?? product.image_url
  const categoryName = product.categories?.[0]?.name
  // indexado_google (migración 0042) controla la indexación real:
  // Default FALSE para no lanzar productos masivos sin revisión SEO.
  const indexable = product.indexado_google !== false

  const absoluteImage = image ? toAbsoluteUrl(image, absoluteUrl('/').slice(0, -1)) : undefined

  return {
    title: seoTitle,
    description,
    alternates: { canonical: productUrl, languages: buildLanguageAlternates(alternatesByLocale) },
    robots: indexable ? 'index, follow' : 'noindex, nofollow',
    category: categoryName ?? undefined,
    openGraph: {
      title: seoTitle,
      description,
      url: productUrl,
      // Nota: Next.js valida OpenGraph.type en runtime y SOLO acepta 'website'.
      // El og:type="product" (estándar OG) se emite como <meta> manual en el
      // JSX de la página (ver abajo), no vía esta API.
      type: 'website',
      siteName: brandName,
      ...(absoluteImage ? { images: [{ url: absoluteImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: seoTitle,
      description,
      ...(absoluteImage ? { images: [absoluteImage] } : {}),
    },
  }
}



/**
 * Página server de producto.
 * Consulta Supabase POR SLUG EXACTO a través de la capa /services
 * (nunca supabase.from en componentes) y serializa el schema JSON-LD
 * en el <head> ANTES de enviar el HTML al navegador.
 */
export default async function ProductDetailPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  const [{ product }, { settings }] = await Promise.all([getPublicProductBySlug(slug, locale), getSiteSettings()])

  // 404 real (status 404) si no existe o no está visible en el catálogo.
  if (!product) notFound()

  const detailProduct = toDetailProduct(product)
  const origin = absoluteUrl('/').replace(/\/+$/, '')
  const productUrl = absoluteUrl(buildLocalizedPath(`/productos/${product.slug}`, locale, { prefixDefaultLocale: false }))
  // Origen con prefijo de idioma para el JSON-LD (Product/Offer/Organization).
  const schemaOrigin = locale === DEFAULT_LOCALE ? origin : `${origin}/${locale}`

  // Enlazado interno (SEO): productos relacionados + navegación cross-categoría.
  // Todo se resuelve en servidor → HTML crawlable por Google.
  const [relatedResult, { items: navCategories }] = await Promise.all([
    getRelatedProducts({
      productId: product.id,
      categoryIds: (product.categories ?? []).map((c) => c.id),
      locale,
    }),
    getCategoryNav(undefined, locale),
  ])
  const related = (relatedResult.products ?? []).map(toCardProduct)

  const jsonLd = buildProductSchema({
    product: {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price_usd: Number(product.price_usd),
      precio_original: product.precio_original ?? null,
      stock: Number(product.stock) || 0,
      low_stock_threshold: Number(product.low_stock_threshold ?? 10),
      pricing_type: product.pricing_type === 'weight' ? 'weight' : 'unit',
      stock_grams: Number(product.stock_grams) || 0,
      image_url: product.image_url,
      url_afiliado_ali: product.url_afiliado_ali,
      url_afiliado_amazon: product.url_afiliado_amazon,
      url_afiliado_store: product.url_afiliado_store,
      specifications: product.specifications ?? {},
      peso: product.peso,
      tamaño: product.tamaño,
      weight_grams: product.weight_grams,
      sku: product.sku,
      categories: product.categories ?? [],
      marca: product.marca ?? null,
      images: product.images ?? [],
      // Valoraciones reales: habilitan el AggregateRating del schema.
      rating_average: product.rating_average ?? null,
      rating_count: product.rating_count ?? null,
    },
    origin: schemaOrigin,
    organization: { name: settings.company_name || 'ilumaX', url: schemaOrigin },
  })

  // BreadcrumbList: ruta jerárquica (Rich Results de Google).
  const primaryCategory = product.categories?.[0]
  const breadcrumbLd = buildBreadcrumbSchema([
    { name: 'Inicio', url: schemaOrigin },
    { name: 'Catálogo', url: absoluteUrl(buildLocalizedPath('/catalogo', locale, { prefixDefaultLocale: false })) },
    ...(primaryCategory
      ? [{
          name: primaryCategory.name,
          url: absoluteUrl(buildLocalizedPath('/categoria/' + primaryCategory.slug, locale, { prefixDefaultLocale: false })),
        }]
      : []),
    { name: product.name, url: productUrl },
  ])

  // FAQPage: solo si el producto trae FAQ estructurada (generada por la IA).
  const faqLd = buildFaqSchema(product.seo_faq)

  return (
    <>
      {/* og:type="product" (estándar Open Graph). Next.js no lo permite vía
          la API de metadata (solo 'website'), así que se emite como <meta>
          manual en servidor para que Facebook/Google lean el tipo correcto. */}
      <meta property="og:type" content="product" />

      {/* Inyección NATIVA en servidor: React 19 coloca <script> JSON-LD
          dentro del <head> del HTML crudo (SEO + Google Rich Results). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* BreadcrumbList (migas estructuradas). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* FAQPage (solo si hay FAQ real; nunca se emite vacío). */}
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}

      <ProductDetailPageView
        product={detailProduct}
        related={related}
        categories={navCategories}
        navLinks={settings.nav_links}
        brand={{
          name: settings.company_name || 'ilumaX',
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