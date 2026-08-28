'use client'

import Image from 'next/image'
import { Plus } from 'lucide-react'
import { LOW_STOCK_ALERT } from '@/lib/constants'
import { formatBolivars, moneyUsd } from '@/lib/currency'

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
  /** Color seleccionado por el cliente al agregar desde el modal de detalle. */
  selected_color?: string
  peso?: string | null
  tamaño?: string | null
  specifications?: Record<string, string>
  category_id?: string | null
  featured?: boolean
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
        <span className={`absolute left-4 top-4 rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${product.stock < LOW_STOCK_ALERT ? 'bg-amber-100 text-amber-700' : 'bg-card/90 text-foreground'}`}>{product.stock} en stock</span>
      </button>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-brand-strong">{categoryFor(product)}</p>
            <h3 className="mt-1 font-medium">{product.name}</h3>
          </div>
          <button onClick={() => onAdd(product)} aria-label={`Agregar ${product.name}`} className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground transition hover:bg-navy hover:text-navy-foreground"><Plus size={17} /></button>
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
          {product.price_usd > 0 && (
            <div>
              <p className="font-semibold">{moneyUsd(product.price_usd)}</p>
              <p className="text-xs text-muted-foreground">{formatBolivars(product.price_usd, rate)}</p>
            </div>
          )}
          <button onClick={() => onViewDetails(product)} className="ml-auto text-xs text-muted-foreground underline underline-offset-4">Ver detalles</button>
        </div>
      </div>
    </article>
  )
}