import type { Metadata } from 'next'
import { Storefront, type StorefrontSettings } from '@/components/storefront'
import { getHomeProducts, getCategoryNav } from '@/services/catalog'
import { getSiteSettings } from '@/services/site-settings'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl, absoluteAssetUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { normalizeHomepageConfig } from '@/lib/homepage-config'
import { OG_IMAGE_PATH } from '@/lib/constants'
import { createTranslator, MESSAGES } from '@/lib/i18n-messages'

/** ISR: la portada se sirve desde CDN y se revalida cada 5 min. */
export const revalidate = 86400

/**
 * Rutas de la portada para cada idioma PUBLICADO.
 * Criterio "as-needed": el idioma por defecto (es) va SIN prefijo (las URLs
 * actuales del sitio NO cambian); el resto va con prefijo (/fr).
 */
function portadaPathsByLocale(): Record<string, string> {
  return Object.fromEntries(
    publishedLocales().map((locale) => [locale, buildLocalizedPath('/', locale, { prefixDefaultLocale: false })]),
  )
}

/** Genera el HTML estático de la portada por cada idioma publicado. */
export function generateStaticParams() {
  return publishedLocales().map((locale) => ({ locale }))
}

/**
 * Metadata SEO de la portada: title/description/canonical/OG + hreflang
 * (alternates.languages) por cada idioma publicado.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const { settings } = await getSiteSettings(locale)
  const name = settings.company_name || 'zonadehobbies'
  const t = createTranslator(MESSAGES, locale)
  // SEO de la portada DESDE EL DICCIONARIO del idioma (cero textos quemados):
  // la keyword principal manda el ranking y la marca cierra. La descripción
  // prefiere el texto editable del panel (`site_settings.hero_texts`), que ya
  // llega traducido al idioma activo; si no existe, usa la del diccionario.
  const title = t('seo.homeTitle', { name })
  const description = settings.hero_texts?.description || t('seo.homeDescription', { name })

  return buildPageMetadata({
    title,
    description,
    path: buildLocalizedPath('/', locale, { prefixDefaultLocale: false }),
    // Imagen social (og:image/twitter:image): sin ella, compartir la home muestra un hueco.
    image: absoluteUrl(OG_IMAGE_PATH),
    siteName: name,
    alternatesByLocale: portadaPathsByLocale(),
  })
}

/**
 * Página de inicio con ISR. La tasa del dólar se obtiene en cliente (useExchangeRate) sin bloquear el render.
 * La grilla de productos llega con la semilla determinista del servidor y el
 * cliente la rota aleatoriamente en cada visita (ver useHomeRandomProducts).
 * Inyecta JSON-LD (Organization, WebSite+SearchAction, ItemList y FAQPage si el admin configuró FAQs)
 * para que Google entienda la estructura de la tienda de afiliados.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const [{ products }, { settings }, { items: activeCategories }] = await Promise.all([
    // Semilla DETERMINISTA de la grilla del inicio (destacados → curaduría →
    // novedad): mantiene la home cacheada en CDN (ISR) y sin saltos de layout.
    // El cliente la sustituye después por una muestra aleatoria nueva en cada
    // visita vía /api/home-products (el HTML de este render sigue siendo la
    // versión indexable y la que ve el usuario sin JavaScript).
    getHomeProducts(locale),
    getSiteSettings(locale),
    // Solo categorías CON productos: evita que el cliente caiga en páginas vacías.
    // Se pasa el idioma para servir el nombre del nicho traducido (con fallback).
    getCategoryNav(100, locale),
  ])

  // Normaliza image_url (Supabase devuelve null) y garantiza que colors/specifications existan.
  const normalized = (products ?? []).map((p) => ({
    ...p,
    image_url: p.image_url ?? '',
    colors: p.colors ?? [],
    specifications: p.specifications ?? {},
  }))

  // Configuración dinámica del sitio para la portada.
  const storefrontSettings: Partial<StorefrontSettings> = {
    navLinks: settings.nav_links,
    brand: {
      name: settings.company_name,
      tagline: settings.tagline,
      logoUrl: settings.logo_url,
      iconUrl: settings.icon_url,
      whatsapp: settings.whatsapp_number,
      address: settings.address,
      email: settings.email,
    },
    hero: settings.hero_texts,
    heroImage: settings.hero_images?.main ?? '',
    studio: settings.studio_texts,
    contact: settings.contact_texts,
    footer: settings.footer_texts,
    social: settings.social_links,
    homepageConfig: settings.homepage_config,
  }

  const name = settings.company_name || 'zonadehobbies'
  const tagline = settings.tagline || name
  const origin = absoluteUrl('/')
  const homepageConfig = normalizeHomepageConfig(settings.homepage_config ?? {})

  // FAQPage JSON-LD: se genera SOLO si el admin agregó un segmento de tipo 'faq'.
  const faqSegment = homepageConfig.segments.find((s) => s.type === 'faq' && s.enabled && s.faqItems && s.faqItems.length > 0)
  const faqJsonLd = faqSegment
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqSegment.faqItems!.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      }
    : null

  // ItemList JSON-LD: lista la selección del inicio (mejora el rich snippet).
  // Coincide con el HTML servido por SSR/ISR (la rotación aleatoria es cliente).
  const itemListJsonLd = normalized.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: normalized.slice(0, 10).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.name,
          url: absoluteUrl(buildLocalizedPath(`/productos/${p.slug}`, locale, { prefixDefaultLocale: false })),
        })),
      }
    : null

  // sameAs (redes reales) + logo absoluto: refuerzan E-E-A-T y el knowledge panel.
  const sameAs = [settings.social_links?.instagram, settings.social_links?.linkedin]
    .map((value) => (value ?? '').trim())
    .filter((value) => value.length > 0)
  const logoAsset = absoluteAssetUrl(settings.logo_url || settings.icon_url || '')

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name,
      url: origin,
      description: settings.hero_texts?.description ?? tagline,
      ...(logoAsset ? { logo: logoAsset, image: logoAsset } : {}),
      ...(settings.email ? { email: settings.email } : {}),
      ...(settings.address ? { address: { '@type': 'PostalAddress', streetAddress: settings.address } } : {}),
      ...(sameAs.length > 0 ? { sameAs } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name,
      url: origin,
      potentialAction: {
        '@type': 'SearchAction',
        // El parámetro debe ser 'search' (el que entiende /api/catalog): con 'q'
        // la caja de búsqueda de Google no devolvía resultados.
        target: { '@type': 'EntryPoint', urlTemplate: `${origin}/catalogo?search={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
    ...(itemListJsonLd ? [itemListJsonLd] : []),
    ...(faqJsonLd ? [faqJsonLd] : []),
  ]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Storefront
        initialProducts={normalized}
        settings={storefrontSettings}
        categories={(activeCategories ?? []) as { id: string; name: string; slug: string; description?: string | null }[]}
      />
    </>
  )
}
