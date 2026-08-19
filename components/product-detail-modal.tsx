'use client'

import { X } from 'lucide-react'
import { ProductCarousel } from '@/components/product-carousel'
import { categoryFor, type CardProduct } from '@/components/product-card'
import { formatBolivars, moneyUsd, formatRate } from '@/lib/currency'

/**
 * Modal de detalle de producto.
 * Visual ampliado: galería de imágenes, especificaciones, colores, stock
 * y precio en USD + Bs (con la tasa oficial del día).
 */
export function ProductDetailModal({ product, rate, onClose, onAdd }: {
  product: CardProduct
  rate: number
  onClose: () => void
  onAdd: (product: CardProduct) => void
}) {
  const gallery = (product.images?.length ? product.images : [{ url: product.image_url }]).filter((img) => img.url)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-blue-950/60 p-5 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative grid max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl bg-white dark:bg-slate-900 md:grid-cols-2">
        <button onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 z-20 grid size-10 place-items-center rounded-full bg-white/90 text-blue-950 shadow"><X size={19} /></button>

        <div className="min-h-72">
          <ProductCarousel images={gallery} alt={product.name} className="h-full min-h-72 w-full md:rounded-l-3xl" />
        </div>

        <div className="flex flex-col p-7 md:p-10">
          <p className="font-mono text-xs uppercase tracking-widest text-cyan-600">{categoryFor(product)}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-.05em] md:text-4xl">{product.name}</h2>
          <p className="mt-4 text-sm leading-7 text-slate-500 dark:text-slate-300 md:text-base">{product.description}</p>

          {product.colors?.length ? (
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400">Colores</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.colors.map((color) => (
                  <span key={color} className="rounded-full border border-slate-200 px-3 py-1 text-xs dark:border-slate-700">{color}</span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">Especificaciones</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {Object.entries(product.specifications ?? {}).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                  <p className="font-mono text-[10px] uppercase text-slate-400">{key}</p>
                  <p className="mt-1 text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-semibold">{moneyUsd(product.price_usd)}</p>
                <p className="mt-1 text-base text-slate-500">{formatBolivars(product.price_usd, rate)} <span className="text-xs text-slate-400">· tasa {formatRate(rate)}</span></p>
              </div>
              <span className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${product.stock < 20 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{product.stock} disponibles</span>
            </div>
            <button onClick={() => { onAdd(product); onClose() }} className="mt-6 w-full rounded-full bg-blue-950 px-5 py-3.5 text-sm font-medium text-white transition hover:bg-cyan-500 hover:text-blue-950">Agregar a solicitud</button>
          </div>
        </div>
      </div>
    </div>
  )
}