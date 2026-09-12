#!/usr/bin/env node
// ============================================================
// Validador de SQL SIN EFECTOS (temporal).
// Ejecuta un archivo .sql dentro de BEGIN ... ROLLBACK para detectar
// errores de sintaxis/DDL reales sin persistir NINGÚN cambio.
// Reutiliza la misma detección de host que supabase/run.mjs.
//
// Uso: node scripts/_dry-run-sql.mjs supabase/migrations/0056_seo_entries.sql
// ============================================================
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import pg from 'pg'

config({ path: ['.env.development.local', '.env.local', '.env'] })

const POOLER_REGIONS = [
  'sa-east-1', 'us-east-1', 'us-west-1', 'us-west-2', 'us-east-2',
  'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
  'ap-south-1', 'ca-central-1', 'me-central-1',
]

/** Extrae el ref del proyecto de la URL de Supabase. */
function getProjectRef(supabaseUrl) {
  const match = String(supabaseUrl ?? '').match(/https:\/\/([^.]+)\.supabase\.co/)
  return match?.[1] ?? null
}

/** Prueba todos los hosts en paralelo y devuelve el primero que responde. */
async function discoverConnectionString(ref, password) {
  const enc = encodeURIComponent(password)
  const candidates = [
    `postgresql://postgres:${enc}@${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`,
    ...POOLER_REGIONS.map((r) => `postgresql://postgres.${ref}:${enc}@aws-0-${r}.pooler.supabase.com:5432/postgres`),
  ]

  const attempts = candidates.map(async (conn) => {
    const client = new pg.Client({
      connectionString: conn,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 6000,
      query_timeout: 15000,
    })
    try {
      await client.connect()
      await client.query('select 1')
      return { conn, client, host: new URL(conn).hostname }
    } catch {
      try { await client.end() } catch {}
      throw new Error('sin conexion')
    }
  })

  return Promise.any(attempts)
}

const file = process.argv[2]
if (!file) {
  console.error('Falta la ruta del archivo .sql')
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL
const ref = getProjectRef(supabaseUrl)
const password = process.env.SUPABASE_DB_PASSWORD || (() => {
  try { return new URL(process.env.DATABASE_URL ?? '').password } catch { return null }
})()

if (!ref || !password) {
  console.error('Faltan SUPABASE_URL o la password de base de datos.')
  process.exit(1)
}

const sql = readFileSync(file, 'utf8')
const { client, host } = await discoverConnectionString(ref, password)
console.log(`✔ Conexion: ${host}`)

try {
  await client.query('BEGIN')
  const res = await client.query(sql)
  // Un archivo con varias sentencias devuelve un ARRAY de resultsets:
  // imprimimos el último (centinelas/diagnóstico del propio .sql).
  if (Array.isArray(res) && res.length > 0) {
    const last = res[res.length - 1]
    if (last?.rows?.length) console.log('  ultimo resultset:', JSON.stringify(last.rows))
  }
  const { rows } = await client.query(
    `select
       (select count(*)::int from information_schema.tables
         where table_schema='public' and table_name in
           ('seo_entries','seo_entry_products','seo_entry_categories','seo_entry_generations')) as tablas,
       (select count(*)::int from pg_policies
         where schemaname='public' and tablename in
           ('seo_entries','seo_entry_products','seo_entry_categories','seo_entry_generations')) as politicas,
       (select count(*)::int from public.modules where slug='guias_comparativas') as modulos`,
  )
  console.log('  dentro de la transaccion:', JSON.stringify(rows[0]))

  const { rows: detalle } = await client.query(
    `select tablename, policyname, cmd from pg_policies
      where schemaname='public' and tablename in
        ('seo_entries','seo_entry_products','seo_entry_categories','seo_entry_generations')
      order by tablename, policyname`,
  )
  for (const p of detalle) console.log(`    - ${p.tablename} :: ${p.policyname} [${p.cmd}]`)
  await client.query('ROLLBACK')
  // Verificación post-rollback: nada debe haber quedado persistido.
  const { rows: post } = await client.query(
    `select
       (select count(*)::int from information_schema.tables
         where table_schema='public' and table_name in
           ('seo_entries','seo_entry_products','seo_entry_categories','seo_entry_generations')) as tablas_persistidas,
       (select count(*)::int from public.modules where slug='guias_comparativas') as modulos_persistidos`,
  )
  console.log('  persistido tras ROLLBACK:', JSON.stringify(post[0]))
  console.log('✔ SQL valido. ROLLBACK ejecutado: NO se persistio ningun cambio.')
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(`✗ El SQL fallo: ${error.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
