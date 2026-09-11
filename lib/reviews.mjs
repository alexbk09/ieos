/**
 * Lógica pura de valoraciones y reseñas de producto (sin Supabase ni Next).
 * ------------------------------------------------------------------
 * Formato .mjs para que Node lo ejecute directamente en los tests
 * (mismo patrón que price-calculator.mjs / seo-rules.mjs).
 *
 * POR QUÉ existe:
 *  - AliExpress devuelve la valoración en formatos distintos según el campo
 *    (`evaluate_rate` suele venir como "97.6%" y otras APIs como "4.8").
 *  - Las reseñas llegan sin normalizar (textos basura, longitudes enormes,
 *    idiomas distintos), así que se limpian con una función determinista y
 *    testeable ANTES de gastar tokens de IA o escribir en la BD.
 *
 * Reglas de oro:
 *  - Cero magic numbers: los topes se inyectan por parámetro (su fuente única
 *    es lib/constants.ts).
 *  - Funciones deterministas: mismo input → mismo output.
 */

/** Escala máxima de una valoración tipo estrella (0-5). */
const ESCALA_MAXIMA = 5

/** Longitud máxima del nombre del autor de una reseña. */
const AUTOR_MAX_LENGTH = 60

/** Longitud máxima de la fecha de una reseña. */
const FECHA_MAX_LENGTH = 40

/** Limita un número al rango [min, max]. */
function limitar(numero, min, max) {
  if (!Number.isFinite(numero)) return min
  return Math.min(Math.max(numero, min), max)
}

/** Redondea a `decimales` posiciones sin notación científica. */
function redondear(numero, decimales) {
  const factor = 10 ** decimales
  return Math.round(numero * factor) / factor
}

/**
 * Normaliza una valoración cruda de AliExpress a porcentaje y escala 0-5.
 * Acepta "97.6%", "4.8", "4,8", "4.8/5" o números sueltos.
 *
 * @param {unknown} valor Valor crudo devuelto por la API/scraper.
 * @returns {{ porcentaje: number, escala05: number } | null} null si no es válida.
 */
export function parsearValoracion(valor) {
  if (valor === null || valor === undefined) return null
  const texto = String(valor).trim()
  if (!texto) return null

  // Se extrae el primer número (soporta coma decimal europea).
  const coincidencia = texto.replace(',', '.').match(/\d+(?:\.\d+)?/)
  if (!coincidencia) return null
  const numero = Number(coincidencia[0])
  if (!Number.isFinite(numero)) return null

  const esPorcentaje = texto.includes('%')

  let porcentaje
  let escala05
  if (esPorcentaje || numero > ESCALA_MAXIMA) {
    // Valor en porcentaje (ej: "97.6%" o "97.6" sin símbolo).
    porcentaje = numero
    escala05 = (numero / 100) * ESCALA_MAXIMA
  } else {
    // Valor ya en escala 0-5 (ej: "4.8").
    escala05 = numero
    porcentaje = (numero / ESCALA_MAXIMA) * 100
  }

  if (!Number.isFinite(porcentaje) || !Number.isFinite(escala05)) return null

  return {
    porcentaje: redondear(limitar(porcentaje, 0, 100), 1),
    escala05: redondear(limitar(escala05, 0, ESCALA_MAXIMA), 2),
  }
}

/**
 * Limpia un texto de reseña: colapsa espacios y recorta al máximo permitido.
 * @param {unknown} valor Texto crudo.
 * @param {number} maxLength Longitud máxima permitida.
 * @returns {string} Texto limpio ('' si no queda nada útil).
 */
export function limpiarTextoResena(valor, maxLength) {
  if (valor === null || valor === undefined) return ''
  const limpio = String(valor).replace(/\s+/g, ' ').trim()
  if (!limpio) return ''
  return limpio.length > maxLength ? `${limpio.slice(0, maxLength).trim()}…` : limpio
}

/**
 * Normaliza una lista cruda de reseñas: descarta las vacías o demasiado cortas,
 * limpia el texto, normaliza la valoración y aplica el tope de almacenamiento.
 *
 * @param {unknown} lista Reseñas crudas (array de objetos).
 * @param {{maxStored:number, minTextLength:number, maxTextLength:number}} opciones Topes (de constants).
 * @returns {{autor:string|null, valoracion:number|null, texto:string, fecha:string|null}[]}
 */
export function normalizarResenas(lista, opciones) {
  const maxStored = opciones?.maxStored ?? 0
  const minTextLength = opciones?.minTextLength ?? 0
  const maxTextLength = opciones?.maxTextLength ?? 0
  if (maxStored <= 0) return []

  const salida = []
  for (const item of Array.isArray(lista) ? lista : []) {
    if (!item || typeof item !== 'object') continue
    const texto = limpiarTextoResena(item.texto ?? item.text ?? item.content, maxTextLength)
    if (texto.length < minTextLength) continue

    const valoracion = parsearValoracion(item.valoracion ?? item.rating ?? item.score)
    const autor = limpiarTextoResena(item.autor ?? item.author ?? item.userName, AUTOR_MAX_LENGTH) || null
    const fecha = limpiarTextoResena(item.fecha ?? item.date ?? item.reviewTime, FECHA_MAX_LENGTH) || null

    salida.push({
      autor,
      valoracion: valoracion ? valoracion.escala05 : null,
      texto,
      fecha,
    })
    if (salida.length >= maxStored) break
  }
  return salida
}

