#!/usr/bin/env node
/**
 * Backfill de internacionalización de ENTRADAS SEO (guías y comparativas).
 * ------------------------------------------------------------------
 * Rellena las columnas JSONB `titulo_i18n`, `slug_i18n`, `resumen_i18n`,
 * `cuerpo_html_i18n` y `faq_i18n` de las entradas EXISTENTES usando el motor de
 * traducción (DeepSeek), con los MISMOS mensajes que la app
 * (`lib/i18n-translate.mjs`: fuente única, cero duplicación).
 *
 * POR QUÉ es idempotente y de bajo coste:
 *  - Solo traduce los idiomas que FALTAN (salvo --force): re-ejecutarlo no gasta.
 *  - Traduce en LOTES de idiomas (TRANSLATION_LOCALE_BATCH_SIZE) porque el
 *    cuerpo HTML es largo: pedir 5 idiomas en UNA respuesta la cortaría.
 *  - El idioma raíz (es) NO se traduce: se hereda de los campos base.
 *
 * ⚠️ Al cambiar `SOURCE_LOCALE` en lib/i18n-config.mjs hay que re-ejecutar con
 * --force para sobrescribir traducciones antiguas etiquetadas con otro idioma.
 *
 * Uso:
 *   node scripts/backfill-entries-i18n.mjs              # rellena lo que falte
 *   node scripts/backfill-entries-i18n.mjs --dry-run    # solo muestra el plan
 *   node scripts/backfill-entries-i18n.mjs --force      # re-traduce todo
 *   node scripts/backfill-entries-i18n.mjs --limit 5    # máximo N entradas
 *
 * Requiere en .env*: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEEPSEEK_API_KEY.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Núcleo de traducción COMPARTIDO con la app (mismo prompt, misma fusión).
import {
  buildEntryMessages,
  chunkLocales,
  mergeEntryTranslations,
  missingEntryLocales,
  parseTranslationResponse,
  requestTranslation,
} from '../lib/i18n-translate.mjs'

config({ path: ['.env.development.local', '.env.local', '.env'] })

// ⚠️ Deben coincidir con lib/constants.ts (los scripts .mjs no importan TS):
// mismo patrón documentado en app/sitemap.ts con SITEMAP_REVALIDATE_SECONDS.
const TRANSLATION_TEMPERATURE = 0.2
const TRANSLATION_MAX_TOKENS = 8000
const TRANSLATION_MODEL = 'deepseek-chat'
/** Idiomas por llamada: el cuerpo HTML es largo y varios idiomas lo desbordan. */
const TRANSLATION_LOCALE_BATCH_SIZE = 2

const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const API_URL = `${DEEPSEEK_BASE_URL}/chat/completions`

/** Columnas necesarias: datos base + traducciones ya guardadas. */
const ENTRY_SELECT = 'id,titulo,slug,resumen,cuerpo_html,faq,titulo_i18n,slug_i18n,resumen_i18n,cuerpo_html_i18n,faq_i18n'

/** Logs con color, coherentes con el resto de scripts del proyecto. */
function logStep(message) { console.log(`\n\x1b[1;36m▶ ${message}\x1b[0m`) }
function logOk(message) { console.log(`  \x1b[1;32m✓\x1b[0m ${message}`) }
function logSkip(message) { console.log(`  \x1b[1;33m•\x1b[0m ${message}`) }
function logError(message) { console.error(`  \x1b[1;31m✗\x1b[0m ${message}`) }

/** Imprime la ayuda de uso. */
function printUsage() {
  console.log(`
Uso: node scripts/backfill-entries-i18n.mjs [opciones]

Opciones:
  --dry-run        Muestra el plan sin llamar al LLM ni escribir en Supabase.
  --force          Re-traduce TODAS las entradas (ignora lo ya guardado).
  --limit <n>      Procesa como máximo n entradas pendientes.
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

/** Reintentos por entrada: el modelo a veces omite un campo y hay que repetirlo. */
const REINTENTOS_POR_ENTRADA = 2

/** Máximo de sufijos numéricos probados al resolver una colisión de slug. */
const INTENTOS_SLUG_LIBRE = 3

/**
 * Extrae el idioma del índice único violado (p. ej. `idx_seo_entries_slug_i18n_en`).
 * @param {unknown} message Mensaje de error de Postgres.
 * @returns {string} Código de idioma o '' si el error no es una colisión de slug.
 */
function localeDeColision(message) {
  const match = /slug_i18n_([a-z]{2})/.exec(String(message ?? ''))
  return match ? match[1] : ''
}

/**
 * Guarda los mapas traducidos resolviendo COLISIONES de slug localizado.
 * ------------------------------------------------------------------
 * POR QUÉ: la tabla tiene índices únicos por (idioma, slug_i18n). Dos entradas
 * con títulos casi idénticos producen el MISMO slug traducido y el UPDATE falla
 * con "duplicate key value violates unique constraint" → la entrada se quedaba
 * sin traducir para siempre. Aquí se reintenta con un sufijo numérico en el
 * idioma que colisiona, así la traducción nunca se pierde.
 * @param {any} supabase Cliente con service role.
 * @param {any} row Fila original (para el `id`).
 * @param {any} mapas Columnas *_i18n ya fusionadas.
 * @returns {Promise<{ error: any }>} error null si se guardó.
 */
async function guardarEntrada(supabase, row, mapas) {
  let actuales = mapas

  for (let intento = 0; intento < INTENTOS_SLUG_LIBRE; intento += 1) {
    const { error } = await supabase.from('seo_entries').update(actuales).eq('id', row.id)
    if (!error) return { error: null }

    const locale = localeDeColision(error.message)
    const slugPrevio = locale ? String(actuales.slug_i18n?.[locale] ?? '') : ''
    if (!locale || !slugPrevio) return { error }

    logSkip(`  slug localizado "${slugPrevio}" (${locale}) ya existe: se reintenta con sufijo.`)
    actuales = {
      ...actuales,
      slug_i18n: { ...actuales.slug_i18n, [locale]: `${slugPrevio}-${intento + 2}` },
    }
  }

  return { error: { message: 'No se pudo resolver la colisión de slug localizado.' } }
}

/**
 * Traduce UN conjunto de idiomas pendientes de una entrada (una pasada).
 * Acumula los mapas lote a lote para que el llamador escriba UNA sola vez.
 * @param {{ apiKey: string, row: any, locales: string[], mapas: any }} input
 * @returns {Promise<{ mapas: any, fallo: string|null }>}
 */
async function traducirPasada({ apiKey, row, locales, mapas }) {
  let actuales = mapas
  for (const idiomas of chunkLocales(locales, TRANSLATION_LOCALE_BATCH_SIZE)) {
    const respuesta = await requestTranslation({
      apiKey,
      apiUrl: API_URL,
      model: TRANSLATION_MODEL,
      temperature: TRANSLATION_TEMPERATURE,
      maxTokens: TRANSLATION_MAX_TOKENS,
      messages: buildEntryMessages({
        titulo: row.titulo,
        resumen: row.resumen ?? '',
        cuerpoHtml: row.cuerpo_html ?? '',
        faq: row.faq ?? null,
        locales: idiomas,
      }),
    })
    if (!respuesta.success) return { mapas: actuales, fallo: respuesta.error }
    // Corte por límite de tokens: mensaje claro e identificando el lote.
    if (respuesta.finishReason === 'length') {
      return { mapas: actuales, fallo: `corte por límite de tokens en [${idiomas.join(', ')}]` }
    }

    const parsed = parseTranslationResponse(respuesta.text)
    if (!parsed.success) {
      return { mapas: actuales, fallo: `${parsed.error} Lote: [${idiomas.join(', ')}]` }
    }

    actuales = mergeEntryTranslations({ ...row, ...actuales }, parsed.data)
  }
  return { mapas: actuales, fallo: null }
}

/**
 * Orquesta el backfill: lee entradas, traduce solo lo que falta y actualiza.
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

  logStep('Leyendo entradas SEO…')
  const { data: rows, error } = await supabase
    .from('seo_entries')
    .select(ENTRY_SELECT)
    .order('updated_at', { ascending: false })
  if (error) {
    logError(`No se pudieron leer las entradas: ${error.message}`)
    process.exit(1)
  }

  const todas = rows ?? []
  // La detección de pendientes vive en lib/i18n-translate.mjs (missingEntryLocales):
  // la MISMA lógica que usa el botón "Traducir" del panel admin.
  const pendientes = todas.filter((row) => missingEntryLocales(row, args.force).length > 0)
  logOk(`${todas.length} entradas leídas · ${pendientes.length} por completar.`)

  const lote = args.limit > 0 ? pendientes.slice(0, args.limit) : pendientes
  if (lote.length === 0) {
    logSkip('Nada que traducir: todas las entradas están completas.')
    return
  }

  if (args.dryRun) {
    for (const row of lote) {
      logSkip(`${row.slug} → ${missingEntryLocales(row, args.force).join(', ')}`)
    }
    logOk('Dry-run terminado: no se llamó al modelo ni se escribió en Supabase.')
    return
  }

  let correctas = 0
  let fallidas = 0

  for (const [indice, row] of lote.entries()) {
    let pendientes = missingEntryLocales(row, args.force)
    const etiqueta = `[${indice + 1}/${lote.length}] ${row.slug} → ${pendientes.join(', ')}`

    // Los mapas se acumulan y se guardan UNA sola vez (una única escritura).
    let mapas = mergeEntryTranslations(row, {})
    let fallo = null

    // Reintentos: si el modelo omite un campo, se vuelve a pedir SOLO lo que
    // sigue pendiente (los idiomas ya completos no se vuelven a traducir).
    for (let intento = 0; intento < REINTENTOS_POR_ENTRADA && pendientes.length > 0; intento += 1) {
      const pasada = await traducirPasada({ apiKey, row, locales: pendientes, mapas })
      mapas = pasada.mapas
      if (pasada.fallo) {
        fallo = pasada.fallo
        break
      }
      // Verificación REAL tras fusionar: solo se dan por buenos los idiomas que
      // ya no faltan (antes se guardaba una traducción parcial en silencio).
      pendientes = missingEntryLocales({ ...row, ...mapas })
    }

    if (fallo) {
      fallidas += 1
      logError(`${etiqueta}: ${fallo}`)
      continue
    }

    if (pendientes.length > 0) {
      fallidas += 1
      logError(`${etiqueta}: quedó INCOMPLETA, siguen pendientes [${pendientes.join(', ')}]`)
      continue
    }

    const { error: updateError } = await guardarEntrada(supabase, row, mapas)
    if (updateError) {
      fallidas += 1
      logError(`${etiqueta}: ${updateError.message}`)
      continue
    }

    correctas += 1
    logOk(etiqueta)
  }

  logStep('Resultado')
  logOk(`Entradas traducidas: ${correctas}` + (fallidas > 0 ? ` · fallidas: ${fallidas}` : ''))
  if (fallidas > 0) process.exitCode = 1
}

main().catch((err) => {
  logError(err?.message ?? String(err))
  process.exit(1)
})
