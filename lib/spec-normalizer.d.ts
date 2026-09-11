/**
 * Declaración de tipos para lib/spec-normalizer.mjs.
 * Normalización pura de la tabla de especificaciones técnicas AliExpress.
 */

/** Entrada aceptada: objeto {clave: valor} o lista de pares. */
export type EspecificacionesCrudas =
  | Record<string, unknown>
  | Array<{ clave?: string; name?: string; key?: string; valor?: unknown; value?: unknown }>
  | null
  | undefined

/** Sanea y limita la tabla de especificaciones (clave → valor). */
export function normalizarEspecificaciones(
  crudo: EspecificacionesCrudas,
  opciones?: { maxEntries?: number; maxKeyLength?: number; maxValueLength?: number },
): Record<string, string>
