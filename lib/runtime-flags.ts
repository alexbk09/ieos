/**
 * Lectura centralizada de flags booleanos del entorno.
 * ------------------------------------------------------------------
 * POR QUÉ existe: en el proyecto los interruptores se escriben como
 * '1'/'0', 'true'/'false' o 'on'/'off' según quién los configure (Vercel,
 * .env local, panel de hosting). Centralizarlo evita comparaciones
 * inconsistentes repartidas por los servicios y deja un único lugar que
 * documenta la convención (sin magic strings).
 */

/** Valores que se interpretan como "activado". */
const VALORES_ACTIVOS = ['1', 'true', 'yes', 'si', 'sí', 'on']

/** Valores que se interpretan como "desactivado". */
const VALORES_INACTIVOS = ['0', 'false', 'no', 'off']

/**
 * Interpreta una variable de entorno como interruptor booleano.
 * @param nombre Nombre de la variable (ej. 'INDEXNOW_ENABLED').
 * @param porDefecto Valor a usar si la variable no está definida o no se entiende.
 * @returns El flag interpretado.
 */
export function leerBanderaEntorno(nombre: string, porDefecto: boolean): boolean {
  const valor = (process.env[nombre] ?? '').trim().toLowerCase()
  if (!valor) return porDefecto
  if (VALORES_ACTIVOS.includes(valor)) return true
  if (VALORES_INACTIVOS.includes(valor)) return false
  return porDefecto
}
