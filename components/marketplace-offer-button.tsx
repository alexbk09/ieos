'use client'

import { ExternalLink } from 'lucide-react'
import { affiliateCtaKey, marketplaceForUrl } from '@/lib/affiliate'
import { AFFILIATE_LINK_REL } from '@/lib/constants'
import { trackAffiliateClick } from '@/lib/analytics-client'
import { useTranslations } from '@/hooks/use-translations'

/**
 * Átomo: CTA compacto de salida al MARKETPLACE de afiliado ("Ver Oferta en …").
 * ------------------------------------------------------------------
 * POR QUÉ existe: la misma acción aparece en varios puntos de la vitrina (ficha
 * del producto, tabla comparativa de una guía, rail de productos de la guía…).
 * Centralizarla garantiza que TODOS los accesos compartan el mismo color de
 * marca del destino (token --ali), el mismo `rel` de afiliado
 * (nofollow sponsored) y el mismo evento de analítica: un solo lugar que
 * mantener y cero desincronización entre superficies.
 *
 * Es UI pura: recibe la URL ya resuelta por el servidor y no consulta Supabase.
 */
export function MarketplaceOfferButton({
  url,
  productId,
  fullWidth = true,
}: {
  /** URL de afiliado (AliExpress / Amazon / tienda oficial). */
  url: string
  /** Id del producto: atribuye el clic en la analítica de conversión. */
  productId?: string
  /** Ocupa todo el ancho del contenedor (por defecto sí). */
  fullWidth?: boolean
}) {
  const t = useTranslations()
  // El texto y el color se derivan del destino REAL del enlace, no del rol.
  const market = marketplaceForUrl(url)
  // `flex w-full` (bloque) baja el botón a su propia línea cuando acompaña a un
  // título; `inline-flex` lo deja fluir en línea cuando se pide compacto.
  const displayClass = fullWidth ? 'flex w-full' : 'inline-flex'

  return (
    <a
      href={url}
      target="_blank"
      rel={AFFILIATE_LINK_REL}
      onClick={() => trackAffiliateClick(productId, url)}
      className={`mt-2 ${displayClass} items-center justify-center gap-1.5 rounded-full bg-ali px-3 py-2 text-[11px] font-semibold leading-tight text-ali-foreground shadow-sm shadow-orange-900/20 transition hover:bg-ali-hover active:scale-[0.99]`}
    >
      <ExternalLink size={13} className="shrink-0" />
      <span>{t(affiliateCtaKey(market.id))}</span>
    </a>
  )
}
