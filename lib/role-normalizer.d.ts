/**
 * Declaración de tipos para lib/role-normalizer.mjs.
 */

/**
 * Normaliza el rol del usuario tolerando valores de legacy.
 * @param value Valor crudo del rol.
 * @returns Rol normalizado ('admin' | 'client').
 */
export function normalizeRole(value: unknown): 'admin' | 'client'