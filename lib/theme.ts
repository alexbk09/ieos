// ============================================================
// Sistema de tema de marca (multiempresa)
// ------------------------------------------------------------
// Define los tokens visuales que cada empresa puede personalizar
// desde Configuración → Apariencia. Los colores se guardan en
// HEX dentro de site_settings.theme y se convierten a variables
// CSS (--brand, --navy, etc.) inyectadas en <head> por el layout.
//
// La estrategia es 100% CSS: los componentes usan clases Tailwind
// semánticas (text-brand, bg-navy, …) que apuntan a variables CSS.
// Cambiar un color en la BD re-tema TODA la app sin recompilar.
// ============================================================

// ---------- Tipos ----------
export type ThemeConfig = {
  /** Color de acento principal (botones resaltados, enlaces, badges). */
  brand: string
  /** Variante oscura del acento (texto sobre fondos claros). */
  brandStrong: string
  /** Variante clara del acento (texto sobre fondos oscuros). */
  brandLight: string
  /** Color del texto que va ENCIMA del acento (botones de marca). */
  brandForeground: string
  /** Color oscuro de marca (secciones, botones primarios, overlay). */
  navy: string
  /** Texto sobre el color oscuro de marca. */
  navyForeground: string
  /** Texto suave sobre el color oscuro de marca. */
  navyMuted: string
  /** Fondo general de la tienda en modo claro. */
  background: string
  /** Texto general en modo claro. */
  foreground: string
  /** Fondo general de la tienda en modo oscuro. */
  backgroundDark: string
  /** Texto general en modo oscuro. */
  foregroundDark: string
  /** Radio de esquinas redondeadas (ej: '1rem'). */
  radius: string
}

/** Valores por defecto: reproducen exactamente el look actual de zonadehobbies. */
export const DEFAULT_THEME: ThemeConfig = {
  brand: '#06b6d4',          // cian zonadehobbies (cyan-500)
  // cyan-700: el cyan-600 antiguo daba 3.68:1 como texto y NO cumplía WCAG AA.
  brandStrong: '#0e7490',    // cian profundo para texto sobre fondos claros (AA)
  brandLight: '#67e8f9',     // cian claro para texto/fondos oscuros (cyan-300)
  brandForeground: '#020617',// texto sobre cian (blue-950)
  navy: '#020617',           // azul marino de marca (blue-950)
  navyForeground: '#f8fafc', // texto sobre azul marino (slate-50)
  navyMuted: '#cbd5e1',      // texto suave sobre azul marino (slate-300)
  background: '#f8fafc',     // fondo tienda modo claro (slate-50)
  foreground: '#020617',     // texto tienda modo claro (slate-950)
  backgroundDark: '#020617', // fondo tienda modo oscuro (slate-950)
  foregroundDark: '#f8fafc', // texto tienda modo oscuro (slate-50)
  radius: '1rem',
}

// ---------- Temas rápidos (presets) ----------
export type ThemePreset = {
  name: string
  /** Muestra los dos colores principales del preset en la UI. */
  swatch: [string, string]
  /** Valores que sobreescriben DEFAULT_THEME. */
  theme: Partial<ThemeConfig>
}

/**
 * Presets de color de marca listos para usar.
 * IMPORTANTE: `brandStrong` es el color con el que se pinta TEXTO sobre fondos
 * claros (categorías, eyebrows, enlaces). Todos los valores usan la escala
 * -700/-800 de Tailwind para superar 4.5:1 sobre blanco y sobre las bandas
 * tintadas (WCAG 2.1 AA). Cambiar uno por una escala más clara vuelve a romper
 * el contraste y Lighthouse lo penaliza.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Cian zonadehobbies',
    swatch: ['#06b6d4', '#020617'],
    theme: { brand: '#06b6d4', brandStrong: '#0e7490', brandLight: '#67e8f9', brandForeground: '#020617', navy: '#020617', navyForeground: '#f8fafc', navyMuted: '#cbd5e1' },
  },
  {
    name: 'Esmeralda',
    swatch: ['#10b981', '#022c22'],
    theme: { brand: '#10b981', brandStrong: '#047857', brandLight: '#6ee7b7', brandForeground: '#022c22', navy: '#022c22', navyForeground: '#ecfdf5', navyMuted: '#a7f3d0' },
  },
  {
    name: 'Azul Marino',
    swatch: ['#3b82f6', '#0f172a'],
    theme: { brand: '#3b82f6', brandStrong: '#1d4ed8', brandLight: '#93c5fd', brandForeground: '#0f172a', navy: '#0f172a', navyForeground: '#eff6ff', navyMuted: '#bfdbfe' },
  },
  {
    name: 'Violeta Real',
    swatch: ['#8b5cf6', '#1e1b4b'],
    theme: { brand: '#8b5cf6', brandStrong: '#6d28d9', brandLight: '#c4b5fd', brandForeground: '#1e1b4b', navy: '#1e1b4b', navyForeground: '#f5f3ff', navyMuted: '#ddd6fe' },
  },
  {
    name: 'Ámbar',
    swatch: ['#f59e0b', '#451a03'],
    theme: { brand: '#f59e0b', brandStrong: '#92400e', brandLight: '#fcd34d', brandForeground: '#451a03', navy: '#451a03', navyForeground: '#fffbeb', navyMuted: '#fde68a' },
  },
  {
    name: 'Rosa Neón',
    swatch: ['#ec4899', '#500724'],
    theme: { brand: '#ec4899', brandStrong: '#be185d', brandLight: '#f9a8d4', brandForeground: '#500724', navy: '#500724', navyForeground: '#fdf2f8', navyMuted: '#fbcfe8' },
  },
]

// ---------- Utilidades de color ----------
/** Normaliza un hex (#abc → #aabbcc, mayúsculas → minúsculas). */
export function normalizeHex(value: string): string {
  let hex = value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex.split('').map((c) => c + c).join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return DEFAULT_THEME.brand
  return `#${hex.toLowerCase()}`
}

/** Convierte un hex a RGB. */
function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex).replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Mezcla dos colores hex. ratio = 0 → hex1, 1 → hex2. */
export function mixHex(hex1: string, hex2: string, ratio: number): string {
  const a = parseHex(hex1)
  const b = parseHex(hex2)
  const channel = (x: number, y: number) => Math.round(x + (y - x) * Math.max(0, Math.min(1, ratio)))
  const toHex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${toHex(channel(a.r, b.r))}${toHex(channel(a.g, b.g))}${toHex(channel(a.b, b.b))}`
}

/** Luminancia relativa (0-1) de un hex para elegir texto blanco/oscuro. */
export function hexLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

// ---------- Legibilidad automática (WCAG 2.1 AA) ----------
/** Contraste mínimo exigido a texto normal por WCAG 2.1 AA. */
const MIN_TEXT_CONTRAST = 4.5
/** Paso de corrección: cada iteración acerca el color un 5 % al blanco/negro. */
const CONTRAST_MIX_STEP = 0.05
/** Tope de iteraciones para no entrar en un bucle infinito con colores extremos. */
const CONTRAST_MIX_MAX_STEPS = 20
/**
 * Fondos de PEOR CASO donde se pinta texto de acento, tomados de los tokens de
 * superficie de globals.css. Se usan como referencia para corregir el acento:
 * validar solo contra --background dejaba textos a 4.4:1 sobre las bandas
 * tintadas (--surface-2/--surface-3) y Lighthouse lo marcaba como fallo.
 * Si esos tokens cambian en globals.css, deben cambiar aquí.
 */
const LIGHT_TEXT_WORST_BACKGROUND = '#e6f7fa' // --surface-3 (banda con tinte de marca)
const DARK_TEXT_WORST_BACKGROUND = '#101c2e' // --surface-2 (banda más clara en oscuro)

/** Ratio de contraste WCAG entre dos colores hex (rango 1 a 21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = hexLuminance(hexA)
  const luminanceB = hexLuminance(hexB)
  const [high, low] = luminanceA >= luminanceB ? [luminanceA, luminanceB] : [luminanceB, luminanceA]
  return (high + 0.05) / (low + 0.05)
}

/**
 * Garantiza que un color de TEXTO alcance el contraste AA sobre un fondo dado.
 * POR QUÉ: el color de marca lo elige el admin (o viene de una configuración
 * antigua ya guardada) y un acento bonito puede quedar ilegible como texto
 * (< 4.5:1), que es justo lo que penaliza Lighthouse en `color-contrast`.
 * En lugar de confiar en el valor guardado, oscurecemos (fondo claro) o
 * aclaramos (fondo oscuro) en pasos del 5 % hasta cumplir. Es lógica pura y
 * determinista: mismo color → mismo resultado, sin consultar la BD.
 * @param candidateHex Color de acento propuesto.
 * @param backgroundHex Fondo real sobre el que se pinta el texto.
 * @param direction 'darken' sobre fondos claros, 'lighten' sobre fondos oscuros.
 */
export function readableTextColor(
  candidateHex: string,
  backgroundHex: string,
  direction: 'darken' | 'lighten',
): string {
  const target = direction === 'darken' ? '#000000' : '#ffffff'
  let color = normalizeHex(candidateHex)
  for (let step = 0; step <= CONTRAST_MIX_MAX_STEPS; step += 1) {
    if (contrastRatio(color, backgroundHex) >= MIN_TEXT_CONTRAST) return color
    color = mixHex(color, target, CONTRAST_MIX_STEP)
  }
  return color
}

/**
 * Deriva automáticamente las variantes (fuerte, clara, texto) a partir
 * del color de marca principal. Usado por el selector de color avanzado
 * y al aplicar un preset personalizado.
 */
export function deriveThemeFromBrand(brandHex: string, base: Partial<ThemeConfig> = {}): Partial<ThemeConfig> {
  const brand = normalizeHex(brandHex)
  const luminance = hexLuminance(brand)
  // El acento como texto se corrige contra la banda tintada más exigente: así
  // cualquier color elegido por el admin nace cumpliendo AA (no queda ilegible).
  return {
    ...base,
    brand,
    brandStrong: readableTextColor(brand, LIGHT_TEXT_WORST_BACKGROUND, 'darken'),
    brandLight: mixHex(brand, '#ffffff', 0.45),
    brandForeground: luminance > 0.35 ? '#020617' : '#ffffff',
  }
}

// ---------- Conversión a CSS ----------
/**
 * Construye el bloque :root con todas las variables del tema (modo claro).
 * El acento de TEXTO se pasa por `readableTextColor`: si el color guardado no
 * llega a 4.5:1 sobre el fondo claro se oscurece solo (WCAG 2.1 AA).
 */
export function themeToCssVariables(theme: Partial<ThemeConfig>): string {
  const t = { ...DEFAULT_THEME, ...theme }
  return [
    `--brand:${t.brand};`,
    `--brand-strong:${readableTextColor(t.brandStrong, LIGHT_TEXT_WORST_BACKGROUND, 'darken')};`,
    `--brand-light:${t.brandLight};`,
    `--brand-foreground:${t.brandForeground};`,
    `--navy:${t.navy};`,
    `--navy-foreground:${t.navyForeground};`,
    `--navy-muted:${t.navyMuted};`,
    `--background:${t.background};`,
    `--foreground:${t.foreground};`,
    `--accent:${t.brand};`,
    `--accent-foreground:${t.brandForeground};`,
    `--ring:${t.brand};`,
    `--primary:${t.navy};`,
    `--primary-foreground:${t.navyForeground};`,
    `--radius:${t.radius};`,
  ].join('')
}

/**
 * Construye el bloque .dark con las variables del tema (modo oscuro).
 * EN OSCURO EL ACENTO DE TEXTO SE INVIERTE: se usa `brandLight` (variante clara)
 * porque un cian oscuro sobre fondo casi negro no alcanza 4.5:1 y es el fallo
 * de contraste típico al cambiar de tema. Se corrige además contra el fondo
 * oscuro real para que cualquier color del admin cumpla AA en ambos modos.
 */
export function themeDarkCssVariables(theme: Partial<ThemeConfig>): string {
  const t = { ...DEFAULT_THEME, ...theme }
  return [
    `--brand:${t.brand};`,
    `--brand-strong:${readableTextColor(t.brandLight, DARK_TEXT_WORST_BACKGROUND, 'lighten')};`,
    `--brand-light:${t.brandLight};`,
    `--brand-foreground:${t.brandForeground};`,
    `--navy:${t.navy};`,
    `--navy-foreground:${t.navyForeground};`,
    `--navy-muted:${t.navyMuted};`,
    `--background:${t.backgroundDark};`,
    `--foreground:${t.foregroundDark};`,
    `--accent:${t.brand};`,
    `--accent-foreground:${t.brandForeground};`,
    `--ring:${t.brand};`,
    `--primary:${t.brand};`,
    `--primary-foreground:${t.brandForeground};`,
    `--radius:${t.radius};`,
  ].join('')
}

/** Genera el <style> completo del tema (claro + oscuro) para inyectar en <head>. */
export function themeStyleTagContent(theme: Partial<ThemeConfig>): string {
  return `:root{${themeToCssVariables(theme)}}.dark{${themeDarkCssVariables(theme)}}`
}

// ---------- Aplicación en el navegador (preview en vivo) ----------
/**
 * Aplica el tema al documento insertando/actualizando un <style> en <head>.
 * Usado por el panel de configuración para el preview en vivo.
 * Las reglas :root/.dark tienen la misma especificidad que globals.css
 * pero aparecen después, por lo que ganan la cascada.
 */
export function applyThemeToDocument(theme: Partial<ThemeConfig>) {
  let style = document.getElementById('zonadehobbies-theme-preview') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'zonadehobbies-theme-preview'
    document.head.appendChild(style)
  }
  style.textContent = themeStyleTagContent(theme)
}

/** Elimina el preview cuando se sale de la pestaña Apariencia. */
export function clearThemeFromDocument() {
  document.getElementById('zonadehobbies-theme-preview')?.remove()
}