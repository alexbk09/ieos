'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react'

type CarouselImage = { id?: string; url: string; alt_text?: string | null }

/** Carrusel de imágenes para productos con múltiples fotos. */
export function ProductCarousel({ images, alt, className = '' }: { images: CarouselImage[]; alt: string; className?: string }) {
  const [index, setIndex] = useState(0)
  const list = images.length > 0 ? images : []

  if (list.length === 0) {
    return <div className={`grid place-items-center bg-slate-100 dark:bg-slate-800 ${className}`}><ImagePlus size={28} className="text-slate-400" /></div>
  }

  const current = list[Math.min(index, list.length - 1)]
  const showControls = list.length > 1

  return (
    <div className={`group relative overflow-hidden ${className}`}>
      <Image src={current.url} alt={current.alt_text || alt} width={800} height={600} loading="lazy" className="size-full object-cover" />
      {showControls && (
        <>
          <button aria-label="Anterior" onClick={(e) => { e.stopPropagation(); setIndex((i) => (i - 1 + list.length) % list.length) }} className="absolute left-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-blue-950 opacity-0 transition group-hover:opacity-100 hover:bg-white"><ChevronLeft size={16} /></button>
          <button aria-label="Siguiente" onClick={(e) => { e.stopPropagation(); setIndex((i) => (i + 1) % list.length) }} className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-blue-950 opacity-0 transition group-hover:opacity-100 hover:bg-white"><ChevronRight size={16} /></button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {list.map((img, i) => (
              <button key={img.id || i} aria-label={`Imagen ${i + 1}`} onClick={(e) => { e.stopPropagation(); setIndex(i) }} className={`size-1.5 rounded-full transition ${i === index ? 'bg-white' : 'bg-white/50'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}