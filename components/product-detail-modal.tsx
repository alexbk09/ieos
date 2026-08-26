'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { ProductCarousel } from '@/components/product-carousel'
import { categoryFor, colorImagesFor, type CardProduct } from '@/components/product-card'
import { formatBolivars, moneyUsd, formatRate } from '@/lib/currency'

/**
 * Modal de detalle de producto.
 * Visual ampliado: galería de imágenes, colores clicables (cada color
 * puede tener su propia imagen), peso, tamaño, especificaciones, stock
 * y precio en USD + Bs (con la tasa oficial del día).
 */
export function ProductDetailModal({ product, rate, onClose, onAdd }: {
  product: CardProduct
  rate: number
  onClose: () => void
  onAdd: (product: CardProduct) => void
}) {
  // Imágenes generales (sin color) y mapa de imagen por color
  const generalImages = (product.images ?? []).filter((img) => !img.color_name)
  const imageByColor = colorImagesFor(product)

  // Galería por defecto: imágenes generales o imagen principal
  const defaultGallery = (generalImages.length ? generalImages : [{ url: product.image_url }]).filter((img) => img.url)

  // Estado del color seleccionado (null = galería general)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)

  // Galería activa: si hay color seleccionado con imagen, se muestra esa imagen
  const gallery = selectedColor && imageByColor.has(selectedColor)
    ? [{ url: imageByColor.get(selectedColor)! }]
    : defaultGallery

  const colors = product.colors ?? []

  /** Datos de la ficha técnica (peso y tamaño) solo si existen. */
  const details = [
    product.peso ? { label: 'Peso', value: product.peso } : null,
    product.tamaño ? { label: 'Tamaño', value: product.tamaño } : null,
  ].filter(Boolean) as { label: string; value: string }[]

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

          {/* Colores clicables: cada color cambia la imagen si tiene la suya */}
          {colors.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
                Colores {selectedColor && <span className="text-cyan-600">· {selectedColor}</span>}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {colors.map((color) => {
                  const image = imageByColor.get(color)
                  const active = selectedColor === color
                  return (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(active ? null : color)}
                      title={color}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition ${
                        active
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 text-slate-600 hover:border-cyan-400 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {image ? (
                        <img src={image} alt={color} className="size-5 rounded-full object-cover" />
                      ) : (
                        <span className="size-5 rounded-full bg-cyan-500/20" />
                      )}
                      {color}
                    </button>
                  )
                })}
              </div>
              {selectedColor && !imageByColor.has(selectedColor) && (
                <p className="mt-1.5 text-xs text-slate-400">La imagen general se mantiene para este color.</p>
              )}
            </div>
          )}

          {/* Ficha técnica con peso y tamaño (solo si existen) */}
          {details.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-widest text-slate-400">Ficha técnica</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {details.map((d) => (
                  <div key={d.label} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="font-mono text-[10px] uppercase text-slate-400">{d.label}</p>
                    <p className="mt-1 text-sm font-medium">{d.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Especificaciones adicionales */}
          {Object.keys(product.specifications ?? {}).length > 0 && (
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
          )}

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