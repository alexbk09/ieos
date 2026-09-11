#!/usr/bin/env node
/**
 * Backfill de MARCA de los productos existentes (Fase 2.5).
 * ------------------------------------------------------------------
 * POR QUÉ existe:
 *   El pipeline ahora resuelve la marca (products.marca_id) al importar, pero
 *   los productos creados ANTES pueden tener marca_id NULL aunque su campo
 *   `specifications` (JSONB) ya traiga "Brand Name"/"Marca". Este script rellena
 *   el FK reutilizando/creando la fila en `marcas` para que el filtro público
 *   por marca funcione sobre todo el catálogo.
 *
 * Cómo funciona (idempotente y de bajo coste):
 *   1. Lee los productos con marca_id NULL.
 *   2. Detecta el nombre de marca en specifications (claves con "brand"/"marca").
 *   3. Descarta valores genéricos (AliExpress, Generic, No brand…).
 *   4. Reutiliza la marca existente (case-insensitive) o la crea.
 *   5. Actualiza products.marca_id.
 *
 * Uso:
 *   node scripts/backfill-product-brands.mjs --dry-run   # solo muestra el plan
 *   node scripts/backfill-product-brands.mjs             # aplica los cambios
 *   node scripts/backfill-product-brands.mjs --limit 20  # máximo N productos
 *
 * Requiere en .env*: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y
 * SUPABASE_SERVICE_ROLE_KEY.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: ['.env.development.local', '.env.local', '.env'] })

/** Valores genéricos que NO son una marca real y deben descartarse. */
const MARCAS_GENERICAS = new Set([
  'aliexpress',
  'generic',
  'no brand',
  'none',
  'sin marca',
  'unbranded',
  'otros',
  'other',
])

/** Logs con color, coherentes con el resto de scripts del proyecto. */
function logStep(message) { console.log(`\n\x1b[1;36m▶ ${message}\x1b[0m`) }
function logOk(message) { console.log(`  \x1b[1;32m✓\x1b[0m ${message}`) }
function logSkip(message) { console.log(`  \x1b[1;33m•\x1b[0m ${message}`) }
function logError(message) { console.error(`  \x1b[1;31m✗\x1b[0m ${message}`) }

/** Imprime la ayuda de uso. */
function printUsage() {
  console.log(`
Uso: node scripts/backfill-product-brands.mjs [opciones]

Opciones:
  --dry-run     Muestra el plan sin escribir en Supabase.
  --limit <n>   Procesa como máximo n productos pendientes.
  -h, --help    Muestra esta ayuda.
`)
}

/** Parsea los argumentos de línea de comandos. */
function parseArgs(argv) {
  const args = { dryRun: false, limit: 0, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i]
    if (current === '--dry-run') args.dryRun = true
    else if (current === '--limit') { args.limit = Number(argv[i + 1] ?? 0) || 0; i += 1 }
    else if (current === '-h' || current === '--help') args.help = true
  }
  return args
}

/**
 * Limpia y valida un nombre de marca detectado en las especificaciones.
 * @param {unknown} valor Valor crudo.
 * @returns {string|null} Nombre válido o null si es genérico/vacío.
 */
function limpiarMarca(valor) {
  if (valor === null || valor === undefined) return null
  const texto = String(valor).replace(/\s+/g, ' ').trim()
  if (!texto || texto.length > 40) return null
  if (MARCAS_GENERICAS.has(texto.toLowerCase())) return null
  return texto
}

/** Extrae la marca de un JSONB de especificaciones (claves con brand/marca). */
function detectarMarca(specifications) {
  if (!specifications || typeof specifications !== 'object') return null
  for (const [clave, valor] of Object.entries(specifications)) {
    if (/brand|marca/i.test(clave)) {
      const marca = limpiarMarca(valor)
      if (marca) return marca
    }
  }
  return null
}

/** Resuelve el id de una marca (existente case-insensitive o recién creada). */
async function obtenerOCrearMarca(supabase, nombre, cache) {
  const clave = nombre.toLowerCase()
  if (cache.has(clave)) return cache.get(clave)

  const { data: existente } = await supabase
    .from('marcas')
    .select('id')
    .ilike('nombre', nombre)
    .maybeSingle()
  if (existente?.id) {
    cache.set(clave, existente.id)
    return existente.id
  }

  const { data: creada, error } = await supabase
    .from('marcas')
    .insert({ nombre, activa: true })
    .select('id')
    .single()
  if (error || !creada) return null
  cache.set(clave, creada.id)
  return creada.id
}

/** Punto de entrada del script. */
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) return printUsage()

  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!supabaseUrl || !serviceKey) {
    logError('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el archivo .env*.')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  logOk('Proyecto Supabase destino: ' + (() => {
    try { return new URL(supabaseUrl).host } catch { return String(supabaseUrl) }
  })())

  logStep('Leyendo productos sin marca…')
  const { data: rows, error } = await supabase
    .from('products')
    .select('id,slug,name,specifications,marca_id')
    .is('marca_id', null)
    .not('specifications', 'is', null)
    .order('created_at', { ascending: false })
  if (error) {
    logError(error.message)
    process.exit(1)
  }

  const todas = rows ?? []
  const conMarca = todas
    .map((row) => ({ row, marca: detectarMarca(row.specifications) }))
    .filter((item) => item.marca)
  logOk(`${todas.length} productos sin marca · ${conMarca.length} con marca detectable.`)

  if (conMarca.length === 0) {
    logSkip('Nada por hacer: no se detectó marca en las especificaciones.')
    return
  }

  const lote = args.limit > 0 ? conMarca.slice(0, args.limit) : conMarca
  if (args.limit > 0 && conMarca.length > lote.length) {
    logSkip(`--limit ${args.limit}: se procesan ${lote.length} de ${conMarca.length} pendientes.`)
  }

  const cache = new Map()
  let actualizados = 0
  let fallidos = 0

  for (const [index, { row, marca }] of lote.entries()) {
    const etiqueta = `[${index + 1}/${lote.length}] ${row.name} → ${marca}`

    if (args.dryRun) {
      logSkip(`DRY-RUN ${etiqueta}`)
      continue
    }

    const marcaId = await obtenerOCrearMarca(supabase, marca, cache)
    if (!marcaId) {
      logError(`${etiqueta}: no se pudo resolver/crear la marca.`)
      fallidos += 1
      continue
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({ marca_id: marcaId })
      .eq('id', row.id)
    if (updateError) {
      logError(`${etiqueta}: ${updateError.message}`)
      fallidos += 1
      continue
    }

    logOk(etiqueta)
    actualizados += 1
  }

  logStep('Resumen')
  logOk(`Actualizados: ${actualizados}`)
  if (fallidos > 0) logError(`Fallidos: ${fallidos}`)
  if (args.dryRun) logSkip('Modo --dry-run: no se escribió nada en la base de datos.')
}

main().catch((error) => {
  logError(`Error fatal: ${error?.message ?? error}`)
  process.exit(1)
})

