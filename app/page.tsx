import { Storefront } from '@/components/storefront'
import { getFeaturedProducts } from '@/services/catalog'

/** ISR: la portada se sirve desde CDN y se revalida cada 5 min. */
export const revalidate = 300

/** Página de inicio con ISR. La tasa del dólar se obtiene en cliente (useExchangeRate) sin bloquear el render. */
export default async function Home() {
  const { products } = await getFeaturedProducts()

  // Normaliza image_url (Supabase devuelve null) y garantiza que colors/specifications existan.
  const normalized = (products ?? []).map((p) => ({
    ...p,
    image_url: p.image_url ?? '',
    colors: p.colors ?? [],
    specifications: p.specifications ?? {},
  }))

  return <Storefront initialProducts={normalized} />
}