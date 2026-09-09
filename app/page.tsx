import type { Metadata } from 'next'
import { Storefront, type StorefrontSettings } from '@/components/storefront'
import { getFeaturedProducts, getCategoriesActivas } from '@/services/catalog'
import { getSiteSettings } from '@/services/site-settings'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { normalizeHomepageConfig } from '@/lib/homepage-config'

/** ISR: la portada se sirve desde CDN y se revalida cada 5 min. */
export const revalidate = 300

/**
 * Metadata SEO de la portada (Fase 1).
 * Antes la home heredaba el <title> genérico del layout raíz. Ahora emite
 * title/description/canonical/OG/twitter propios con la marca real.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSiteSettings()
  const name = settings.company_name || 'ilumaX'
  const tagline = settings.tagline || 'Arquitectura de luz'
  const description =
    settings.hero_texts?.description ??
    `Soluciones LED y revestimientos que convierten espacios en experiencias memorables.`

  return buildPageMetadata({
    title: `${name} — ${tagline}`,
    description,
    path: '/',
    siteName: name,
  })
}

/**
 * Página de inicio con ISR. La tasa del dólar se obtiene en cliente (useExchangeRate) sin bloquear el render.
 * Inyecta JSON-LD (Organization, WebSite+SearchAction, ItemList y FAQPage si el admin configuró FAQs)
 * para que Google entienda la estructura de la tienda de afiliados.
 */
export default async function Home() {
  const [{ products }, { settings }, { data: activeCategories }] = await Promise.all([
    getFeaturedProducts(),
    getSiteSettings(),
    getCategoriesActivas(),
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
          url: absoluteUrl(`/productos/${p.slug}`),
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
