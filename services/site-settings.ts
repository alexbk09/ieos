import { createClient as createServerClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { DEFAULT_THEME, type ThemeConfig } from '@/lib/theme'
import { DEFAULT_HOMEPAGE_CONFIG, normalizeHomepageConfig, type HomepageConfig } from '@/lib/homepage-config'

/**
 * Servicio de configuración del sitio.
 * Capa única de acceso a Supabase para la tabla site_settings.
 * La lectura pública usa el cliente público (SSG+ISR); la administración usa cliente servidor.
 * Incluye el tema visual de marca (site_settings.theme) para personalización multiempresa.
 */

// ---------- Tipos ----------
export type NavLink = {
  href: string
  label: string
  highlight?: boolean
}

export type HeroTexts = {
  eyebrow: string
  title: string
  titleHighlight: string
  description: string
  primaryButton: string
  primaryHref: string
  secondaryButton: string
  secondaryHref: string
  badge: string
  imageAlt: string
  imageCaption: string
  imagePosition: string
  stats: { value: string; label: string }[]
}

export type HeroImages = {
  main: string
}

export type StudioTexts = {
  eyebrow: string
  title: string
  items: { number: string; text: string }[]
}

export type ContactTexts = {
  eyebrow: string
  title: string
  description: string
  formNamePlaceholder: string
  formEmailPlaceholder: string
  formMessagePlaceholder: string
  formButton: string
}

export type FooterTexts = {
  copyright: string
  slogan: string
}

export type SocialLinks = {
  instagram: string
  linkedin: string
  email: string
}

export type SiteSettings = {
  id: number
  company_name: string
  tagline: string
  logo_url: string | null
  icon_url: string | null
  whatsapp_number: string
  address: string
  email: string
  /** Tema visual de marca (colores, fondos, radio) personalizable por empresa. */
  theme: ThemeConfig
  /** Latitud de la tienda para el mapa del inicio. */
  map_lat: number
  /** Longitud de la tienda para el mapa del inicio. */
  map_lng: number
  /** Nivel de zoom del mapa (1-21). */
  map_zoom: number
  nav_links: NavLink[]
  hero_texts: HeroTexts
  hero_images: HeroImages
  studio_texts: StudioTexts
  contact_texts: ContactTexts
  footer_texts: FooterTexts
  social_links: SocialLinks
  /** Personalización del inicio: layout de portada y segmentos apilables. */
  homepage_config: HomepageConfig
}

/** Valores por defecto de una fila de site_settings (para el mapa seguro). */
function mapSettings(row: any, fallback: Partial<SiteSettings> = {}): SiteSettings {
  return {
    id: row?.id ?? 1,
    company_name: row?.company_name ?? fallback.company_name ?? 'ilumaX',
    tagline: row?.tagline ?? fallback.tagline ?? 'Arquitectura de luz',
    logo_url: row?.logo_url ?? fallback.logo_url ?? null,
    icon_url: row?.icon_url ?? fallback.icon_url ?? null,
    whatsapp_number: row?.whatsapp_number ?? fallback.whatsapp_number ?? '584122649707',
    address: row?.address ?? fallback.address ?? 'Caracas, Venezuela',
    email: row?.email ?? fallback.email ?? 'hola@ilumax.ve',
    // Coordenadas por defecto: Caracas, Venezuela.
    map_lat: Number(row?.map_lat ?? fallback.map_lat ?? 10.4806),
    map_lng: Number(row?.map_lng ?? fallback.map_lng ?? -66.9036),
    map_zoom: Number(row?.map_zoom ?? fallback.map_zoom ?? 13),
    // Tema visual: merge de la BD con los valores por defecto (nunca faltan campos).
    theme: { ...DEFAULT_THEME, ...(row?.theme ?? fallback.theme ?? {}) },
    nav_links: row?.nav_links ?? fallback.nav_links ?? [],
    hero_texts: row?.hero_texts ?? fallback.hero_texts ?? {},
    hero_images: row?.hero_images ?? fallback.hero_images ?? {},
    studio_texts: row?.studio_texts ?? fallback.studio_texts ?? {},
    contact_texts: row?.contact_texts ?? fallback.contact_texts ?? {},
    footer_texts: row?.footer_texts ?? fallback.footer_texts ?? {},
    social_links: row?.social_links ?? fallback.social_links ?? {},
    homepage_config: normalizeHomepageConfig(row?.homepage_config ?? fallback.homepage_config ?? {}),
  }
}

/** Configuración por defecto del sitio (usada si no hay fila en la BD). */
const DEFAULT_SETTINGS: SiteSettings = {
  id: 1,
  company_name: 'ilumaX',
  tagline: 'Arquitectura de luz',
  logo_url: null,
  icon_url: null,
  whatsapp_number: '584122649707',
  address: 'Caracas, Venezuela',
  email: 'hola@ilumax.ve',
  map_lat: 10.4806,
  map_lng: -66.9036,
  map_zoom: 13,
  nav_links: [
    { href: '/', label: 'Inicio' },
    { href: '/#studio', label: 'Studio' },
    { href: '/#contacto', label: 'Contacto' },
    { href: '/catalogo', label: 'Catálogo completo', highlight: true },
  ],
  hero_texts: {
    eyebrow: 'Arquitectura de luz',
    title: 'Luz que define ',
    titleHighlight: 'espacios.',
    description:
      'Soluciones LED y revestimientos que convierten ambientes cotidianos en experiencias memorables. Diseñamos la atmósfera, tú habitas el resultado.',
    primaryButton: 'Explorar catálogo',
    primaryHref: '#catalogo',
    secondaryButton: 'Ver todo',
    secondaryHref: '/catalogo',
    badge: 'Colección 2025',
    imageAlt: 'Línea Aura 12W',
    imageCaption: 'La luz como material',
    imagePosition: '01 / 03',
    stats: [
      { value: '+12', label: 'años de experiencia' },
      { value: '24/7', label: 'asesoría técnica' },
      { value: '100%', label: 'diseño venezolano' },
    ],
  },
  hero_images: { main: '/products/webp/linea-aura.webp' },
  studio_texts: {
    eyebrow: 'El studio',
    title: 'Diseñamos lo que otros solo iluminan.',
    items: [
      { number: '01', text: 'Curaduría de piezas con intención y larga vida útil.' },
      { number: '02', text: 'Asesoría para traducir ideas en instalaciones reales.' },
      { number: '03', text: 'Materiales que hacen que cada proyecto tenga identidad.' },
    ],
  },
  contact_texts: {
    eyebrow: 'Hablemos',
    title: 'Tu espacio tiene algo que decir.',
    description:
      'Cuéntanos sobre tu próximo proyecto. Nuestro equipo puede ayudarte a elegir la solución correcta.',
    formNamePlaceholder: 'Tu nombre',
    formEmailPlaceholder: 'Correo electrónico',
    formMessagePlaceholder: 'Cuéntanos sobre tu proyecto',
    formButton: 'Enviar mensaje',
  },
  footer_texts: {
    copyright: '© 2025 ilumaX. Caracas, Venezuela.',
    slogan: 'Iluminamos ideas.',
  },
  social_links: {
    instagram: 'https://instagram.com',
    linkedin: 'https://linkedin.com',
    email: 'mailto:hola@ilumax.ve',
  },
  theme: DEFAULT_THEME,
  homepage_config: DEFAULT_HOMEPAGE_CONFIG,
}

/**
 * Obtiene la configuración del sitio para el render público.
 * Cliente público → SSG+ISR. Si la fila no existe devuelve la configuración por defecto.
 */
export async function getSiteSettings(): Promise<{ settings: SiteSettings; error: null | { message: string } }> {
  const supabase = createPublicClient()
  const { data, error } = await supabase.from('site_settings').select('*').eq('id', 1).maybeSingle()
  if (error) {
    console.error('Error leyendo site_settings:', error.message)
    return { settings: DEFAULT_SETTINGS, error: { message: error.message } }
  }
  return { settings: mapSettings(data, DEFAULT_SETTINGS), error: null }
}

/** Obtiene la configuración del sitio para el admin (cliente servidor). */
export async function getAdminSiteSettings() {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('site_settings').select('*').eq('id', 1).maybeSingle()
  if (error) return { data: null, settings: DEFAULT_SETTINGS, error }
  const settings = mapSettings(data, DEFAULT_SETTINGS)
  return { data, settings, error: null }
}

/**
 * Actualiza la configuración del sitio.
 * Solo acepta las columnas editables conocidas; los jsonb se validan antes de escribir.
 * Requiere sesión de admin — usa cliente servidor.
 */
export async function updateSiteSettings(payload: Partial<SiteSettings>) {
  const supabase = await createServerClient()

  // Columnas escalares directamente editables.
  const scalar: Record<string, unknown> = {}
  if (payload.company_name !== undefined) scalar.company_name = String(payload.company_name).trim()
  if (payload.tagline !== undefined) scalar.tagline = String(payload.tagline).trim()
  if (payload.logo_url !== undefined) scalar.logo_url = payload.logo_url
  if (payload.icon_url !== undefined) scalar.icon_url = payload.icon_url
  if (payload.whatsapp_number !== undefined) scalar.whatsapp_number = String(payload.whatsapp_number).trim()
  if (payload.address !== undefined) scalar.address = String(payload.address).trim()
  if (payload.email !== undefined) scalar.email = String(payload.email).trim()
  // Coordenadas del mapa (validación numérica).
  const mapLat = Number(payload.map_lat)
  if (payload.map_lat !== undefined) {
    if (!Number.isFinite(mapLat) || mapLat < -90 || mapLat > 90) {
      return { data: null, error: { message: 'La latitud debe ser un número entre -90 y 90' }, settings: null }
    }
    scalar.map_lat = mapLat
  }
  const mapLng = Number(payload.map_lng)
  if (payload.map_lng !== undefined) {
    if (!Number.isFinite(mapLng) || mapLng < -180 || mapLng > 180) {
      return { data: null, error: { message: 'La longitud debe ser un número entre -180 y 180' }, settings: null }
    }
    scalar.map_lng = mapLng
  }
  const mapZoom = Number(payload.map_zoom)
  if (payload.map_zoom !== undefined) {
    if (!Number.isFinite(mapZoom) || mapZoom < 1 || mapZoom > 21) {
      return { data: null, error: { message: 'El zoom debe ser un número entre 1 y 21' }, settings: null }
    }
    scalar.map_zoom = Math.round(mapZoom)
  }

  // Columnas JSONB: se copian tal cual (objetos/arreglos).
  const jsonb: Record<string, unknown> = {}
  for (const key of ['nav_links', 'hero_texts', 'hero_images', 'studio_texts', 'contact_texts', 'footer_texts', 'social_links', 'theme', 'homepage_config'] as const) {
    if (payload[key] !== undefined) jsonb[key] = payload[key]
  }

  const update: Record<string, unknown> = { ...scalar, ...jsonb }

  // Si no hay cambios, devolvemos ok sin tocar la BD.
  if (Object.keys(update).length === 0) {
    const { settings } = await getAdminSiteSettings()
    return { data: { id: 1 }, error: null, settings }
  }

  const { data, error } = await supabase
    .from('site_settings')
    .update(update)
    .eq('id', 1)
    .select('*')
    .single()

  if (error) return { data: null, error, settings: null }
  return { data, error: null, settings: mapSettings(data, DEFAULT_SETTINGS) }
}