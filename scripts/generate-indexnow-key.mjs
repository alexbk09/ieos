#!/usr/bin/env node
/**
 * Generador del ARCHIVO DE VERIFICACIÓN de IndexNow.
 * ------------------------------------------------------------------
 * POR QUÉ existe:
 *   IndexNow exige demostrar la propiedad del dominio sirviendo un archivo de
 *   texto en la RAÍZ del sitio: `https://<dominio>/<clave>.txt` con la clave
 *   dentro. Si el nombre del archivo no coincide EXACTAMENTE con la clave, el
 *   buscador responde 403 y no se indexa nada.
 *
 *   Como la clave vive en el entorno (INDEXNOW_KEY) para que cada instalación
 *   use la suya, el archivo NO puede quedar fijo en el repositorio: se genera
 *   aquí a partir del .env. Así, al instalar la plataforma en otro dominio,
 *   basta cambiar INDEXNOW_KEY y volver a construir/arrancar.
 *
 * Se ejecuta automáticamente antes de `npm run dev` y `npm run build`
 * (predev/prebuild), por lo que también funciona en el deploy.
 *
 * Uso:
 *   npm run indexnow:key                    # genera el archivo del .env actual
 *   node scripts/generate-indexnow-key.mjs --dry-run
 *   node scripts/generate-indexnow-key.mjs --help
 *
 * La clave de IndexNow NO es un secreto: es pública por diseño (el buscador
 * descarga ese archivo para validarla).
 */

import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { config } from 'dotenv'

config({ path: ['.env.development.local', '.env.local', '.env'] })

/** Carpeta pública del sitio (los archivos servidos en la raíz del dominio). */
const PUBLIC_DIR = 'public'

/** Formato de clave aceptado por IndexNow: 8-128 caracteres [a-zA-Z0-9-]. */
const PATRON_CLAVE = /^[a-zA-Z0-9-]{8,128}$/

/**
 * Nombres de archivos generados por versiones anteriores.
 * Solo se limpian los que tienen pinta de clave (hexadecimal largo) para no
 * tocar archivos legítimos como `sitemap.txt`.
 */
const PATRON_CLAVE_GENERADA = /^[a-f0-9]{32,128}\.txt$/i

/** Logs con color, coherentes con el resto de scripts del proyecto. */
function logStep(message) { console.log(`\n\x1b[1;36m▶ ${message}\x1b[0m`) }
function logOk(message) { console.log(`  \x1b[1;32m✓\x1b[0m ${message}`) }
function logSkip(message) { console.log(`  \x1b[1;33m•\x1b[0m ${message}`) }
function logError(message) { console.error(`  \x1b[1;31m✗\x1b[0m ${message}`) }

/** Imprime la ayuda de uso. */
function printUsage() {
  console.log(`
Uso: node scripts/generate-indexnow-key.mjs [opciones]

Genera public/<INDEXNOW_KEY>.txt, el archivo que IndexNow exige en la raíz del
dominio para verificar la propiedad. La clave se lee del entorno (.env).

Opciones:
  --dry-run     Muestra qué haría sin escribir ni borrar nada.
  -h, --help    Muestra esta ayuda.
`)
}

/** Argumentos de línea de comandos. */
function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    help: argv.includes('-h') || argv.includes('--help'),
  }
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  printUsage()
  process.exit(0)
}

logStep('Generando archivo de verificación de IndexNow')

const clave = (process.env.INDEXNOW_KEY ?? '').trim()
const habilitado = (process.env.INDEXNOW_ENABLED ?? '1').trim().toLowerCase() !== '0'

if (!clave) {
  logSkip('INDEXNOW_KEY no está definida: no se genera archivo (IndexNow quedará sin verificar).')
  process.exit(0)
}
if (!PATRON_CLAVE.test(clave)) {
  // No se aborta a propósito: este script corre también como hook de build y una
  // clave mal formada (función SEO opcional) NUNCA debe tumbar el despliegue.
  // El error queda visible aquí y en el diagnóstico del panel.
  logError(`INDEXNOW_KEY no cumple el formato (8-128 caracteres [a-zA-Z0-9-]): "${clave}"`)
  process.exit(0)
}
if (!habilitado) {
  logSkip('INDEXNOW_ENABLED=0: se genera igualmente el archivo por si se activa más tarde.')
}

const destino = `${PUBLIC_DIR}/${clave}.txt`

// 1) Limpiar claves anteriores (evita servir un archivo que ya no corresponde).
if (existsSync(PUBLIC_DIR)) {
  for (const archivo of readdirSync(PUBLIC_DIR)) {
    if (archivo === `${clave}.txt` || !PATRON_CLAVE_GENERADA.test(archivo)) continue
    if (args.dryRun) {
      logSkip(`[dry-run] se borraría el archivo obsoleto ${PUBLIC_DIR}/${archivo}`)
    } else {
      unlinkSync(`${PUBLIC_DIR}/${archivo}`)
      logOk(`Archivo obsoleto eliminado: ${PUBLIC_DIR}/${archivo}`)
    }
  }
}

// 2) Escribir el archivo con la clave dentro (UTF-8, sin BOM ni salto extra).
const contenidoActual = existsSync(destino) ? readFileSync(destino, 'utf8').trim() : null
if (contenidoActual === clave) {
  logOk(`Ya está al día: ${destino}`)
} else if (args.dryRun) {
  logSkip(`[dry-run] se escribiría ${destino} con la clave del entorno`)
} else {
  writeFileSync(destino, clave, 'utf8')
  logOk(`Archivo regenerado: ${destino}`)
}

console.log(
  `\n  El buscador lo descargará desde: \x1b[1mhttps://<tu-dominio>/${clave}.txt\x1b[0m` +
    '\n  Comprueba que responde 200 con la clave dentro antes de enviar URLs.\n',
)
