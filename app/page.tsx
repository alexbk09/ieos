import { Storefront, type StorefrontSettings } from '@/components/storefront'
import { getFeaturedProducts } from '@/services/catalog'
import { getSiteSettings } from '@/services/site-settings'

/** ISR: la portada se sirve desde CDN y se revalida cada 5 min. */
export const revalidate = 300

/** Página de inicio con ISR. La tasa del dólar se obtiene en cliente (useExchangeRate) sin bloquear el render. */
export default async function Home() {
  const [{ products }, { settings }] = await Promise.all([
    getFeaturedProducts(),
    getSiteSettings(),
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
    map: { lat: settings.map_lat, lng: settings.map_lng, zoom: settings.map_zoom },
    homepageConfig: settings.homepage_config,
  }

  return <Storefront initialProducts={normalized} settings={storefrontSettings} />
}
