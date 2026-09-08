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

async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/admin/upload', { method: 'POST', body: form })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'No se pudo subir la imagen')
  return result.url
}

/**
 * Editor de la sección Studio dentro del módulo Studio.
 * Permite personalizar fondo (color/imagen/degradado), colores de texto
 * y orientación (texto izquierda/derecha).
 */
export function StudioConfigManager({ value, onChange }: {
  value: HomepageConfig['studio']
  onChange: (studio: HomepageConfig['studio']) => void
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
    <div className="grid gap-6">
      {/* Orientación */}
      <section className="rounded-3xl border border-border p-5">
        <p className="text-sm font-semibold">Orientación</p>
        <p className="mt-1 text-xs text-muted-foreground">Elige cómo se distribuyen el título y los puntos.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(['text-left', 'text-right'] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => onChange({ ...value, layout: opt })}
              className={cn(
                'flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                value.layout === opt ? 'border-brand bg-brand/10 text-brand' : 'border-border hover:bg-muted',
              )}
            >
              {opt === 'text-left' ? 'Texto izquierda · Números derecha' : 'Texto derecha · Números izquierda'}
              {value.layout === opt && <span className="text-brand">✓</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Fondo */}
      <section className="rounded-3xl border border-border p-5">
        <p className="text-sm font-semibold">Fondo</p>
        <p className="mt-1 text-xs text-muted-foreground">Define el fondo de la sección Studio.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {BG_TYPES.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange({ ...value, backgroundType: opt.value })}
              className={cn(
                'flex items-center justify-between rounded-2xl border px-4 py-2 text-left text-sm font-medium transition-colors',
                value.backgroundType === opt.value ? 'border-brand bg-brand/10 text-brand' : 'border-border hover:bg-muted',
              )}
            >
              {opt.label}
              {value.backgroundType === opt.value && <span className="text-brand">✓</span>}
            </button>
          ))}
        </div>

        {value.backgroundType === 'solid' && (
          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
            <input type="color" value={value.backgroundSolid === 'transparent' ? '#020617' : value.backgroundSolid} onChange={(e) => onChange({ ...value, backgroundSolid: e.target.value })} className="size-10 cursor-pointer rounded-lg border-0 bg-transparent" />
            <span className="text-sm">{value.backgroundSolid}</span>
            <span className="ml-auto text-xs text-muted-foreground">Color de fondo</span>
          </label>
        )}

        {value.backgroundType === 'image' && (
          <div className="mt-4 grid gap-3">
            {value.backgroundImage && (
              <div className="flex items-center gap-3 rounded-2xl border border-border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={value.backgroundImage} alt="Fondo Studio" className="h-14 w-20 rounded-xl object-cover" />
                <button onClick={() => onChange({ ...value, backgroundImage: '' })} className="grid size-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"><X size={14} /></button>
              </div>
            )}
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted">
              {uploading ? 'Subiendo…' : 'Subir imagen de fondo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </label>
          </div>
        )}

        {value.backgroundType === 'gradient' && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-2">
              <input type="color" value={value.backgroundGradientFrom} onChange={(e) => onChange({ ...value, backgroundGradientFrom: e.target.value })} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent" />
              <span className="text-xs">Desde</span>
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-2">
              <input type="color" value={value.backgroundGradientTo} onChange={(e) => onChange({ ...value, backgroundGradientTo: e.target.value })} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent" />
              <span className="text-xs">Hasta</span>
            </label>
          </div>
        )}
      </section>

      {/* Colores de texto */}
      <section className="rounded-3xl border border-border p-5">
        <p className="text-sm font-semibold">Colores de texto</p>
        <p className="mt-1 text-xs text-muted-foreground">Personaliza los colores del título, números y descripciones.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
            <input type="color" value={value.textColor || '#f8fafc'} onChange={(e) => onChange({ ...value, textColor: e.target.value })} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent" />
            <span className="min-w-0">
              <span className="block text-xs font-medium">Color del título</span>
              <span className="block font-mono text-[10px] text-muted-foreground">{value.textColor || '#f8fafc'}</span>
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
            <input type="color" value={value.accentColor || '#67e8f9'} onChange={(e) => onChange({ ...value, accentColor: e.target.value })} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent" />
            <span className="min-w-0">
              <span className="block text-xs font-medium">Color de números</span>
              <span className="block font-mono text-[10px] text-muted-foreground">{value.accentColor || '#67e8f9'}</span>
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
            <input type="color" value={value.mutedColor || '#cbd5e1'} onChange={(e) => onChange({ ...value, mutedColor: e.target.value })} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent" />
            <span className="min-w-0">
              <span className="block text-xs font-medium">Color descripciones</span>
              <span className="block font-mono text-[10px] text-muted-foreground">{value.mutedColor || '#cbd5e1'}</span>
            </span>
          </label>
        </div>
      </section>
    </div>
  )
}