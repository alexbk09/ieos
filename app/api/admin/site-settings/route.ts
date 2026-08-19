import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getAdminSiteSettings, updateSiteSettings, type SiteSettings } from '@/services/site-settings'

/**
 * API: Obtener la configuración del sitio (solo admin).
 * Toda la lógica de datos vive en /services/site-settings.
 */
export async function GET() {
  await requireAdmin()
  const { settings, error } = await getAdminSiteSettings()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ settings })
}

/**
 * API: Actualizar la configuración del sitio (solo admin).
 * Acepta un objeto parcial; solo las columnas conocidas se escriben en la BD.
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const body = (await request.json().catch(() => ({}))) as Partial<SiteSettings>

  // Validación de tipos JSONB: deben ser objeto o arreglo, nunca null.
  for (const key of ['nav_links', 'hero_texts', 'hero_images', 'studio_texts', 'contact_texts', 'footer_texts', 'social_links'] as const) {
    if (body[key] !== undefined && (typeof body[key] !== 'object' || body[key] === null)) {
      return NextResponse.json({ error: `El campo ${key} debe ser un objeto o arreglo JSON válido.` }, { status: 400 })
    }
  }

  const result = await updateSiteSettings(body)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ ok: true, settings: result.settings })
}