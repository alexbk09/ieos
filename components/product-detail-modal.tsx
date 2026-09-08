'use client'

import { useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { ProductCarousel } from '@/components/product-carousel'
import { categoryFor, colorImagesFor, type CardProduct } from '@/components/product-card'
import { formatBolivars, moneyUsd, formatRate } from '@/lib/currency'
import { toGrams, formatWeight } from '@/lib/price-calculator'

/**
 * Modal de detalle de producto.
 * Visual ampliado: galería de imágenes, colores clicables (cada color
 * puede tener su propia imagen), peso, tamaño, especificaciones, stock
 * y precio en USD + Bs (con la tasa oficial del día).
 *
 * Para productos por PESO (pricing_type = 'weight'):
 *  - Selector moderno de unidad: gramos (g) o kilos (kg).
 *  - Input de cantidad con stepper (+/-) que respeta el mínimo y el stock.
 *  - Calcula el total de la línea: gramos × precio/gramo.
 */
export function ProductDetailModal({ product, rate, onClose, onAdd }: {
  product: CardProduct
  rate: number
  onClose: () => void
  onAdd: (product: CardProduct, unit?: string, quantity?: number, colorName?: string) => void
}) {
  // Imágenes generales (sin color) y mapa de imagen por color
  const generalImages = (product.images ?? []).filter((img) => !img.color_name)
  const imageByColor = colorImagesFor(product)

  // Galería por defecto: imágenes generales o imagen principal
  const defaultGallery = (generalImages.length ? generalImages : [{ url: product.image_url }]).filter((img) => img.url)

  // Estado del color seleccionado (null = galería general)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)

  // Para productos por peso: unidad (g/kg) y cantidad
  const isWeight = product.pricing_type === 'weight'
  const [unit, setUnit] = useState<'g' | 'kg'>('g')
  const [weightValue, setWeightValue] = useState(() => {
    const min = Number(product.min_order_grams) || 0
    return Math.max(min, 100) // mínimo: 100g o el mínimo del producto
  })
  const [unitQty, setUnitQty] = useState(1)

  // Galería activa: si hay color seleccionado con imagen, se muestra esa imagen
  const gallery = selectedColor && imageByColor.has(selectedColor)
    ? [{ url: imageByColor.get(selectedColor)! }]
    : defaultGallery

  const colors = product.colors ?? []

  // Datos de la ficha técnica (peso y tamaño) solo si existen
  const details = [
    product.peso ? { label: 'Peso', value: product.peso } : null,
    product.tamaño ? { label: 'Tamaño', value: product.tamaño } : null,
    product.weight_grams != null ? { label: 'Peso unitario', value: `${product.weight_grams} g` } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  // ---- Cálculo para productos por PESO ----
  const grams = toGrams(weightValue, unit)
  const perGramPrice = Number(product.price_per_gram_usd) || 0
  const weightLineTotal = grams * perGramPrice
  const maxGrams = Number(product.stock_grams) || 0
  const minGrams = Number(product.min_order_grams) || 0

  // Total de la línea (peso) o precio unitario × cantidad (unidad)
  const displayPrice = isWeight ? weightLineTotal : product.price_usd * unitQty
  const displayPricePerLine = isWeight ? perGramPrice * grams : product.price_usd

  /** Incrementa/decrementa el peso en pasos de 100g (o el mínimo). */
  function stepWeight(delta: number) {
    const step = Math.max(minGrams, 100)
    const next = Math.min(Math.max(grams + step * delta, minGrams), maxGrams)
    setWeightValue(unit === 'kg' ? next / 1000 : next)
  }

  /** Llama a onAdd con la unidad, cantidad y color seleccionado. */
  function handleAdd() {
    const colorName = selectedColor ?? undefined
    if (isWeight) {
      onAdd(product, unit, weightValue, colorName) // el carrito normaliza a gramos
    } else {
      onAdd(product, 'u', unitQty, colorName)
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/60 p-5 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative grid max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl bg-card md:grid-cols-2">
        <button onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 z-20 grid size-10 place-items-center rounded-full bg-card/90 text-foreground shadow"><X size={19} /></button>

        <div className="min-h-72">
          <ProductCarousel images={gallery} alt={product.name} className="h-full min-h-72 w-full md:rounded-l-3xl" />
        </div>

        <div className="flex flex-col p-7 md:p-10">
          <p className="font-mono text-xs uppercase tracking-widest text-brand-strong">{categoryFor(product)}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-.05em] md:text-4xl">{product.name}</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground md:text-base">{product.description}</p>

          {/* Colores clicables: cada color cambia la imagen si tiene la suya */}
          {colors.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Colores {selectedColor && <span className="text-brand-strong">· {selectedColor}</span>}
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
                          ? 'border-brand bg-brand/10 text-brand-strong'
                          : 'border-border text-muted-foreground hover:border-brand'
                      }`}
                    >
                      {image ? (
                        <img src={image} alt={color} className="size-5 rounded-full object-cover" />
                      ) : (
                        <span className="size-5 rounded-full bg-brand/20" />
                      )}
                      {color}
                    </button>
                  )
                })}
              </div>
              {selectedColor && !imageByColor.has(selectedColor) && (
                <p className="mt-1.5 text-xs text-muted-foreground">La imagen general se mantiene para este color.</p>
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

          {/* Selector de cantidad: PESO (g/kg) o UNIDAD */}
          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {isWeight ? 'Cantidad (peso)' : 'Cantidad'}
            </p>

            {isWeight ? (
              <div className="mt-3 grid gap-3">
                {/* Selector de unidad: g / kg */}
                <div className="flex rounded-full border border-border p-1">
                  {(['g', 'kg'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnit(u)}
                      className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
                        unit === u
                          ? 'bg-brand text-brand-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {u === 'g' ? 'Gramos (g)' : 'Kilos (kg)'}
                    </button>
                  ))}
                </div>

                {/* Stepper de peso */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-2">
                  <button
                    onClick={() => stepWeight(-1)}
                    aria-label="Reducir peso"
                    className="grid size-9 shrink-0 place-items-center rounded-lg border border-border transition hover:bg-muted disabled:opacity-40"
                    disabled={grams <= minGrams}
                  >
                    <Minus size={15} />
                  </button>
                  <div className="flex items-center gap-2 flex-1 justify-center">
                    <input
                      type="number"
                      min={unit === 'kg' ? minGrams / 1000 : minGrams}
                      max={unit === 'kg' ? maxGrams / 1000 : maxGrams}
                      step={unit === 'kg' ? 0.1 : 100}
                      value={unit === 'kg' ? (weightValue / 1000) : weightValue}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        if (!Number.isFinite(v) || v <= 0) return
                        setWeightValue(unit === 'kg' ? v * 1000 : v)
                      }}
                      className="w-24 rounded-lg border border-input bg-transparent px-3 py-2 text-center text-lg font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                    />
                    <span className="text-sm font-medium text-muted-foreground">{unit}</span>
                  </div>
                  <button
                    onClick={() => stepWeight(1)}
                    aria-label="Aumentar peso"
                    className="grid size-9 shrink-0 place-items-center rounded-lg border border-border transition hover:bg-muted disabled:opacity-40"
                    disabled={grams >= maxGrams}
                  >
                    <Plus size={15} />
                  </button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Mínimo: {formatWeight(minGrams)} · Disponible: {formatWeight(maxGrams)}
                </p>
                {minGrams > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Precio: {moneyUsd(perGramPrice)}/g = {moneyUsd(perGramPrice * 1000)}/kg
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-2">
                <button
                  onClick={() => setUnitQty(Math.max(1, unitQty - 1))}
                  aria-label="Reducir cantidad"
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-border transition hover:bg-muted disabled:opacity-40"
                  disabled={unitQty <= 1}
                >
                  <Minus size={15} />
                </button>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-center text-lg font-bold">{unitQty}</span>
                  <span className="text-sm text-muted-foreground">{product.unit_label || 'u'}</span>
                </div>
                <button
                  onClick={() => setUnitQty(Math.min(product.stock, unitQty + 1))}
                  aria-label="Aumentar cantidad"
                  className="grid size-9 shrink-0 place-items-center rounded-lg border border-border transition hover:bg-muted disabled:opacity-40"
                  disabled={unitQty >= product.stock}
                >
                  <Plus size={15} />
                </button>
              </div>
            )}
          </div>

          <div className="mt-auto pt-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                {/* Precio por línea (peso calculado o cantidad × unitario) */}
                <p className="text-3xl font-semibold">{moneyUsd(displayPrice)}</p>
                <p className="mt-1 text-base text-slate-500">{formatBolivars(displayPrice, rate)} <span className="text-xs text-slate-400">· tasa {formatRate(rate)}</span></p>
                {isWeight && (
                  <p className="mt-1 text-xs text-slate-400">
                    {formatWeight(grams)} · {moneyUsd(perGramPrice)}/g
                  </p>
                )}
              </div>
              <span className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${isWeight ? (grams >= maxGrams ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700') : (product.stock < 20 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}`}>
                {isWeight ? `${formatWeight(maxGrams)} disponibles` : `${product.stock} ${product.unit_label || 'u'} disponibles`}
              </span>
            </div>
            <button
              onClick={handleAdd}
              disabled={isWeight ? grams < minGrams || grams > maxGrams || grams <= 0 : unitQty < 1}
              className="mt-6 w-full rounded-full bg-navy px-5 py-3.5 text-sm font-medium text-navy-foreground transition hover:bg-brand hover:text-brand-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Agregar a solicitud
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}