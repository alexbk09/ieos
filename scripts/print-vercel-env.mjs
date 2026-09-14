#!/usr/bin/env node
/**
 * Genera la lista de variables de entorno del módulo de indexación para el
 * despliegue (Vercel), lista para copiar y pegar.
 * ------------------------------------------------------------------
 * POR QUÉ existe:
 *   Los archivos .env* están en .gitignore y NO viajan al despliegue, así que
 *   en Vercel hay que crear a mano las credenciales. Copiar la clave privada a
 *   mano es el punto donde más se falla (saltos de línea, comillas…), así que
 *   este script la deja en formato de UNA sola línea con "\n" escapados, que es
 *   justo lo que espera el servicio (services/google-indexing.ts los convierte).
 *
 * Seguridad: la clave se escribe SOLO en `.env.vercel.txt` (cubierto por la
 * regla `.env*` del .gitignore, es decir, nunca se sube al repositorio) y en la
 * consola se muestra enmascarada.
 *
 * Uso:
 *   npm run vercel:env
 */

import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'

config({ path: ['.env.development.local', '.env.local', '.env'] })

/** Variables que necesita el módulo de indexación, con su obligatoriedad. */
const VARIABLES = [
  { nombre: 'NEXT_PUBLIC_SITE_URL', obligatoria: true, nota: 'dominio canónico (con www si sirves con www)' },
  { nombre: 'GOOGLE_INDEXING_PROJECT_ID', obligatoria: false, nota: 'solo informativo en el panel' },
  { nombre: 'GOOGLE_INDEXING_CLIENT_EMAIL', obligatoria: true, nota: 'cuenta de servicio de Google Cloud' },
  { nombre: 'GOOGLE_INDEXING_PRIVATE_KEY', obligatoria: true, nota: 'clave en UNA línea con \\n escapados', secreto: true },
  { nombre: 'GOOGLE_SEARCH_CONSOLE_SITE_URL', obligatoria: true, nota: 'propiedad verificada (https://www.dominio/)' },
  { nombre: 'GOOGLE_INDEXING_STRICT', obligatoria: false, nota: 'true = respeta la política de Google' },
  { nombre: 'INDEXING_AUTO_DISPATCH_ENABLED', obligatoria: false, nota: '1 = envía al publicar' },
  { nombre: 'INDEXNOW_ENABLED', obligatoria: false, nota: '1 = activa IndexNow' },
  { nombre: 'INDEXNOW_KEY', obligatoria: true, nota: 'clave pública de IndexNow (8-128 [a-zA-Z0-9-])' },
  { nombre: 'INDEXNOW_ENDPOINT', obligatoria: false, nota: 'por defecto https://api.indexnow.org/indexnow' },
  { nombre: 'NEXT_PUBLIC_INDEXING_DAILY_LIMIT', obligatoria: false, nota: 'URLs máximas por día (resetea 00:00 UTC)' },
  { nombre: 'NEXT_PUBLIC_INDEXING_BATCH_SIZE', obligatoria: false, nota: 'URLs por tanda' },
]

/** Enmascara un valor para poder mostrarlo sin filtrarlo en la consola. */
function enmascarar(valor, secreto) {
  if (!secreto) return valor
  const texto = String(valor)
  return `${texto.slice(0, 28)}…${texto.slice(-12)} (${texto.length} caracteres)`
}

/** Escapa la clave privada a UNA línea, que es como se pega en Vercel. */
function claveEnUnaLinea(valor) {
  return String(valor).replace(/\r\n/g, '\n').replace(/\n/g, '\\n')
}

const lineas = []
console.log('\n\x1b[1;36m▶ Variables de entorno para Vercel (módulo de indexación)\x1b[0m\n')

for (const variable of VARIABLES) {
  const valor = (process.env[variable.nombre] ?? '').trim()
  const presente = valor.length > 0
  const estado = presente ? '\x1b[1;32m✓\x1b[0m' : variable.obligatoria ? '\x1b[1;31m✗ FALTA\x1b[0m' : '\x1b[1;33m•\x1b[0m (se usará el valor por defecto)'
  console.log(`  ${estado}  ${variable.nombre}`)
  console.log(`      ${variable.nota}`)
  if (presente) {
    console.log(`      valor: ${enmascarar(valor, variable.secreto)}`)
    const salida = variable.secreto ? claveEnUnaLinea(valor) : valor
    lineas.push(`${variable.nombre}="${salida}"`)
  }
}

// El archivo queda listo para copiar/pegar línea por línea en Vercel.
writeFileSync('.env.vercel.txt', lineas.join('\n') + '\n', 'utf8')

console.log(
  '\n\x1b[1;32m✓\x1b[0m Listo: las ' +
    lineas.length +
    ' variables están en \x1b[1m.env.vercel.txt\x1b[0m (ignorado por git).' +
    '\n  1) En Vercel: Settings → Environment Variables (Production y Preview).' +
    '\n  2) Pega cada línea NAME=valor (la clave privada va tal cual, en una línea).' +
    '\n  3) Redeploy: las variables NEXT_PUBLIC_* se compilan en el build.' +
    '\n  Después, en el panel: Diagnóstico para confirmar que todo responde.\n',
)
