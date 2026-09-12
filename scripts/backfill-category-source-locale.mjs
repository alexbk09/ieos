#!/usr/bin/env node
/**
 * Backfill del NOMBRE de categoría en el idioma RAÍZ (español).
 * ------------------------------------------------------------------
 * Repara la data heredada del pipeline antiguo: las categorías se crearon con el
 * nombre de la keyword (en inglés) mientras el sistema ya declaraba un idioma
 * raíz en ESPAÑOL. Como `name_i18n[SOURCE_LOCALE]` se hereda del dato base, ese
 * nombre inglés se servía en la web por defecto (filtro del catálogo, portada y
 * hubs en español).
 *
 * QUÉ hace y QUÉ NO:
 *  - Redacta con el LLM (una llamada corta por categoría, solo si hace falta) el
 *    nombre en el idioma raíz y lo escribe en `name` + `name_i18n[es]`.
 *  - NO toca `slug`/`slug_i18n`: la URL ya indexada nunca cambia.
 *  - NO toca los idiomas ya traducidos (en/fr/de/it/pt quedan intactos).
 *  - Idempotente y de bajo coste: usa la MISMA detección que el panel admin
 *    (lib/i18n-translate.mjs) y NO llama al modelo si el nombre ya está al día.
 *
 * Uso:
 *   node scripts/backfill-category-source-locale.mjs            # repara lo pendiente
 *   node scripts/backfill-category-source-locale.mjs --dry-run  # solo muestra el plan
 *   node scripts/backfill-category-source-locale.mjs --force    # re-redacta todo
 *   node scripts/backfill-category-source-locale.mjs --limit 5  # máximo N
 *
 * Requiere en .env*: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEEPSEEK_API_KEY.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Núcleo COMPARTIDO con la app: mismo prompt, misma fusión y misma detección de
// pendientes (fuente única: lib/i18n-translate.mjs). Cero duplicación.
import {
  buildSourceLocaleNameMessages,
  isSourceLocaleNamePending,
  mergeSourceLocaleName,
  parseSourceLocaleName,
  requestTranslation,
} from '../lib/i18n-translate.mjs'

config({ path: ['.env.development.local', '.env.local', '.env'] })

// ⚠️ Deben coincidir con lib/constants.ts (los scripts .mjs no importan TS):
// mismo patrón documentado que scripts/backfill-category-i18n.mjs.
const TRANSLATION_TEMPERATURE = 0.2
// El nombre es una línea corta (2-5 palabras): no necesita el presupuesto de 8k
// del traductor de fichas completas (TRANSLATION_NAME_MAX_TOKENS en constants).
const TRANSLATION_NAME_MAX_TOKENS = 400
const TRANSLATION_MODEL = 'deepseek-chat'
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const API_URL = `${DEEPSEEK_BASE_URL}/chat/completions`

/** Logs con color, coherentes con los demás scripts del proyecto. */
function logStep(message) { console.log(`\n\x1b[1;36m▶ ${message}\x1b[0m`) }
function logOk(message) { console.log(`  \x1b[1;32m✓\x1b[0m ${message}`) }
function logSkip(message) { console.log(`  \x1b[1;33m•\x1b[0m ${message}`) }
function logError(message) { console.error(`  \x1b[1;31m✗\x1b[0m ${message}`) }

/** Imprime la ayuda de uso. */
function printUsage() {
  console.log(`
Uso: node scripts/backfill-category-source-locale.mjs [opciones]

Opciones:
  --dry-run        Muestra el plan sin llamar al LLM ni escribir en Supabase.
  --force          Re-redacta el nombre aunque ya esté en el idioma raíz.
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
 * Redacta en el idioma raíz el nombre de una categoría.
 * @param {{ apiKey: string, nombre: string }} input Clave del motor y nombre origen.
 * @returns {Promise<{ success: true, name: string } | { success: false, error: string }>}
 */
async function redactarNombre({ apiKey, nombre }) {
  const respuesta = await requestTranslation({
    apiKey,
    apiUrl: API_URL,
    model: TRANSLATION_MODEL,
    temperature: TRANSLATION_TEMPERATURE,
    maxTokens: TRANSLATION_NAME_MAX_TOKENS,
    messages: buildSourceLocaleNameMessages({ nombre }),
  })
  if (!respuesta.success) return respuesta
  return parseSourceLocaleName(respuesta.text)
}

/**
 * Orquesta el backfill: lee las categorías, redacta el nombre pendiente en el
 * idioma raíz y actualiza SOLO el dato base + su clave del JSONB.
 * Idempotente: re-ejecutarlo no vuelve a gastar tokens en lo ya corregido.
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

  logStep('Leyendo categorías...')
  const { data: rows, error } = await supabase
    .from('categories')
    // Proyección mínima: nombre base, slug (identidad de ruta) y traducciones.
    .select('id,name,slug,name_i18n')
    .order('name')

  if (error) {
    // Un entorno sin la migración 0049 no tiene columnas i18n: mejor un aviso
    // claro que un fallo con la traza de Postgres.
    logError(
      error.message.includes('name_i18n')
        ? 'Este entorno no tiene las columnas i18n (migración 0049): no hay data que reparar.'
        : error.message,
    )
    process.exit(1)
  }

  const todas = rows ?? []
  const pendientes = todas
    .filter((row) => args.force || isSourceLocaleNamePending(row))
    .slice(0, args.limit > 0 ? args.limit : undefined)

  logOk(`${todas.length} categorías leídas · ${pendientes.length} por redactar en el idioma raíz.`)
  if (args.dryRun) {
    for (const row of pendientes) logSkip(`${row.name}  (slug: ${row.slug})`)
    logStep('Dry-run: no se llamó al modelo ni se escribió en Supabase.')
    return
  }

  logStep('Redactando nombres en el idioma raíz...')
  let actualizadas = 0
  let sinCambios = 0
  let errores = 0

  for (const row of pendientes) {
    const redactado = await redactarNombre({ apiKey, nombre: row.name })
    if (!redactado.success) {
      errores += 1
      logError(`${row.name}: ${redactado.error}`)
      continue
    }

    const cambios = mergeSourceLocaleName(row, redactado.name)
    // Mismo texto (ej: un nombre idéntico en ambos idiomas): no se escribe nada.
    if (!cambios || cambios.name === row.name) {
      sinCambios += 1
      logSkip(`${row.name}: ya estaba correcto.`)
      continue
    }

    const { error: updateError } = await supabase
      .from('categories')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (updateError) {
      errores += 1
      logError(`${row.name}: ${updateError.message}`)
      continue
    }

    actualizadas += 1
    logOk(`${row.name}  →  ${cambios.name}`)
  }

  logStep('Resumen')
  logOk(`${actualizadas} categorías actualizadas · ${sinCambios} sin cambios · ${errores} errores.`)
  if (actualizadas > 0) {
    logOk('Los slugs no se tocaron: las URLs indexadas siguen intactas.')
  }
}

main().catch((err) => {
  logError(err?.message ?? 'Error inesperado en el backfill.')
  process.exit(1)
})

