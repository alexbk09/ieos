import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { ENTRY_BULK_TYPES, ENTRY_MODULE_SLUG } from '@/lib/constants'
import { listNicheGuideCoverage } from '@/services/entries'

/**
 * API: nichos con su cobertura de guías (generador masivo del panel).
 * ------------------------------------------------------------------
 * Alimenta el botón "crear 3 guías" del módulo de Guías y Comparativas: el panel
 * necesita saber qué nicho tiene menos entradas del lote para ROTAR y no repetir
 * siempre el mismo (anti "doorway" + mejor reparto de enlazado interno).
 *
 * Seguridad (regla de oro):
 *   1) requireAdmin() fuerza sesión + rol administrador.
 *   2) hasPermission('guias_comparativas', 'read') valida RBAC.
 *   3) Los datos se leen en /services (aquí NUNCA se llama a supabase).
 */

export const runtime = 'nodejs'

export async function GET() {
  await requireAdmin()
  if (!(await hasPermission(ENTRY_MODULE_SLUG, 'read'))) {
    return NextResponse.json(
      { error: 'No tienes permiso para ver los nichos del módulo de guías.' },
      { status: 403 },
    )
  }

  const { niches, error } = await listNicheGuideCoverage([...ENTRY_BULK_TYPES])
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ niches })
}
