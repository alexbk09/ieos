#!/usr/bin/env node
/**
 * Backfill de traducciones del CONTENIDO LEGAL a los 6 idiomas.
 * ------------------------------------------------------------------
 * El cuerpo de los documentos legales (términos, privacidad y aviso de
 * afiliado) vive en el CÓDIGO, no en Supabase: su traducción se genera aquí y
 * se versiona en el repositorio (`lib/i18n/legal/<locale>.mjs`), de modo que las
 * páginas se sirven estáticas (ISR) sin coste por visita.
 *
 * Cómo funciona:
 *  - Reutiliza el núcleo puro `lib/legal-i18n.mjs`: MISMO prompt y MISMA fusión
 *    validada que usa la app (una sola fuente, cero duplicación).
 *  - UNA llamada por (idioma, documento): cada documento ronda los 6 KB y así la
 *    respuesta nunca se corta por límite de tokens.
 *  - Idempotente: solo traduce lo que falta (salvo --force), así que re-ejecutar
 *    el script no gasta tokens en lo ya traducido.
 *  - Valida la ESTRUCTURA de cada sección antes de guardarla: si el modelo
 *    altera el número de párrafos o de ítems de una lista, esa sección se
 *    descarta y la web sirve el idioma raíz (nunca una página a medias).
 *
 * Uso:
 *   node scripts/backfill-legal-i18n.mjs                  # traduce lo pendiente
 *   node scripts/backfill-legal-i18n.mjs --dry-run        # solo muestra el plan
 *   node scripts/backfill-legal-i18n.mjs --force          # re-traduce todo
 *   node scripts/backfill-legal-i18n.mjs --only=fr,de     # solo esos idiomas
 *   node scripts/backfill-legal-i18n.mjs --doc=terms      # solo ese documento
 *
 * Requiere en .env*: DEEPSEEK_API_KEY (opcional DEEPSEEK_BASE_URL).
 */

import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'

// DATA legal pura (fuente única) + núcleo de traducción validada.
import { AFFILIATE_DOCUMENT, PRIVACY_DOCUMENT, TERMS_DOCUMENT } from '../lib/legal-content-data.mjs'
import {
  LEGAL_MESSAGES,
  buildLegalMessages,
  mergeLegalTranslations,
  missingLegalParts,
} from '../lib/legal-i18n.mjs'
import { TARGET_LOCALES, parseTranslationResponse, requestTranslation } from '../lib/i18n-translate.mjs'

config({ path: ['.env.development.local', '.env.local', '.env'] })

// ⚠️ Deben coincidir con lib/constants.ts (los scripts .mjs no importan TS):
// mismo patrón documentado en app/sitemap.ts con SITEMAP_REVALIDATE_SECONDS.
const TRANSLATION_TEMPERATURE = 0.2
// 8000 tokens: un documento legal completo + su JSON estructural cabe de sobra.
const TRANSLATION_MAX_TOKENS = 8000
const TRANSLATION_MODEL = 'deepseek-chat'

const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/+$/, '')
const API_URL = `${DEEPSEEK_BASE_URL}/chat/completions`

/** Carpeta destino de los diccionarios legales por idioma. */
const DEST_DIR = path.join('lib', 'i18n', 'legal')

/** Los 3 documentos, en orden de relevancia para el visitante. */
const DOCUMENTS = [AFFILIATE_DOCUMENT, TERMS_DOCUMENT, PRIVACY_DOCUMENT]

/** Logs con color, coherentes con el resto de scripts del proyecto. */
function logStep(message) { console.log(`\n\x1b[1;36m▶ ${message}\x1b[0m`) }
function logOk(message) { console.log(`  \x1b[1;32m✓\x1b[0m ${message}`) }
function logSkip(message) { console.log(`  \x1b[1;33m•\x1b[0m ${message}`) }
function logError(message) { console.error(`  \x1b[1;31m✗\x1b[0m ${message}`) }

/** Imprime la ayuda de uso. */
function printUsage() {
  console.log(`
Uso: node scripts/backfill-legal-i18n.mjs [opciones]

Opciones:
  --dry-run        Muestra el plan sin llamar al LLM ni escribir archivos.
  --force          Re-traduce todos los idiomas (ignora lo ya guardado).
  --only=fr,de     Limita el trabajo a esos idiomas destino.
  --doc=terms      Limita el trabajo a ese documento (terms|privacy|affiliate).
  -h, --help       Muestra esta ayuda.
`)
}

/**
 * Parsea los argumentos de línea de comandos.
 * @param {string[]} argv Argumentos (sin node ni el nombre del script).
 * @returns {{ dryRun: boolean, force: boolean, only: string[], doc: string, help: boolean }}
 */
function parseArgs(argv) {
  const args = { dryRun: false, force: false, only: [], doc: '', help: false }
  for (const current of argv) {
    if (current === '--dry-run') args.dryRun = true
    else if (current === '--force') args.force = true
    else if (current === '--help' || current === '-h') args.help = true
    else if (current.startsWith('--only=')) args.only = current.slice(7).split(',').map((l) => l.trim()).filter(Boolean)
    else if (current.startsWith('--doc=')) args.doc = current.slice(6).trim()
  }
  return args
}

/** Serializa el diccionario del idioma con su cabecera de archivo generado. */
function serialize(locale, dict) {
  const header = `/**
 * Traducciones del contenido LEGAL al idioma "${locale}" (idioma raíz: español).
 * ------------------------------------------------------------------
 * Archivo GENERADO por scripts/backfill-legal-i18n.mjs — NO editar a mano:
 * vuelve a ejecutar el script (npm run i18n:legal) para actualizarlo.
 *
 * Forma: { [docKey]: { summary, sections: { [sectionId]: { title, blocks } } } }.
 * Los bloques conservan la MISMA estructura que el idioma raíz (el validador
 * lib/legal-i18n.mjs descarta cualquier respuesta que no la respete).
 *
 * Vacío a propósito = ese documento aún no tiene traducciones y la web sirve el
 * texto del idioma raíz (nunca una página a medias).
 */
`
  return header + '\nexport default ' + JSON.stringify(dict, null, 2) + '\n'
}

/**
 * Traduce UN documento a UN idioma y devuelve la traducción validada.
 * @param {{ apiKey: string, doc: any, locale: string, actual: any }} input
 * @returns {Promise<{ ok: boolean, entry?: any, error?: string, pendientes: string[] }>}
 */
async function traducirDocumento({ apiKey, doc, locale, actual }) {
  const respuesta = await requestTranslation({
    apiKey,
    apiUrl: API_URL,
    model: TRANSLATION_MODEL,
    temperature: TRANSLATION_TEMPERATURE,
    maxTokens: TRANSLATION_MAX_TOKENS,
    messages: buildLegalMessages({ doc, locales: [locale] }),
  })
  if (!respuesta.success) return { ok: false, error: respuesta.error, pendientes: [] }

  if (respuesta.finishReason === 'length') {
    return {
      ok: false,
      error: `La traducción de "${doc.key}" a ${locale} se cortó por límite de tokens. Vuelve a intentarlo.`,
      pendientes: [],
    }
  }

  const parsed = parseTranslationResponse(respuesta.text)
  if (!parsed.success) return { ok: false, error: parsed.error, pendientes: [] }

  // El contrato pide { "<idioma>": {...} }; si el modelo devuelve el documento
  // directo (sin envoltorio), se acepta igualmente para no perder el trabajo.
  const traduccion = parsed.data[locale] ?? parsed.data
  const entry = mergeLegalTranslations(doc, actual, traduccion)
  return { ok: true, entry, pendientes: missingLegalParts(doc, entry) }
}

/**
 * Orquesta el backfill: recorre idiomas destino × documentos, traduce lo que
 * falta y reescribe el diccionario del idioma con lo ya validado.
 * Idempotente: re-ejecutarlo no vuelve a gastar tokens en lo ya traducido.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const apiKey = (process.env.DEEPSEEK_API_KEY ?? '').trim()
  if (!args.dryRun && !apiKey) {
    logError('Falta DEEPSEEK_API_KEY. Usa --dry-run para inspeccionar sin traducir.')
    process.exit(1)
  }

  const documentos = args.doc ? DOCUMENTS.filter((doc) => doc.key === args.doc) : DOCUMENTS
  if (documentos.length === 0) {
    logError(`Documento no válido: ${args.doc}. Usa terms, privacy o affiliate.`)
    process.exit(1)
  }

  const idiomas = (args.only.length > 0 ? args.only : TARGET_LOCALES).filter((locale) =>
    TARGET_LOCALES.includes(locale),
  )
  if (idiomas.length === 0) {
    logError('No hay idiomas válidos que procesar. Revisa --only.')
    process.exit(1)
  }

  logStep(
    `Plan: ${idiomas.length} idioma(s) × ${documentos.length} documento(s)` + (args.force ? ' · --force' : ''),
  )

  let totalTraducidos = 0
  let totalFallidos = 0

  for (const locale of idiomas) {
    const actual = { ...(LEGAL_MESSAGES[locale] ?? {}) }
    // Solo se llama al modelo donde falta algo (o todo, con --force).
    const porHacer = documentos
      .map((doc) => ({ doc, partes: missingLegalParts(doc, actual[doc.key]) }))
      .filter((item) => args.force || item.partes.length > 0)

    if (porHacer.length === 0) {
      logSkip(`${locale}: ya estaba completo (${documentos.length} documento(s)).`)
      continue
    }

    logStep(`Idioma ${locale}: ${porHacer.length} documento(s) por traducir`)

    for (const { doc, partes } of porHacer) {
      const etiqueta = `${doc.key} → ${locale}` + (partes.length > 0 ? ` (${partes.length} pendiente(s))` : '')
      if (args.dryRun) {
        logSkip(`${etiqueta} [dry-run]`)
        continue
      }

      const resultado = await traducirDocumento({ apiKey, doc, locale, actual: actual[doc.key] })
      if (!resultado.ok) {
        totalFallidos += 1
        logError(`${etiqueta}: ${resultado.error}`)
        continue
      }

      actual[doc.key] = resultado.entry
      totalTraducidos += 1
      if (resultado.pendientes.length > 0) {
        logSkip(`${etiqueta}: guardado parcial, quedan ${resultado.pendientes.join(', ')}`)
      } else {
        logOk(etiqueta)
      }
    }

    if (args.dryRun) continue

    // Se reescribe el archivo del idioma con lo traducido (y lo que ya hubiera):
    // el repositorio es la fuente de verdad de las traducciones legales.
    const destino = path.join(DEST_DIR, `${locale}.mjs`)
    fs.mkdirSync(DEST_DIR, { recursive: true })
    fs.writeFileSync(destino, serialize(locale, actual), 'utf8')
    logOk(`Escrito ${destino}`)
  }

  if (args.dryRun) {
    logOk('Dry-run terminado: no se llamó al modelo ni se escribió nada.')
    return
  }

  logStep('Resultado')
  logOk(`Documentos traducidos: ${totalTraducidos}` + (totalFallidos > 0 ? ` · fallidos: ${totalFallidos}` : ''))
  logSkip('Reconstruye la web (npm run build) para que las páginas legales usen los nuevos textos.')
  if (totalFallidos > 0) process.exitCode = 1
}

main().catch((err) => {
  logError(err?.message ?? String(err))
  process.exit(1)
})
