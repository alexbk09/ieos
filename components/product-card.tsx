'use client'

import Image from 'next/image'
import { Plus } from 'lucide-react'
import { LOW_STOCK_ALERT } from '@/lib/constants'
import { formatBolivars, moneyUsd } from '@/lib/currency'
import { formatWeight } from '@/lib/price-calculator'

/** Tipo mínimo de producto que recibe la card. */
export type CardProduct = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  image_url: string
  colors?: string[]
  peso?: string | null
  tamaño?: string | null
  specifications?: Record<string, string>
  category_id?: string | null
  featured?: boolean
  /** Tipo de precio: 'unit' (por unidad) o 'weight' (por peso). */
  pricing_type?: 'unit' | 'weight'
  /** Precio por gramo (solo si pricing_type = 'weight'). */
  price_per_gram_usd?: number
  /** Precio por kilo (solo si pricing_type = 'weight'). */
  price_per_kilo_usd?: number
  /** Stock en gramos (solo si pricing_type = 'weight'). */
  stock_grams?: number
  /** Peso mínimo de compra en gramos (solo si pricing_type = 'weight'). */
  min_order_grams?: number
  /** Etiqueta de unidad (u, g, kg…). */
  unit_label?: string
  /** Descuento por mayoreo (%) mostrado como incentivo. */
  bulk_discount_percent?: number
  /** Umbral de stock bajo (configurable). */
  low_stock_threshold?: number
  /** Peso en gramos de una unidad (ficha técnica). */
  weight_grams?: number | null
  categories?: { id: string; name: string; slug: string; description: string | null }[]
  images?: { id: string; url: string; alt_text: string | null; sort_order: number; color_name?: string | null }[]
}

/** Devuelve las imágenes por color: { nombreColor: url } y la lista de colores con imagen. */
export function colorImagesFor(product: CardProduct) {
  const map = new Map<string, string>()
  for (const img of product.images ?? []) {
    if (img.color_name && img.url) map.set(img.color_name, img.url)
  }
  return map
}

/** Devuelve la categoría visible de un producto. */
export const categoryFor = (p: CardProduct) => p.categories?.[0]?.name ?? 'General'

/** Formatea el precio de un producto por peso: "$X.XX /g · $Y /kg". */
function priceLabel(product: CardProduct) {
  const isWeight = product.pricing_type === 'weight'
  if (isWeight) {
    const perGram = Number(product.price_per_gram_usd ?? 0)
    const perKilo = Number(product.price_per_kilo_usd ?? 0)
    if (perGram > 0) return `${moneyUsd(perGram)} /g`
    if (perKilo > 0) return `${moneyUsd(perKilo)} /kg`
  }
  return moneyUsd(product.price_usd)
}

/** Devuelve el stock visible de un producto (gramos o unidades). */
function stockLabel(product: CardProduct) {
  const isWeight = product.pricing_type === 'weight'
  if (isWeight) return `${formatWeight(product.stock_grams ?? 0)} disponibles`
  const unit = product.unit_label || 'u'
  return `${product.stock} ${unit} en stock`
}

/** Es stock bajo (unidad: umbral configurable o LOW_STOCK_ALERT; peso: < 10 mínimos). */
function isLowStock(product: CardProduct) {
  if (product.pricing_type === 'weight') {
    const min = Number(product.min_order_grams) || 0
    return min > 0 && Number(product.stock_grams) < min * 10
  }
  const threshold = product.low_stock_threshold ?? LOW_STOCK_ALERT
  return product.stock < threshold
}

/**
 * Card de producto reutilizable.
 * Se usa en el inicio (Storefront) y en el catálogo completo (CatalogView).
 * Incluye el botón "+" para agregar al carrito y el enlace "Ver detalles".
 */
export function ProductCard({ product, rate, onAdd, onViewDetails }: {
  product: CardProduct
  rate: number
  onAdd: (product: CardProduct) => void
  onViewDetails: (product: CardProduct) => void
}) {
  const image = product.images?.[0]?.url ?? product.image_url

  return (
    <article className="group overflow-hidden rounded-3xl border border-border bg-card">
      <button onClick={() => onViewDetails(product)} aria-label={`Ver detalles de ${product.name}`} className="relative block w-full overflow-hidden bg-muted">
        {image ? (
          <Image src={image} alt={product.name} width={400} height={440} loading="lazy" className="aspect-[1.1] w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <div className="grid aspect-[1.1] w-full place-items-center bg-muted text-muted-foreground">Sin imagen</div>
        )}
        <span className={`absolute left-4 top-4 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${isLowStock(product) ? 'bg-amber-100 text-amber-700' : 'bg-card/90 text-foreground'}`}>{stockLabel(product)}</span>
        {Number(product.bulk_discount_percent ?? 0) > 0 && (
          <span className="absolute right-4 top-4 rounded-full bg-emerald-500/90 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-white">
            -{product.bulk_discount_percent}% mayoreo
          </span>
        )}
      </button>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-brand-strong">{categoryFor(product)}</p>
            <h3 className="mt-1 font-medium">{product.name}</h3>
          </div>
          <button
            onClick={() => (product.colors && product.colors.length > 0 ? onViewDetails(product) : onAdd(product))}
            aria-label={`Agregar ${product.name}`}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground transition hover:bg-navy hover:text-navy-foreground"
          >
            <Plus size={17} />
          </button>
        </div>
        {product.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>}

        {/* Colores disponibles con miniaturas (solo si existen) */}
        {product.colors && product.colors.length > 0 && (
          <div className="mt-3 flex items-center flex-wrap gap-2">
            {product.colors.map((color, i) => {
              const image = colorImagesFor(product).get(color)
              return (
                <span
                  key={`${color}-${i}`}
                  title={color}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-2.5 text-[11px] text-muted-foreground"
                >
                  {image ? (
                    <img src={image} alt={color} className="size-4 rounded-full object-cover" />
                  ) : (
                    <span className="size-4 rounded-full bg-brand/20" />
                  )}
                  {color}
                </span>
              )
            })}
          </div>
        )}

        {/* Peso y tamaño (solo si existen) */}
        {(product.peso || product.tamaño) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {product.peso && (
            <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                ⚖ {product.peso}
              </span>
            )}
            {product.tamaño && (
              <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                📐 {product.tamaño}
              </span>
            )}
          </div>
        )}

        <div className="mt-5 flex items-end justify-between">
          <div>
            {/* Precio según tipo (por unidad o por gramo/kilo) */}
            <p className="font-semibold">{priceLabel(product)}</p>
            <p className="text-xs text-muted-foreground">{formatBolivars(product.price_usd, rate)}</p>
          </div>
          <button onClick={() => onViewDetails(product)} className="text-xs text-muted-foreground underline underline-offset-4">Ver detalles</button>
        </div>
      </div>
    </article>
  )
}