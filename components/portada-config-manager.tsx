'use client'

import { useState } from 'react'
import { Upload, X } from 'lucide-react'
import type { HomepageConfig, BackgroundType } from '@/lib/homepage-config'
import { cn } from '@/lib/utils'

const BG_TYPES: { value: BackgroundType; label: string }[] = [
  { value: 'solid', label: 'Color sólido' },
  { value: 'image', label: 'Imagen' },
  { value: 'gradient', label: 'Degradado' },
]

const HERO_LAYOUTS: { value: HomepageConfig['hero']['layout']; label: string }[] = [
  { value: 'text-left-image-right', label: 'Texto izq · Imagen der' },
  { value: 'text-right-image-left', label: 'Texto der · Imagen izq' },
  { value: 'text-center', label: 'Texto centrado' },
  { value: 'text-only', label: 'Solo texto' },
]

async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/admin/upload', { method: 'POST', body: form })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'No se pudo subir la imagen')
  return result.url
}

/**
 * Editor del diseño visual de la portada dentro del módulo Portada.
 * Permite elegir layout (texto izquierda/derecha/centrado) y fondo
 * (color sólido, imagen o degradado).
 */
export function PortadaConfigManager({ value, onChange }: {
  value: HomepageConfig['hero']
  onChange: (hero: HomepageConfig['hero']) => void
}) {
  const [uploading, setUploading] = useState(false)

  async function handleUpload(file?: File | null) {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      onChange({ ...value, backgroundImage: url })
    } catch (err) {
      console.error('Error subiendo imagen:', err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-dashed border-border p-4">
      <p className="text-sm font-medium">Diseño visual de la portada</p>

      {/* Layout */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Layout</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {HERO_LAYOUTS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange({ ...value, layout: opt.value })}
              className={cn(
                'flex items-center justify-between rounded-2xl border px-3 py-2 text-xs font-medium transition-colors',
                value.layout === opt.value ? 'border-brand bg-brand/10 text-brand' : 'border-border hover:bg-muted',
              )}
            >
              {opt.label}
              {value.layout === opt.value && <span className="text-brand">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Fondo */}
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Fondo</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {BG_TYPES.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange({ ...value, backgroundType: opt.value })}
              className={cn(
                'rounded-2xl border px-3 py-2 text-xs font-medium transition-colors',
                value.backgroundType === opt.value ? 'border-brand bg-brand/10 text-brand' : 'border-border hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {value.backgroundType === 'solid' && (
          <label className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
            <input type="color" value={value.backgroundSolid} onChange={(e) => onChange({ ...value, backgroundSolid: e.target.value })} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent" />
            <span className="text-xs">{value.backgroundSolid}</span>
          </label>
        )}

        {value.backgroundType === 'image' && (
          <div className="mt-3 grid gap-3">
            {value.backgroundImage && (
              <div className="flex items-center gap-3 rounded-2xl border border-border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={value.backgroundImage} alt="Fondo portada" className="h-14 w-20 rounded-xl object-cover" />
                <button onClick={() => onChange({ ...value, backgroundImage: '' })} className="grid size-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><X size={14} /></button>
              </div>
            )}
            <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-medium hover:bg-muted">
              {uploading ? 'Subiendo…' : 'Subir imagen de fondo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={value.overlay} onChange={(e) => onChange({ ...value, overlay: e.target.checked })} className="accent-brand" />
              Oscurecer fondo para legibilidad
            </label>
          </div>
        )}

        {value.backgroundType === 'gradient' && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-2">
              <input type="color" value={value.backgroundGradientFrom} onChange={(e) => onChange({ ...value, backgroundGradientFrom: e.target.value })} className="size-8 cursor-pointer rounded-lg border-0 bg-transparent" />
              <span className="text-xs">Desde</span>
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-2">
              <input type="color" value={value.backgroundGradientTo} onChange={(e) => onChange({ ...value, backgroundGradientTo: e.target.value })} className="size-8 cursor-pointer rounded-lg border-0 bg-transparent" />
              <span className="text-xs">Hasta</span>
            </label>
          </div>
        )}
      </div>
    </div>
  )
}