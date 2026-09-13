// ============================================================
// Auditoría de contraste WCAG 2.1 AA de los tokens del tema.
// ------------------------------------------------------------
// POR QUÉ existe: la accesibilidad de color es la causa #1 de puntos
// perdidos en el informe de Lighthouse (auditoría `color-contrast`).
// Detectarlo a mano es inviable porque los colores son tokens editables
// por el admin (site_settings.theme). Este script resuelve el valor REAL
// que verá el usuario (globals.css + overrides del tema) y calcula la
// ratio de contraste de cada par texto/fondo crítico del diseño.
//
// Uso: node scripts/a11y-contrast-audit.mjs
// Salida: tabla con ratio y veredicto. Termina con código 1 si hay fallos
// (útil para CI). Sin dependencias: conversión OKLCH → sRGB propia.
// ============================================================

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GLOBALS_CSS_PATH = resolve(ROOT, 'app/globals.css')
const THEME_TS_PATH = resolve(ROOT, 'lib/theme.ts')

// ---------- Umbrales WCAG (evita números mágicos en la lógica) ----------
const AA_NORMAL_TEXT = 4.5
const AA_LARGE_TEXT = 3
const CHANNEL_MAX = 255
const GAMMA_THRESHOLD = 0.0031308

// ---------- Conversión de color ----------

/** Limita un canal a su rango válido (evita valores fuera de gamut). */
const clampChannel = (value) => Math.min(CHANNEL_MAX, Math.max(0, value))

/** Convierte un canal lineal (0-1) a sRGB 0-255 con la curva estándar. */
function linearToSrgb(channel) {
  const value = channel <= GAMMA_THRESHOLD
    ? 12.92 * channel
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055
  return clampChannel(value * CHANNEL_MAX)
}

/** Convierte OKLCH (L 0-1, C, H en grados) a sRGB 0-255 (con clamp de gamut). */
function oklchToRgb(lightness, chroma, hueDegrees) {
  const hue = (hueDegrees * Math.PI) / 180
  const a = chroma * Math.cos(hue)
  const b = chroma * Math.sin(hue)
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b
  const l = lRoot ** 3
  const m = mRoot ** 3
  const s = sRoot ** 3
  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

/** Convierte HEX (#rgb o #rrggbb) a sRGB 0-255. */
function hexToRgb(hex) {
  const clean = hex.trim().replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/** Parsea un valor CSS soportado (#hex u oklch()). Devuelve null si no aplica. */
function parseColor(value) {
  if (!value) return null
  const raw = value.trim().replace(/;$/, '')
  if (raw.startsWith('#')) return hexToRgb(raw)
  const oklch = raw.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/i)
  if (oklch) return oklchToRgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]))
  return null
}

/** Luminancia relativa según WCAG 2.x (base para la ratio de contraste). */
function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / CHANNEL_MAX
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Ratio de contraste WCAG entre dos colores (rango 1 a 21). */
function contrastRatio(foreground, background) {
  const l1 = relativeLuminance(foreground)
  const l2 = relativeLuminance(background)
  const [high, low] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (high + 0.05) / (low + 0.05)
}

// ---------- Lectura de tokens ----------

/** Extrae las variables CSS de color declaradas en :root y .dark de globals.css. */
function readCssTokens(css) {
  const darkStart = css.indexOf('.dark {')
  const lightBlock = darkStart >= 0 ? css.slice(0, darkStart) : css
  const darkBlock = darkStart >= 0 ? css.slice(darkStart) : ''
  const extract = (block) => {
    const tokens = {}
    for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      const [, name, value] = match
      // Solo se guardan valores de color reales (se ignoran var() y utilidades).
      if (parseColor(value)) tokens[name] = value.trim()
    }
    return tokens
  }
  return { light: extract(lightBlock), dark: extract(darkBlock) }
}

/** Extrae los colores por defecto de DEFAULT_THEME en lib/theme.ts. */
function readDefaultTheme(source) {
  const start = source.indexOf('export const DEFAULT_THEME')
  const block = source.slice(start, source.indexOf('}', start))
  const theme = {}
  for (const match of block.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{3,8})'/g)) {
    theme[match[1]] = match[2]
  }
  return theme
}

/**
 * Aplica los overrides que el tema editable inyecta en <head>.
 * MISMO mapeo que `themeToCssVariables` / `themeDarkCssVariables` de lib/theme.ts:
 * si ese mapeo cambia allí, este diccionario debe cambiar con él.
 */
function applyThemeOverrides(tokens, theme, mode) {
  const isDark = mode === 'dark'
  const overrides = {
    '--brand': theme.brand,
    // En claro el acento de texto es la variante oscura; en oscuro se invierte a
    // la variante clara (themeDarkCssVariables usa brandLight). Mismo criterio.
    '--brand-strong': isDark ? theme.brandLight : theme.brandStrong,
    '--brand-light': theme.brandLight,
    '--brand-foreground': theme.brandForeground,
    '--navy': theme.navy,
    '--navy-foreground': theme.navyForeground,
    '--navy-muted': theme.navyMuted,
    '--background': isDark ? theme.backgroundDark : theme.background,
    '--foreground': isDark ? theme.foregroundDark : theme.foreground,
    '--accent': theme.brand,
    '--accent-foreground': theme.brandForeground,
    '--ring': theme.brand,
    '--primary': isDark ? theme.brand : theme.navy,
    '--primary-foreground': isDark ? theme.brandForeground : theme.navyForeground,
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (value) tokens[name] = value
  }
  return tokens
}

// ---------- Pares críticos texto/fondo ----------
// Formato: [descripción legible, token de texto, token de fondo].
// Solo se auditan combinaciones REALES del diseño (no combinaciones teóricas).
const TEXT_PAIRS = [
  ['Título y párrafos sobre fondo', '--foreground', '--background'],
  ['Título y párrafos sobre tarjeta', '--foreground', '--card'],
  ['Texto secundario sobre fondo', '--muted-foreground', '--background'],
  ['Texto secundario sobre tarjeta', '--muted-foreground', '--card'],
  ['Texto secundario sobre banda neutra', '--muted-foreground', '--surface-2'],
  ['Texto secundario sobre banda de marca', '--muted-foreground', '--surface-3'],
  ['Acento de texto sobre fondo', '--brand-strong', '--background'],
  ['Acento de texto sobre tarjeta', '--brand-strong', '--card'],
  ['Acento de texto sobre banda de marca', '--brand-strong', '--surface-3'],
  ['Texto de botón de marca', '--brand-foreground', '--brand'],
  ['Texto sobre banda profunda', '--surface-deep-foreground', '--surface-deep'],
  ['Texto suave sobre banda profunda', '--surface-deep-muted', '--surface-deep'],
  ['Texto sobre azul marino', '--navy-foreground', '--navy'],
  ['Texto suave sobre azul marino', '--navy-muted', '--navy'],
  ['Texto de botón primario', '--primary-foreground', '--primary'],
  ['Texto de botón secundario', '--secondary-foreground', '--secondary'],
  ['Texto sobre acento', '--accent-foreground', '--accent'],
]

/** Audita todos los pares de un modo. Devuelve filas, fallos y el modo. */
function auditMode(mode, cssTokens, theme) {
  const tokens = applyThemeOverrides({ ...cssTokens }, theme, mode)
  const rows = []
  let failures = 0
  for (const [label, foregroundToken, backgroundToken] of TEXT_PAIRS) {
    const foreground = parseColor(tokens[foregroundToken])
    const background = parseColor(tokens[backgroundToken])
    if (!foreground || !background) {
      rows.push({ label, ratio: '—', status: 'SKIP (token ausente)' })
      continue
    }
    const ratio = contrastRatio(foreground, background)
    const passes = ratio >= AA_NORMAL_TEXT
    if (!passes) failures += 1
    rows.push({
      label,
      ratio: `${ratio.toFixed(2)}:1`,
      status: passes ? 'OK' : `FAIL (mín ${AA_NORMAL_TEXT}:1)`,
    })
  }
  return { rows, failures, mode }
}

/** Imprime la tabla alineada de un modo y devuelve su número de fallos. */
function printReport({ rows, failures, mode }) {
  console.log(`\n=== Contraste WCAG AA — modo ${mode === 'dark' ? 'OSCURO' : 'CLARO'} ===`)
  for (const row of rows) {
    const icon = row.status === 'OK' ? '✓' : '✗'
    console.log(`${icon} ${row.label.padEnd(36, ' ')}${String(row.ratio).padStart(8, ' ')}  ${row.status}`)
  }
  console.log(`   Fallos: ${failures}/${rows.length}`)
  return failures
}

// ---------- Ejecución ----------
const css = readFileSync(GLOBALS_CSS_PATH, 'utf8')
const themeSource = readFileSync(THEME_TS_PATH, 'utf8')
const { light, dark } = readCssTokens(css)
const theme = readDefaultTheme(themeSource)

const totalFailures = printReport(auditMode('light', light, theme))
  + printReport(auditMode('dark', dark, theme))

console.log(`\nUmbrales: ${AA_NORMAL_TEXT}:1 texto normal · ${AA_LARGE_TEXT}:1 texto grande / gráficos`)
console.log(totalFailures === 0
  ? 'RESULTADO: todos los pares de texto cumplen WCAG AA.'
  : `RESULTADO: ${totalFailures} par(es) por debajo de AA. Revisa los tokens marcados.`)

process.exitCode = totalFailures > 0 ? 1 : 0
