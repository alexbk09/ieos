#!/usr/bin/env node
/**
 * Backfill de internacionalización de PRODUCTOS (migración 0050).
 * ------------------------------------------------------------------
 * Rellena la columna JSONB `products.translations` de las fichas EXISTENTES
 * usando el motor de traducción (DeepSeek), con UNA sola llamada por producto.
 *
 * POR QUÉ es idempotente y de bajo coste:
 *  - Solo traduce los idiomas que FALTAN (salvo --force): re-ejecutarlo no gasta.
 *  - Una única petición devuelve TODOS los idiomas pendientes del producto.
 *  - Solo se traducen textos de cara al cliente (nombre + título SEO): nunca
 *    precios, stock ni URLs, así la ficha y el schema JSON-LD no se desincronizan.
 *  - El idioma raíz (es) NO se traduce: se hereda del dato base `name`/`titulo_seo`.
 *
 * ⚠️ Al cambiar `SOURCE_LOCALE` en lib/i18n-config.mjs hay que re-ejecutar con
 * --force para sobrescribir traducciones antiguas etiquetadas con otro idioma.
 *
 * Uso:
 *   node scripts/backfill-product-i18n.mjs             # rellena lo que falte
 *   node scripts/backfill-product-i18n.mjs --dry-run   # solo muestra el plan
 *   node scripts/backfill-product-i18n.mjs --force     # re-traduce todo
 *   node scripts/backfill-product-i18n.mjs --limit 20  # máximo N productos
 *
 * Requiere en .env*: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEEPSEEK_API_KEY.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Núcleo de traducción COMPARTIDO con la app: mismo prompt, misma llamada y
// misma fusión (fuente única: lib/i18n-translate.mjs). Cero duplicación.
import {
  missingProductLocales,
  buildProductMessages,
  parseTranslationResponse,
  requestTranslation,
  mergeProductTranslations,
} from '../lib/i18n-translate.mjs'

config({ path: ['.env.development.local', '.env.local', '.env'] })

// ⚠️ Deben coincidir con lib/constants.ts (los scripts .mjs no importan TS):
// mismo patrón documentado que app/sitemap.ts con SITEMAP_REVALIDATE_SECONDS.
const TRANSLATION_TEMPERATURE = 0.2
// 8000 tokens: debe cubrir todos los idiomas pendientes con su contenido completo
// (nombre + título SEO + descripción HTML + FAQ) en una sola respuesta.
const TRANSLATION_MAX_TOKENS = 8000
const TRANSLATION_MODEL = 'deepseek-chat'

const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const API_URL = `${DEEPSEEK_BASE_URL}/chat/completions`

/** Logs con color, coherentes con el resto de scripts (mismo estilo de salida). */
function logStep(message) { console.log(`\n\x1b[1;36m▶ ${message}\x1b[0m`) }
function logOk(message) { console.log(`  \x1b[1;32m✓\x1b[0m ${message}`) }
function logSkip(message) { console.log(`  \x1b[1;33m•\x1b[0m ${message}`) }
function logError(message) { console.error(`  \x1b[1;31m✗\x1b[0m ${message}`) }

/** Imprime la ayuda de uso. */
function printUsage() {
  console.log(`
Uso: node scripts/backfill-product-i18n.mjs [opciones]

Opciones:
  --dry-run        Muestra el plan sin llamar al LLM ni escribir en Supabase.
  --force          Re-traduce TODOS los productos (ignora lo ya guardado).
  --limit <n>      Procesa como máximo n productos pendientes.
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

// La detección de idiomas pendientes vive en lib/i18n-translate.mjs
// (missingProductLocales): la MISMA lógica que usa el botón "Traducir pendientes"
// del panel admin, para que backfill y panel nunca se desincronicen.

/**
 * Orquesta el backfill: lee productos, traduce solo lo que falta y actualiza.
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

  // Salvaguarda: mostrar SIEMPRE a qué proyecto se va a escribir.
  logOk('Proyecto Supabase destino: ' + (() => {
    try {
      return new URL(supabaseUrl).host
    } catch {
      return String(supabaseUrl)
    }
  })())

  logStep('Leyendo productos…')
  const { data: rows, error } = await supabase
    .from('products')
    .select('id,name,slug,titulo_seo,description,seo_faq,translations')
    .order('created_at', { ascending: false })
  if (error) {
    logError(error.message)
    process.exit(1)
  }

  const todos = rows ?? []
  const pendientes = todos.filter((row) => missingProductLocales(row, args.force).length > 0)
  logOk(`${todos.length} productos leídos · ${pendientes.length} por completar.`)

  if (pendientes.length === 0) {
    logSkip('Nada por hacer: todos los productos ya están internacionalizados.')
    return
  }

  const lote = args.limit > 0 ? pendientes.slice(0, args.limit) : pendientes
  if (args.limit > 0 && pendientes.length > lote.length) {
    logSkip(`--limit ${args.limit}: se procesan ${lote.length} de ${pendientes.length} pendientes.`)
  }

  let actualizados = 0
  let fallidas = 0

  for (const [index, row] of lote.entries()) {
    const missing = missingProductLocales(row, args.force)
    const etiqueta = `[${index + 1}/${lote.length}] ${row.name} (${row.slug}) → ${missing.join(', ')}`

    if (args.dryRun) {
      logSkip(`DRY-RUN ${etiqueta}`)
      continue
    }

    const respuesta = await requestTranslation({
      apiKey,
      apiUrl: API_URL,
      model: TRANSLATION_MODEL,
      temperature: TRANSLATION_TEMPERATURE,
      maxTokens: TRANSLATION_MAX_TOKENS,
      messages: buildProductMessages({
        nombre: row.name,
        tituloSeo: row.titulo_seo,
        descripcion: row.description ?? null,
        seoFaq: row.seo_faq ?? null,
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

    // Fusión con el estado actual (conserva traducciones previas y el raíz).
    const translations = mergeProductTranslations(row.translations, parsed.data)
    const { error: updateError } = await supabase
      .from('products')
      .update({ translations })
      .eq('id', row.id)

    if (updateError) {
      logError(`${etiqueta}: ${updateError.message}`)
      fallidas += 1
      continue
    }

    logOk(etiqueta)
    actualizados += 1
  }

  logStep('Resumen')
  logOk(`Actualizados: ${actualizados}`)
  if (fallidas > 0) logError(`Fallidos: ${fallidas}`)
  if (args.dryRun) logSkip('Modo --dry-run: no se escribió nada en la base de datos.')
}

main().catch((error) => {
  logError(`Error fatal: ${error?.message ?? error}`)
  process.exit(1)
})

