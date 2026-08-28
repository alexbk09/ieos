'use client'

import { useEffect } from 'react'
import { Check, Moon, Paintbrush, RotateCcw, Sun } from 'lucide-react'
import { DEFAULT_THEME, THEME_PRESETS, applyThemeToDocument, clearThemeFromDocument, deriveThemeFromBrand, normalizeHex, type ThemeConfig } from '@/lib/theme'
import { cn } from '@/lib/utils'

/** Campos de color editables con su etiqueta y descripción. */
const COLOR_FIELDS: { key: keyof ThemeConfig; label: string; hint: string }[] = [
  { key: 'brand', label: 'Color de marca', hint: 'Botones resaltados, enlaces y badges' },
  { key: 'brandStrong', label: 'Marca fuerte', hint: 'Texto y acentos sobre fondos claros' },
  { key: 'brandLight', label: 'Marca clara', hint: 'Acentos sobre secciones oscuras' },
  { key: 'brandForeground', label: 'Texto sobre marca', hint: 'Texto que va encima del color de marca' },
  { key: 'navy', label: 'Azul marino', hint: 'Secciones, botones primarios y overlays' },
  { key: 'navyForeground', label: 'Texto sobre marino', hint: 'Texto principal sobre secciones oscuras' },
  { key: 'navyMuted', label: 'Texto suave marino', hint: 'Subtítulos sobre secciones oscuras' },
  { key: 'background', label: 'Fondo claro', hint: 'Fondo general de la tienda (modo claro)' },
  { key: 'foreground', label: 'Texto claro', hint: 'Texto general (modo claro)' },
  { key: 'backgroundDark', label: 'Fondo oscuro', hint: 'Fondo general de la tienda (modo oscuro)' },
  { key: 'foregroundDark', label: 'Texto oscuro', hint: 'Texto general (modo oscuro)' },
]

/**
 * Editor visual de tema (colores + radio + presets).
 * Aplica el tema al documento en tiempo real para el preview en vivo
 * y reporta los cambios al padre para que los guarde junto al resto
 * de la configuración del sitio.
 */
export function ThemeSettingsManager({ value, onChange }: { value: ThemeConfig; onChange: (theme: ThemeConfig) => void }) {
  // Aplica el preview del tema ACTUAL al documento.
  useEffect(() => {
    applyThemeToDocument(value)
    return () => clearThemeFromDocument()
  }, [value])

  /** Actualiza un campo de color. */
  function setColor(key: keyof ThemeConfig, hex: string) {
    onChange({ ...value, [key]: normalizeHex(hex) })
  }

  /** Restaura el tema por defecto. */
  function resetTheme() {
    onChange({ ...DEFAULT_THEME })
  }

  /** Aplica un preset (sobreescribe los colores de marca + marino). */
  function applyPreset(preset: (typeof THEME_PRESETS)[number]) {
    onChange({ ...value, ...preset.theme })
  }

  /** Deriva automáticamente las variantes de marca a partir de un color base. */
  function applyBrandDerivation(hex: string) {
    onChange({ ...value, ...deriveThemeFromBrand(hex, value) })
  }

  return (
    <div className="grid gap-8">
      {/* Presets rápidos */}
      <section>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Paintbrush size={15} className="text-brand" /> Temas rápidos
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Elige un preset o personaliza cada color abajo.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEME_PRESETS.map((preset) => {
            const active = value.brand === preset.theme.brand && value.navy === preset.theme.navy
            return (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl border p-3 text-left text-sm font-medium transition-all hover:border-brand/60 hover:bg-muted/50 active:scale-[0.98]',
                  active ? 'border-brand ring-2 ring-brand/20' : 'border-border',
                )}
              >
                <span className="flex shrink-0 -space-x-1.5">
                  <span className="size-6 rounded-full border-2 border-card" style={{ background: preset.swatch[0] }} />
                  <span className="size-6 rounded-full border-2 border-card" style={{ background: preset.swatch[1] }} />
                </span>
                <span className="min-w-0 flex-1 truncate">{preset.name}</span>
                {active && <Check size={15} className="shrink-0 text-brand" />}
              </button>
            )
          })}
        </div>
      </section>

      {/* Color de marca inteligente */}
      <section>
        <p className="text-sm font-semibold">Color de marca inteligente</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Al elegir un color, las variantes (fuerte, clara y texto) se calculan automáticamente.
        </p>
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed border-border p-4">
          <label className="relative grid size-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-border transition-transform hover:scale-105" style={{ background: value.brand }}>
            <input
              type="color"
              value={value.brand}
              onChange={(e) => applyBrandDerivation(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Color de marca principal"
            />
            <Paintbrush size={18} className="pointer-events-none text-white drop-shadow" />
          </label>
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold uppercase">{value.brand}</p>
            <p className="text-xs text-muted-foreground">Clic en el círculo para abrir el selector</p>
          </div>
          <button
            onClick={() => applyBrandDerivation(value.brand)}
            className="ml-auto inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium transition-colors hover:border-brand/60 hover:text-brand"
          >
            <RotateCcw size={13} /> Recalcular
          </button>
        </div>
      </section>

      {/* Selectores avanzados */}
      <section>
        <p className="text-sm font-semibold">Colores avanzados</p>
        <p className="mt-1 text-xs text-muted-foreground">Control total sobre cada token visual del sistema.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {COLOR_FIELDS.map(({ key, label, hint }) => (
            <label key={key} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border p-3 transition-colors hover:border-brand/50">
              <input
                type="color"
                value={value[key]}
                onChange={(e) => setColor(key, e.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                aria-label={label}
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{label}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">{value[key]}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground/70">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Radio de esquinas */}
      <section>
        <p className="text-sm font-semibold">Radio de esquinas</p>
        <p className="mt-1 text-xs text-muted-foreground">Controla el redondeo de tarjetas, botones y secciones.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-border p-4">
          <input
            type="range"
            min={0}
            max={32}
            step={1}
            value={parseFloat(value.radius) || 16}
            onChange={(e) => onChange({ ...value, radius: `${e.target.value}px` })}
            className="h-2 flex-1 cursor-pointer accent-brand"
            aria-label="Radio de esquinas en píxeles"
          />
          <span className="w-24 rounded-xl border border-border px-3 py-2 text-center font-mono text-sm">{value.radius}</span>
        </div>
      </section>

      {/* Preview en vivo */}
      <section>
        <p className="text-sm font-semibold">Vista previa</p>
        <p className="mt-1 text-xs text-muted-foreground">Los cambios se aplican en vivo y en toda la app al guardar.</p>
        <div className="mt-4 space-y-4 rounded-3xl border border-border bg-background p-5">
          {/* Header simulado */}
          <div className="flex items-center justify-between gap-3">
            <span className="grid size-9 place-items-center rounded-xl text-sm font-black" style={{ background: 'var(--brand)', color: 'var(--brand-foreground)' }}>IE</span>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full px-3 py-1 text-xs font-semibold sm:block" style={{ background: 'var(--brand)', color: 'var(--brand-foreground)' }}>Explorar catálogo</span>
              <span className="grid size-9 place-items-center rounded-full border" style={{ borderColor: 'var(--border)' }}>
                <Moon size={14} className="text-muted-foreground" />
              </span>
            </div>
          </div>

          {/* Hero simulado */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--brand-strong)' }}>Wall Panels & Pisos SPC</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              Espacios que <span style={{ color: 'var(--brand)' }}>transforman.</span>
            </p>
          </div>

          {/* Botones */}
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold" style={{ background: 'var(--navy)', color: 'var(--navy-foreground)' }}>
              Botón primario
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
              <Sun size={12} /> Secundario
            </span>
          </div>

          {/* Estudio simulado */}
          <div className="rounded-3xl p-5" style={{ background: 'var(--navy)', color: 'var(--navy-foreground)' }}>
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--brand-light)' }}>Nuestro espacio</p>
            <p className="mt-1 text-sm">Materiales con identidad para cada proyecto.</p>
            <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--brand-light)' }}>01</p>
            <p className="text-xs" style={{ color: 'var(--navy-muted)' }}>Wall panels 3D que añaden textura, profundidad y estilo.</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border p-4">
        <p className="text-xs text-muted-foreground">
          Cambia los colores y pulsa <strong>Guardar cambios</strong> para publicar en toda la tienda.
        </p>
        <button
          onClick={resetTheme}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium transition-colors hover:border-destructive/50 hover:text-destructive"
        >
          <RotateCcw size={13} /> Restaurar por defecto
        </button>
      </div>
    </div>
  )
}