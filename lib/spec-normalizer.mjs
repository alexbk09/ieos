/**
 * Normalización pura de la tabla de especificaciones técnicas.
 * ------------------------------------------------------------------
 * Formato .mjs para que Node lo ejecute directamente en los tests
 * (mismo patrón que reviews.mjs / seo-rules.mjs).
 *
 * POR QUÉ existe:
 *  - El scraper recibe las especificaciones de AliExpress desde dos fuentes
 *    (JSON hidratado y DOM) con claves duplicadas, valores vacíos o etiquetas
 *    basura. Se limpian con una función determinista ANTES de gastar tokens de
 *    IA o escribir en la BD.
 *
 * Reglas de oro:
 *  - Cero magic numbers: los topes se inyectan por parámetro (su fuente única
 *    es lib/constants.ts).
 *  - Funciones deterministas: mismo input → mismo output.
 */

/** Clave canónica para deduplicar (minúsculas y espacios simples). */
function claveCanonica(clave) {
  return String(clave ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Convierte un valor crudo (texto, número o lista) en texto limpio de una línea.
 * Los objetos se descartan (no son un valor de especificación legible).
 * @param {unknown} valor Valor crudo.
 * @returns {string} Texto normalizado ('' si no es utilizable).
 */
function valorTexto(valor) {
  if (valor === null || valor === undefined) return ''
  if (Array.isArray(valor)) {
    return valor
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .join(', ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  if (typeof valor === 'object') return ''
  return String(valor).replace(/\s+/g, ' ').trim()
}

/**
 * Sanea y limita la tabla de especificaciones (clave → valor).
 * Acepta tanto un objeto `{clave: valor}` como una lista `[{clave, valor}]`.
 *
 * @param {Record<string, unknown>|Array<{clave?: string, name?: string, key?: string, valor?: unknown, value?: unknown}>|null|undefined} crudo
 * @param {{ maxEntries?: number, maxKeyLength?: number, maxValueLength?: number }} [opciones]
 * @returns {Record<string, string>} Mapa limpio clave → valor (sin duplicados).
 */
export function normalizarEspecificaciones(crudo, opciones = {}) {
  const maxEntries = opciones.maxEntries ?? 0
  const maxKeyLength = opciones.maxKeyLength ?? 0
  const maxValueLength = opciones.maxValueLength ?? 0

  // Normaliza la entrada a una lista de pares [clave, valor].
  const pares = Array.isArray(crudo)
    ? crudo.map((item) => [item?.clave ?? item?.name ?? item?.key, item?.valor ?? item?.value])
    : crudo && typeof crudo === 'object'
      ? Object.entries(crudo)
      : []

  const salida = {}
  const vistos = new Set()
  for (const [claveCruda, valorCrudo] of pares) {
    const clave = String(claveCruda ?? '').replace(/\s+/g, ' ').trim()
    const valor = valorTexto(valorCrudo)
    if (!clave || !valor) continue
    if (maxKeyLength > 0 && clave.length > maxKeyLength) continue
    if (maxValueLength > 0 && valor.length > maxValueLength) continue

    // Deduplicación por clave canónica (se conserva la PRIMERA aparición).
    const canonica = claveCanonica(clave)
    if (vistos.has(canonica)) continue
    vistos.add(canonica)
    salida[clave] = valor

    if (maxEntries > 0 && Object.keys(salida).length >= maxEntries) break
  }
  return salida
}
