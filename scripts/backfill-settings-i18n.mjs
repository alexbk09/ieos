#!/usr/bin/env node
/**
 * Backfill de internacionalización de los TEXTOS CONFIGURABLES (migración 0053).
 * ------------------------------------------------------------------
 * Traduce los textos de `site_settings` (marca, eslogan, menú, hero, "cómo
 * funciona", contacto, footer y homepage_config) a los idiomas soportados y los
 * guarda en `site_settings.i18n[locale]`, reutilizando el motor de traducción
 * (DeepSeek) ya usado para categorías/productos. Idempotente: solo traduce los
 * idiomas que FALTAN (salvo --force).
 *
 * Uso:
 *   node scripts/backfill-settings-i18n.mjs             # rellena lo que falte
 *   node scripts/backfill-settings-i18n.mjs --dry-run   # solo muestra el plan
 *   node scripts/backfill-settings-i18n.mjs --force     # re-traduce todo
 *
 * Requiere en .env*: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEEPSEEK_API_KEY.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Núcleo de traducción COMPARTIDO con la app (misma llamada al modelo y parseo).
import { TARGET_LOCALES, toLocaleMap, parseTranslationResponse, requestTranslation } from '../lib/i18n-translate.mjs'
// Campos traducibles (fuente única) y fusión base ← override.
import { TRANSLATABLE_SETTINGS_KEYS } from '../lib/site-settings-i18n.mjs'

config({ path: ['.env.development.local', '.env.local', '.env'] })

// ⚠️ Deben coincidir con lib/constants.ts (los scripts .mjs no importan TS).
const TRANSLATION_TEMPERATURE = 0.2
const TRANSLATION_MAX_TOKENS = 3000
const TRANSLATION_MODEL = 'deepseek-chat'

const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const API_URL = `${DEEPSEEK_BASE_URL}/chat/completions`

/** Logs con color, coherentes con el resto de scripts. */
function logStep(message) { console.log(`\n\x1b[1;36m▶ ${message}\x1b[0m`) }
function logOk(message) { console.log(`  \x1b[1;32m✓\x1b[0m ${message}`) }
function logSkip(message) { console.log(`  \x1b[1;33m•\x1b[0m ${message}`) }
function logError(message) { console.error(`  \x1b[1;31m✗\x1b[0m ${message}`) }

/** Imprime la ayuda de uso. */
function printUsage() {
  console.log(`
Uso: node scripts/backfill-settings-i18n.mjs [opciones]

Opciones:
  --dry-run        Muestra el plan sin llamar al LLM ni escribir en Supabase.
  --force          Re-traduce TODOS los idiomas (ignora lo ya guardado).
  -h, --help       Muestra esta ayuda.
`)
}

/**
 * Parsea los argumentos de línea de comandos.
 * @param {string[]} argv Argumentos (sin node ni el nombre del script).
 * @returns {{ dryRun: boolean, force: boolean, help: boolean }}
 */
function parseArgs(argv) {
  const args = { dryRun: false, force: false, help: false }
  for (const current of argv) {
    if (current === '--dry-run') args.dryRun = true
    else if (current === '--force') args.force = true
    else if (current === '--help' || current === '-h') args.help = true
  }
  return args
}

/**
 * Extrae SOLO los campos traducibles de la configuración (idioma base).
 * @param {Record<string, any>} settings Fila de site_settings.
 * @returns {Record<string, any>} Subárbol con los textos a traducir.
 */
function pickTranslatable(settings) {
  const payload = {}
  for (const key of TRANSLATABLE_SETTINGS_KEYS) {
    if (settings[key] !== undefined && settings[key] !== null) payload[key] = settings[key]
  }
  return payload
}

/**
 * Mensajes del modelo para traducir los textos configurables.
 * Traduce solo valores de texto; conserva claves, estructura y URLs.
 * @param {Record<string, any>} payload Subárbol traducible (idioma base).
 * @param {string[]} locales Idiomas destino.
 * @returns {{ role: 'system'|'user', content: string }[]}
 */
function buildSettingsMessages(payload, locales) {
  const system =
    'Eres traductor profesional de e-commerce. Recibes un JSON con los textos CONFIGURABLES de una tienda ' +
    '(marca, eslogan, menu, portada, "como funciona", contacto, footer y configuracion del inicio). ' +
    'Traduce UNICAMENTE los valores de texto a los idiomas pedidos. ' +
    'REGLAS: 1) Conserva EXACTAMENTE las claves y la estructura del JSON. ' +
    '2) NO traduzcas valores tecnicos: URLs (http, /, #, mailto:), numeros, monedas, emojis ni identificadores ' +
    '(id, type, layout, href, backgroundType, backgroundSolid, backgroundImage, backgroundGradientFrom/To). ' +
    '3) Manten los acronimos tecnicos en MAYUSCULAS (LED, RGB, USB, WIFI, 3D, SPC). ' +
    '4) Respeta el tono comercial y la brevedad de cada texto. ' +
    '5) Devuelve EXCLUSIVAMENTE JSON valido con la forma {"<idioma>": <objeto traducido>}, ' +
    'usando las claves de idioma exactas solicitadas.'

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({ idiomas_destino: locales, contenido: payload }) },
  ]
}

/** Idiomas destino que aún no tienen overrides (salvo --force). */
function missingLocales(settings, force) {
  const map = toLocaleMap(settings.i18n)
  return TARGET_LOCALES.filter((locale) => (force ? true : !map[locale]))
}

/**
 * Orquesta el backfill: lee site_settings, traduce los textos faltantes y
 * actualiza la columna `i18n` con una sola escritura.
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
  logOk('Proyecto Supabase destino: ' + (() => {
    try { return new URL(supabaseUrl).host } catch { return String(supabaseUrl) }
  })())

  logStep('Leyendo site_settings…')
  const { data: settings, error } = await supabase.from('site_settings').select('*').eq('id', 1).maybeSingle()
  if (error) { logError(error.message); process.exit(1) }
  if (!settings) { logError('No existe la fila site_settings(id=1).'); process.exit(1) }

  const pendientes = missingLocales(settings, args.force)
  if (pendientes.length === 0) {
    logSkip('Nada por hacer: todos los idiomas ya tienen overrides de texto.')
    return
  }
  logOk('Idiomas por completar: ' + pendientes.join(', '))

  if (args.dryRun) {
    for (const locale of pendientes) logSkip(`DRY-RUN se traduciría al idioma "${locale}"`)
    logSkip('Modo --dry-run: no se llamó al modelo ni se escribió en la base de datos.')
    return
  }

  const payload = pickTranslatable(settings)
  const i18n = { ...toLocaleMap(settings.i18n) }
  let ok = 0
  let fallidas = 0

  for (const locale of pendientes) {
    const respuesta = await requestTranslation({
      apiKey,
      apiUrl: API_URL,
      model: TRANSLATION_MODEL,
      temperature: TRANSLATION_TEMPERATURE,
      maxTokens: TRANSLATION_MAX_TOKENS,
      messages: buildSettingsMessages(payload, [locale]),
    })
    if (!respuesta.success) { logError(`${locale}: ${respuesta.error}`); fallidas += 1; continue }

    const parsed = parseTranslationResponse(respuesta.text)
    if (!parsed.success) { logError(`${locale}: ${parsed.error}`); fallidas += 1; continue }

    const traduccion = parsed.data[locale]
    if (!traduccion || typeof traduccion !== 'object') {
      logError(`${locale}: el modelo no devolvió el objeto del idioma.`)
      fallidas += 1
      continue
    }
    i18n[locale] = traduccion
    logOk(`${locale}: textos traducidos (${Object.keys(traduccion).length} secciones).`)
    ok += 1
  }

  if (ok === 0) {
    logError('No se tradujo ningún idioma; no se escribió en la base de datos.')
    process.exit(1)
  }

  const { error: updateError } = await supabase.from('site_settings').update({ i18n }).eq('id', 1)
  if (updateError) { logError(updateError.message); process.exit(1) }

  logStep('Resumen')
  logOk(`Idiomas actualizados: ${ok}`)
  if (fallidas > 0) logError(`Idiomas fallidos: ${fallidas}`)
}

main().catch((error) => {
  logError(`Error fatal: ${error?.message ?? error}`)
  process.exit(1)
})

