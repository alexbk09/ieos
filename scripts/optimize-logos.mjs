/**
 * Optimizador de identidad visual (logos → WebP + favicon + OG image).
 * ------------------------------------------------------------------
 * POR QUÉ existe:
 *  - Los PNG originales de `public/logos` pesan ~700-870 KB y tienen nombres
 *    con espacios/acentos (URLs sucias). Servirlos tal cual arruina el LCP del
 *    header (el logo se ve en TODAS las páginas).
 *  - Un sitio de categoría premium necesita: wordmark claro/oscuro, isotipo,
 *    favicon, apple-icon y una imagen 1200x630 para compartir (og:image).
 *
 * Genera (todos los archivos con nombres SEO-friendly, sin espacios):
 *  public/logos/zonadehobbies-wordmark-on-light.webp  (wordmark letras oscuras)
 *  public/logos/zonadehobbies-wordmark-on-dark.webp   (wordmark letras blancas)
 *  public/logos/zonadehobbies-isotipo.webp            (isotipo circular, letras negras)
 *  public/logos/zonadehobbies-isotipo-on-dark.webp    (isotipo circular, letras blancas)
 *  public/logos/zonadehobbies-favicon.png             (favicon configurable en el admin)
 *  app/icon.png                                 (favicon)
 *  app/apple-icon.png                           (apple-touch 180x180)
 *  public/og/zonadehobbies-og.jpg                      (og:image 1200x630)
 *
 * Los PNG originales viven en brand-assets/source (FUERA de public/) para que
 * el deploy no arrastre ~3 MB de imágenes pesadas que el sitio ya no usa.
 *
 * Uso: node scripts/optimize-logos.mjs
 */

import sharp from 'sharp'
import { mkdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** Origen (fuera de public) y destino optimizado (servido por Next). */
const SOURCE_DIR = path.join(root, 'brand-assets', 'source')
const LOGOS = path.join(root, 'public', 'logos')
const OG_DIR = path.join(root, 'public', 'og')

/** Colores de marca (fuente única: lib/theme.ts → DEFAULT_THEME). */
const BRAND = '#06b6d4'
const BRAND_LIGHT = '#67e8f9'
const NAVY = '#020617'
const NAVY_SOFT = '#0f172a'

/** Archivos de origen → destino procesado. */
const SOURCES = {
  wordmarkLight: path.join(SOURCE_DIR, 'letra snormales sin fondo.png'),
  wordmarkDark: path.join(SOURCE_DIR, 'letrasblancas.png'),
  isotype: path.join(SOURCE_DIR, 'redondo letras negras.png'),
  isotypeDark: path.join(SOURCE_DIR, 'redondo-letras-blanclas fondo negro.png'),
}

/** Recorta el margen vacío y devuelve el buffer limpio + sus dimensiones. */
async function trimmed(file, threshold = 12) {
  return sharp(file).trim({ threshold }).png().toBuffer({ resolveWithObject: true })
}

/** Escribe un WebP optimizado a partir de un buffer y un ancho objetivo. */
async function writeWebp(buffer, outPath, width, quality = 88) {
  await sharp(buffer)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, alphaQuality: 92 })
    .toFile(outPath)
  const { size } = await stat(outPath)
  console.log(`OK ${path.relative(root, outPath)}  (${(size / 1024).toFixed(1)} KB)`)
}

/** Favicon/apple-icon: isotipo oscuro sobre un fondo de marca redondeado. */
async function writeBrandedIcon(isotypeBuffer, size, outPath) {
  const radius = Math.round(size * 0.22)
  const background = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
       <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${BRAND}"/>
     </svg>`,
  )
  const inner = Math.round(size * 0.62)
  const glyph = await sharp(isotypeBuffer)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  await sharp(background)
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toFile(outPath)
  const { size: bytes } = await stat(outPath)
  console.log(`OK ${path.relative(root, outPath)}  (${(bytes / 1024).toFixed(1)} KB)`)
}

/** og:image 1200x630: fondo navy con glow de marca + wordmark + claim. */
async function writeOgImage(wordmarkDark, claim) {
  const W = 1200
  const H = 630
  const wordmark = await sharp(wordmarkDark).resize({ width: 560, withoutEnlargement: true }).png().toBuffer()
  const wmHeight = (await sharp(wordmark).metadata()).height ?? 200
  const wmTop = Math.round(H / 2 - wmHeight / 2 - 24)

  const canvas = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
       <defs>
         <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="${NAVY}"/>
           <stop offset="1" stop-color="${NAVY_SOFT}"/>
         </linearGradient>
         <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
           <stop offset="0" stop-color="${BRAND}" stop-opacity="0.34"/>
           <stop offset="1" stop-color="${BRAND}" stop-opacity="0"/>
         </radialGradient>
       </defs>
       <rect width="${W}" height="${H}" fill="url(#bg)"/>
       <rect width="${W}" height="${H}" fill="url(#glow)"/>
       <rect x="${W / 2 - 40}" y="${H - 150}" width="80" height="6" rx="3" fill="${BRAND}"/>
       <text x="${W / 2}" y="${H - 90}" text-anchor="middle"
             font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${BRAND_LIGHT}">
         ${claim}
       </text>
     </svg>`,
  )

  const outPath = path.join(OG_DIR, 'zonadehobbies-og.jpg')
  await sharp(canvas)
    .composite([{ input: wordmark, left: Math.round(W / 2 - 280), top: wmTop }])
    .jpeg({ quality: 86, chromaSubsampling: '4:4:4' })
    .toFile(outPath)
  const { size } = await stat(outPath)
  console.log(`OK public/og/zonadehobbies-og.jpg  (${(size / 1024).toFixed(1)} KB)`)
}

async function main() {
  await mkdir(OG_DIR, { recursive: true })

  const [wordmarkLight, wordmarkDark, isotype, isotypeDark] = await Promise.all([
    trimmed(SOURCES.wordmarkLight),
    trimmed(SOURCES.wordmarkDark),
    trimmed(SOURCES.isotype),
    trimmed(SOURCES.isotypeDark),
  ])

  // Logos de UI (header/footer): ancho 720px cubre pantallas retina a altura ~36px.
  await writeWebp(wordmarkLight.data, path.join(LOGOS, 'zonadehobbies-wordmark-on-light.webp'), 720)
  await writeWebp(wordmarkDark.data, path.join(LOGOS, 'zonadehobbies-wordmark-on-dark.webp'), 720)
  await writeWebp(isotype.data, path.join(LOGOS, 'zonadehobbies-isotipo.webp'), 256)
  // Isotipo sobre círculo oscuro: legible tanto en fondos claros como oscuros.
  await writeWebp(isotypeDark.data, path.join(LOGOS, 'zonadehobbies-isotipo-on-dark.webp'), 256)

  // Favicon público configurable desde el admin (además de app/icon.png).
  await writeBrandedIcon(isotype.data, 512, path.join(LOGOS, 'zonadehobbies-favicon.png'))
  await writeBrandedIcon(isotype.data, 512, path.join(root, 'app', 'icon.png'))
  await writeBrandedIcon(isotype.data, 180, path.join(root, 'app', 'apple-icon.png'))

  await writeOgImage(wordmarkDark.data, 'Ofertas verificadas para tus hobbies')
}

main().catch((error) => {
  console.error('Error optimizando logos:', error)
  process.exitCode = 1
})
