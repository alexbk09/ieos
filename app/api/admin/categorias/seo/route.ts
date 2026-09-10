import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { CATEGORY_SEO_MODULE_SLUG } from '@/lib/constants'
import { getCategories, updateCategorySeo } from '@/services/catalog'
import { generateHubContent } from '@/services/seo-hub'
import type { SeoFaqItem } from '@/lib/seo-types'

/**
 * API del módulo "SEO de Categorías" (hubs pSEO).
 * ------------------------------------------------------------------
 * GET  -> lista las categorías con su contenido SEO (para el editor admin).
 * POST -> guarda (o regenera con IA) el contenido SEO de una categoría.
 *
 * Seguridad RBAC (regla de oro):
 *   1) requireAdmin() fuerza sesión + rol administrador.
 *   2) hasPermission('categorias_seo', 'read'|'write') valida el permiso.
 *   3) La lógica de datos vive en /services (nunca supabase aquí).
 */

export const runtime = 'nodejs'

/** Normaliza la FAQ recibida a la forma {pregunta, respuesta}. */
function parseFaq(value: unknown): SeoFaqItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((f: any) => ({
      pregunta: String(f?.pregunta ?? '').trim(),
      respuesta: String(f?.respuesta ?? '').trim(),
    }))
    .filter((f) => f.pregunta && f.respuesta)
  return items
}

/** Lista las categorías con su contenido SEO (solo lectura). */
export async function GET() {
  await requireAdmin()
  const puedeLeer = await hasPermission(CATEGORY_SEO_MODULE_SLUG, 'read')
  if (!puedeLeer) return NextResponse.json({ error: 'No tienes permiso para ver el SEO de categorías.' }, { status: 403 })

  const { data, error } = await getCategories()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ categories: data })
}

/**
 * Guarda el SEO de una categoría. Si `regenerar = true`, primero genera el
 * contenido con IA a partir del nombre y luego lo persiste.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const puedeEscribir = await hasPermission(CATEGORY_SEO_MODULE_SLUG, 'write')
  if (!puedeEscribir) return NextResponse.json({ error: 'No tienes permiso para editar el SEO de categorías.' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'ID de categoría requerido.' }, { status: 400 })

  const slug = typeof body.slug === 'string' ? body.slug.trim() : undefined

  // Modo regenerar: la IA produce título + intro + FAQ desde el nombre.
  if (body.regenerar === true) {
    const nombre = String(body.nombre ?? '').trim()
    if (!nombre) return NextResponse.json({ error: 'Falta el nombre de la categoría para regenerar.' }, { status: 400 })
    const hub = await generateHubContent(nombre)
    if (!hub.success) return NextResponse.json({ error: hub.error }, { status: 500 })
    const result = await updateCategorySeo(
      id,
      { seo_title: hub.data.seo_title, seo_intro: hub.data.seo_intro, seo_faq: hub.data.seo_faq },
      { slug },
    )
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
    return NextResponse.json({ category: result.data })
  }

  // Modo edición manual.
  const result = await updateCategorySeo(
    id,
    {
      ...(body.seo_title !== undefined ? { seo_title: String(body.seo_title ?? '').trim() || null } : {}),
      ...(body.seo_intro !== undefined ? { seo_intro: String(body.seo_intro ?? '').trim() || null } : {}),
      ...(body.seo_faq !== undefined ? { seo_faq: parseFaq(body.seo_faq) ?? null } : {}),
    },
    { slug },
  )
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ category: result.data })
}
