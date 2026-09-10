#!/usr/bin/env node
/**
 * Backfill de internacionalización de categorías (migración 0049).
 * ------------------------------------------------------------------
 * Rellena las columnas *_i18n de las categorías EXISTENTES usando el motor de
 * traducción (DeepSeek), con UNA sola llamada al LLM por categoría.
 *
 * POR QUÉ es idempotente y de bajo coste:
 *  - Solo traduce los idiomas que FALTAN (salvo --force): re-ejecutarlo no gasta.
 *  - Una única petición devuelve TODOS los idiomas pendientes de la categoría.
 *  - Los slugs se generan en LOCAL (lib/slug.mjs): nunca se confía en el LLM
 *    para producir URLs, así no se puede crear una ruta inválida.
 *  - Conserva el slug actual como idioma raíz (en): NO rompe URLs ya indexadas.
 *
 * Uso:
 *   node scripts/backfill-category-i18n.mjs             # rellena lo que falte
 *   node scripts/backfill-category-i18n.mjs --dry-run   # solo muestra el plan
 *   node scripts/backfill-category-i18n.mjs --force     # re-traduce todo
 *   node scripts/backfill-category-i18n.mjs --limit 5   # máximo N categorías
 *
 * Requiere en .env*: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEEPSEEK_API_KEY.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Núcleo de traducción COMPARTIDO con la app: mismo prompt, misma llamada y
// misma fusión (fuente única: lib/i18n-translate.mjs). Cero duplicación.
import {
  TARGET_LOCALES,
  toLocaleMap,
  buildCategoryMessages,
  parseTranslationResponse,
  requestTranslation,
  mergeCategoryTranslations,
} from '../lib/i18n-translate.mjs'

config({ path: ['.env.development.local', '.env.local', '.env'] })

// ⚠️ Deben coincidir con lib/constants.ts (los scripts .mjs no importan TS):
// mismo patrón documentado que app/sitemap.ts con SITEMAP_REVALIDATE_SECONDS.
const TRANSLATION_TEMPERATURE = 0.2
const TRANSLATION_MAX_TOKENS = 1600
const TRANSLATION_MODEL = 'deepseek-chat'

// TARGET_LOCALES (idiomas destino) se importa de lib/i18n-translate.mjs:
// el idioma raíz no se traduce, se hereda del dato actual `name`/`slug`.

const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const API_URL = `${DEEPSEEK_BASE_URL}/chat/completions`

/** Logs con color, coherentes con supabase/run.mjs (mismo estilo de salida). */
function logStep(message) { console.log(`\n\x1b[1;36m▶ ${message}\x1b[0m`) }
function logOk(message) { console.log(`  \x1b[1;32m✓\x1b[0m ${message}`) }
function logSkip(message) { console.log(`  \x1b[1;33m•\x1b[0m ${message}`) }
function logError(message) { console.error(`  \x1b[1;31m✗\x1b[0m ${message}`) }

/** Imprime la ayuda de uso. */
function printUsage() {
  console.log(`
Uso: node scripts/backfill-category-i18n.mjs [opciones]

Opciones:
  --dry-run        Muestra el plan sin llamar al LLM ni escribir en Supabase.
  --force          Re-traduce TODAS las categorías (ignora lo ya guardado).
  --limit <n>      Procesa como máximo n categorías pendientes.
  -h, --help       Muestra esta ayuda.
`)
}

/**
 * Parsea los argumentos de línea de comandos.
 * @param {string[]} argv Argumentos (sin node ni el nombre del script).
 * @returns {{ dryRun: boolean, force: boolean, limit: number, help: boolean }}
 */
function parseArgs(argv) {
  const args = { dryRun: false, force: false, limit: 0, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i]
    if (current === '--dry-run') args.dryRun = true
    else if (current === '--force') args.force = true
    else if (current === '--help' || current === '-h') args.help = true
    else if (current === '--limit') { args.limit = Number(argv[i + 1]) || 0; i += 1 }
  }
  return args
}

/**
 * Idiomas que faltan por rellenar en una categoría.
 * Solo evalúa los idiomas DESTINO: el idioma raíz (inglés) no se traduce, se
 * hereda del dato actual `name`/`slug` (así no se gasta un idioma extra por
 * categoría y su URL ya indexada se conserva intacta).
 * @param {any} row Fila de `categories`.
 * @param {boolean} force TRUE = considera pendientes TODOS los idiomas destino.
 * @returns {string[]} Locales destino con nombre o slug vacío.
 */
function missingLocales(row, force) {
  const names = toLocaleMap(row.name_i18n)
  const slugs = toLocaleMap(row.slug_i18n)
  return TARGET_LOCALES.filter((locale) => {
    if (force) return true
    const name = typeof names[locale] === 'string' ? names[locale].trim() : ''
    const slug = typeof slugs[locale] === 'string' ? slugs[locale].trim() : ''
    return !name || !slug
  })
}

// Traducción delegada al núcleo compartido lib/i18n-translate.mjs
// (buildCategoryMessages + requestTranslation + parseTranslationResponse).

// Fusión con el estado actual delegada al núcleo compartido
// (mergeCategoryTranslations: conserva el idioma raíz y genera slugs locales).

/**
 * Orquesta el backfill: lee categorías, traduce solo lo que falta y actualiza.
 * Idempotente: se puede re-ejecutar sin volver a gastar tokens en lo ya hecho.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = (process.env.DEEPSEEK_API_KEY ?? '').trim()

  if (!supabaseUrl || !serviceKey) {
    logError('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el archivo .env*.')
    process.exit(1)
  }
  if (!args.dryRun && !apiKey) {
    logError('Falta DEEPSEEK_API_KEY. Usa --dry-run para inspeccionar sin traducir.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Salvaguarda: mostrar SIEMPRE a qué proyecto se va a escribir. Con varios
  // archivos .env (dev/prod) es fácil aplicar el backfill al entorno equivocado.
  logOk('Proyecto Supabase destino: ' + (() => {
    try {
      return new URL(supabaseUrl).host
    } catch {
      return String(supabaseUrl)
    }
  })())

  logStep('Leyendo categorías…')
  const { data: rows, error } = await supabase
    .from('categories')
    .select('id,name,slug,description,name_i18n,slug_i18n,description_i18n')
    .order('name')
  if (error) {
    logError(error.message)
    process.exit(1)
  }

  const todas = rows ?? []
  const pendientes = todas.filter((row) => missingLocales(row, args.force).length > 0)
  logOk(`${todas.length} categorías leídas · ${pendientes.length} por completar.`)

  if (pendientes.length === 0) {
    logSkip('Nada por hacer: todas las categorías ya están internacionalizadas.')
    return
  }

  const lote = args.limit > 0 ? pendientes.slice(0, args.limit) : pendientes
  if (args.limit > 0 && pendientes.length > lote.length) {
    logSkip(`--limit ${args.limit}: se procesan ${lote.length} de ${pendientes.length} pendientes.`)
  }

  let actualizadas = 0
  let fallidas = 0

  for (const [index, row] of lote.entries()) {
    const missing = missingLocales(row, args.force)
    const etiqueta = `[${index + 1}/${lote.length}] ${row.name} (${row.slug}) → ${missing.join(', ')}`

    if (args.dryRun) {
      logSkip(`DRY-RUN ${etiqueta}`)
      continue
    }

    // Llamada al motor de traducción (núcleo compartido con la app).
    const respuesta = await requestTranslation({
      apiKey,
      apiUrl: API_URL,
      model: TRANSLATION_MODEL,
      temperature: TRANSLATION_TEMPERATURE,
      maxTokens: TRANSLATION_MAX_TOKENS,
      messages: buildCategoryMessages({
        nombre: row.name,
        descripcion: row.description ?? '',
        locales: missing,
      }),
    })
    if (!respuesta.success) {
      logError(`${etiqueta}: ${respuesta.error}`)
      fallidas += 1
      continue
    }

    const parsed = parseTranslationResponse(respuesta.text)
    if (!parsed.success) {
      logError(`${etiqueta}: ${parsed.error}`)
      fallidas += 1
      continue
    }

    // Fusión con el estado actual (el idioma raíz conserva `name`/`slug`).
    const mapas = mergeCategoryTranslations(row, parsed.data)
    const { error: updateError } = await supabase
      .from('categories')
      .update(mapas)
      .eq('id', row.id)

    if (updateError) {
      logError(`${etiqueta}: ${updateError.message}`)
      fallidas += 1
      continue
    }

    logOk(etiqueta)
    actualizadas += 1
  }

  logStep('Resumen')
  logOk(`Actualizadas: ${actualizadas}`)
  if (fallidas > 0) logError(`Fallidas: ${fallidas}`)
  if (args.dryRun) logSkip('Modo --dry-run: no se escribió nada en la base de datos.')
}

main().catch((error) => {
  logError(`Error fatal: ${error?.message ?? error}`)
  process.exit(1)
})
