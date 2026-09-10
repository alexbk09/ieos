import type { Metadata } from 'next'
import { Storefront, type StorefrontSettings } from '@/components/storefront'
import { getFeaturedProducts, getCategoryNav } from '@/services/catalog'
import { getSiteSettings } from '@/services/site-settings'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { normalizeHomepageConfig } from '@/lib/homepage-config'

/** ISR: la portada se sirve desde CDN y se revalida cada 5 min. */
export const revalidate = 300

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
  const { settings } = await getSiteSettings()
  const name = settings.company_name || 'ilumaX'
  const tagline = settings.tagline || 'Arquitectura de luz'
  const description =
    settings.hero_texts?.description ??
    `Soluciones LED y revestimientos que convierten espacios en experiencias memorables.`

  return buildPageMetadata({
    title: `${name} — ${tagline}`,
    description,
    path: buildLocalizedPath('/', locale, { prefixDefaultLocale: false }),
    siteName: name,
    alternatesByLocale: portadaPathsByLocale(),
  })
}

/**
 * Página de inicio con ISR. La tasa del dólar se obtiene en cliente (useExchangeRate) sin bloquear el render.
 * Inyecta JSON-LD (Organization, WebSite+SearchAction, ItemList y FAQPage si el admin configuró FAQs)
 * para que Google entienda la estructura de la tienda de afiliados.
 */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const [{ products }, { settings }, { items: activeCategories }] = await Promise.all([
    getFeaturedProducts(),
    getSiteSettings(),
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

  const name = settings.company_name || 'ilumaX'
  const tagline = settings.tagline || 'Arquitectura de luz'
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

  // ItemList JSON-LD: lista los productos destacados (mejora el rich snippet).
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

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name,
      url: origin,
      description: settings.hero_texts?.description ?? tagline,
      ...(settings.logo_url ? { logo: settings.logo_url } : {}),
      ...(settings.email ? { email: settings.email } : {}),
      ...(settings.address ? { address: { '@type': 'PostalAddress', streetAddress: settings.address } } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name,
      url: origin,
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${origin}/catalogo?q={search_term_string}` },
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
