import { Storefront } from '@/components/storefront'
import { getFeaturedProducts } from '@/services/catalog'
import { getOfficialExchangeRate } from '@/services/exchange-rate'

/**
 * Página de inicio.
 * Obtiene los 6 productos destacados (featured) desde Supabase,
 * la tasa oficial del dólar y los normaliza antes de pasárselos al Storefront.
 */
export default async function Home() {
  const [{ products }, { rate }] = await Promise.all([
    getFeaturedProducts(),
    getOfficialExchangeRate(),
  ])

  // Normaliza image_url (Supabase devuelve null) y garantiza que colors/specifications existan.
  const normalized = (products ?? []).map((p) => ({
    ...p,
    image_url: p.image_url ?? '',
    colors: p.colors ?? [],
    specifications: p.specifications ?? {},
  }))

  return <Storefront initialProducts={normalized} exchangeRate={rate} />
}
