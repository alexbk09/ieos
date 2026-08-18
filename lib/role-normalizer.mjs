/**
 * Lógica pura de normalización de roles.
 * Independiente de Supabase para permitir testing económico.
 */

/**
 * Normaliza el rol del usuario tolerando valores de legacy.
 * @param {unknown} value Valor crudo del rol.
 * @returns {'admin' | 'client'} Rol normalizado.
 * - 'admin'  → administrador con acceso total.
 * - 'client' → cliente final (incluye valores legacy 'user').
 */
export function normalizeRole(value) {
  const raw = String(value ?? '').toLowerCase().trim()
  if (raw === 'admin' || raw === '1' || value === 1) return 'admin'
  return 'client'
}