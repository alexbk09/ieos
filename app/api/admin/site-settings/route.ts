import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getAdminSiteSettings, updateSiteSettings, type SiteSettings } from '@/services/site-settings'
import { DEFAULT_THEME, type ThemeConfig } from '@/lib/theme'

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
  for (const key of ['nav_links', 'hero_texts', 'hero_images', 'studio_texts', 'contact_texts', 'footer_texts', 'social_links', 'theme', 'homepage_config'] as const) {
    if (body[key] !== undefined && (typeof body[key] !== 'object' || body[key] === null)) {
      return NextResponse.json({ error: `El campo ${key} debe ser un objeto o arreglo JSON válido.` }, { status: 400 })
    }
  }

  // Validación específica del tema: cada color debe ser un hex válido.
  if (body.theme !== undefined) {
    const theme: Partial<ThemeConfig> = { ...DEFAULT_THEME, ...body.theme }
    const hexFields = ['brand', 'brandStrong', 'brandLight', 'brandForeground', 'navy', 'navyForeground', 'navyMuted', 'background', 'foreground', 'backgroundDark', 'foregroundDark'] as const
    for (const field of hexFields) {
      const value = String(theme[field])
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
        return NextResponse.json({ error: `El color ${field} debe ser un HEX válido (ej: #06b6d4).` }, { status: 400 })
      }
    }
    if (typeof theme.radius !== 'string' || !/^[\d.]+(px|rem|%)$/.test(theme.radius)) {
      return NextResponse.json({ error: 'El radio de esquinas debe ser un valor CSS válido (ej: 1rem o 12px).' }, { status: 400 })
    }
  }

  const result = await updateSiteSettings(body)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ ok: true, settings: result.settings })
}