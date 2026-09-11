'use client'

import { ArrowUpRight, ExternalLink, ShieldCheck, ShoppingBag } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { toast } from 'sonner'
import { moneyForProduct, formatBolivars } from '@/lib/currency'
import { formatWeight } from '@/lib/price-calculator'
import type { CartItem } from '@/hooks/use-cart'
import { marketplaceForUrl } from '@/lib/affiliate'
import { trackAffiliateClick } from '@/lib/analytics-client'
import { useTranslations } from '@/hooks/use-translations'

/**
 * Modal de confirmación de compra segura para afiliados.
 *
 * Se muestra cuando el navegador bloquea los pop-ups múltiples (bandera
 * popupsBlocked de useCart) o cuando el usuario decide revisar una por una.
 * Cada ítem tiene un botón con clic DIRECTO (window.open en el propio
 * gesto) por lo que el bloqueador de pop-ups del navegador nunca lo detiene.
 *
 * El modal NO recoge direcciones físicas ni datos de pago: la compra
 * se cierra en AliExpress/Amazon vía el enlace de afiliado del producto.
 */
export function AffiliateRedirectModal({ open, items, rate, onClose, onClearCheckout }: {
  open: boolean
  items: CartItem[]
  rate: number
  onClose: () => void
  /** Limpia el carrito tras confirmar que el cliente fue redirigido. */
  onClearCheckout: () => void
}) {
  // Traductor de la interfaz (idioma activo de la página).
  const t = useTranslations()

  /** Abre una URL de afiliado en pestaña nueva (gesto directo = nunca bloqueado). */
  function openAffiliate(item: CartItem) {
    const url = bestUrl(item)
    if (!url) {
      toast.error(t('cart.toastNoLink'))
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    // Analítica: registro del clic real de salida al marketplace de afiliado.
    trackAffiliateClick(item.id, url)
    toast.success(t('cart.toastOpening'))
  }

  /** Limpia la selección y cierra el modal (el cliente ya fue a los marketplaces). */
  function handleDone() {
    onClearCheckout()
    onClose()
    toast.success(t('cart.toastThanks'))
  }

  /** Precio por línea visible dentro del modal (peso o unidad). */
  function lineAmount(item: CartItem): number {
    const isWeight = item.pricing_type === 'weight'
    if (isWeight) {
      const perGram = Number(item.price_per_gram_usd) || 0
      const grams = item.weight_grams ?? item.quantity
      return grams * perGram
    }
    return item.price_usd * item.quantity
  }

  /** Etiqueta de cantidad (gramos/kilos o unidades). */
  function qtyLabel(item: CartItem): string {
    if (item.pricing_type === 'weight') return formatWeight(item.weight_grams ?? item.quantity)
    return `${item.quantity} ${item.unit_label || 'u'}`
  }

  /** Devuelve la mejor URL del ítem (AliExpress → Amazon → store). */
  function bestUrl(item: CartItem): string | null {
    return item.url_afiliado_ali ?? item.url_afiliado_amazon ?? item.url_afiliado_store ?? null
  }

  const countLinks = items.filter((i) => bestUrl(i)).length
  const withoutLinks = items.length - countLinks

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('cart.secureTitle')}
      description={t('cart.secureDesc')}
      icon={<ShieldCheck size={18} />}
      preventBackdropClose
      footer={
        <>
          <button
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
          >
            {t('cart.reviewLater')}
          </button>
          <button
            onClick={handleDone}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-strong"
          >
            {t('cart.doneBuying')} <ArrowUpRight size={15} />
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        {withoutLinks > 0 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400">
            {withoutLinks === 1
              ? t('cart.withoutLinksOne', { count: withoutLinks })
              : t('cart.withoutLinksMany', { count: withoutLinks })}
          </p>
        )}

        {items.length === 0 ? (
          <div className="grid place-items-center gap-3 py-10 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-muted"><ShoppingBag size={24} className="text-muted-foreground" /></div>
            <p className="text-sm text-muted-foreground">{t('cart.emptySelection')}</p>
          </div>
        ) : (
          items.map((item) => {
            const url = bestUrl(item)
            const market = marketplaceForUrl(url)
            return (
              <div key={item.cartItemId} className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
                {(() => {
                  const colorImage = item.color_name
                    ? (item.images ?? []).find((img) => img.color_name === item.color_name)?.url
                    : undefined
                  const displayImage = colorImage ?? item.image_url
                  return displayImage
                    ? <img src={displayImage} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                    : <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">{t('product.noImage')}</div>
                })()}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      {item.color_name && <p className="text-xs text-brand-strong">🎨 {item.color_name}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${market.chipClassName}`}>
                      {market.shortLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {qtyLabel(item)} · {moneyForProduct(lineAmount(item), Boolean(item.url_afiliado_ali || item.url_afiliado_amazon || item.url_afiliado_store))} · {formatBolivars(lineAmount(item), rate)} <span className="opacity-60">{t('cart.ref')}</span>
                  </p>
                </div>
                <button
                  onClick={() => openAffiliate(item)}
                  disabled={!url}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-xs font-semibold text-navy-foreground transition hover:bg-brand hover:text-brand-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ExternalLink size={13} /> {t('cart.goBuy')}
                </button>
              </div>
            )
          })
        )}

        <p className="mt-1 text-center text-xs text-muted-foreground">
          {t('cart.goBuyNote')}
        </p>
      </div>
    </Modal>
  )
}