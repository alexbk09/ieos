export type HeroLayout = 'text-left-image-right' | 'text-right-image-left' | 'text-center' | 'text-only'
export type BackgroundType = 'solid' | 'image' | 'gradient'
export type SegmentType = 'text' | 'image-text' | 'stats' | 'cta' | 'quote'

export type HomepageSegment = {
  id: string
  type: SegmentType
  enabled: boolean
  backgroundType: BackgroundType
  backgroundSolid: string
  backgroundImage: string
  backgroundGradientFrom: string
  backgroundGradientTo: string
  textColor: string
  eyebrow?: string
  title?: string
  titleHighlight?: string
  description?: string
  primaryButton?: string
  primaryHref?: string
  secondaryButton?: string
  secondaryHref?: string
  imageUrl?: string
  imageAlt?: string
  imageCaption?: string
  imagePosition?: string
  stats?: { value: string; label: string }[]
  quote?: string
  quoteAuthor?: string
}

export type HomepageConfig = {
  version: 1
  hero: {
    layout: HeroLayout
    contentAlign: 'left' | 'center' | 'right'
    backgroundType: BackgroundType
    backgroundSolid: string
    backgroundImage: string
    backgroundGradientFrom: string
    backgroundGradientTo: string
    showBadge: boolean
    showStats: boolean
    showImage: boolean
    overlay: boolean
  }
  studio: {
    backgroundType: BackgroundType
    backgroundSolid: string
    backgroundImage: string
    backgroundGradientFrom: string
    backgroundGradientTo: string
    textColor: string
    accentColor: string
    mutedColor: string
    layout: 'text-left' | 'text-right'
  }
  segments: HomepageSegment[]
}

export const DEFAULT_HOMEPAGE_CONFIG: HomepageConfig = {
  version: 1,
  hero: {
    layout: 'text-left-image-right',
    contentAlign: 'left',
    backgroundType: 'solid',
    backgroundSolid: 'transparent',
    backgroundImage: '',
    backgroundGradientFrom: '#020617',
    backgroundGradientTo: '#0891b2',
    showBadge: true,
    showStats: true,
    showImage: true,
    overlay: true,
  },
  studio: {
    backgroundType: 'solid',
    backgroundSolid: 'transparent',
    backgroundImage: '',
    backgroundGradientFrom: '#020617',
    backgroundGradientTo: '#0891b2',
    textColor: '',
    accentColor: '',
    mutedColor: '',
    layout: 'text-left',
  },
  segments: [],
}

export function createSegment(type: SegmentType): HomepageSegment {
  const base = {
    id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    enabled: true,
    backgroundType: 'solid' as BackgroundType,
    backgroundSolid: 'transparent',
    backgroundImage: '',
    backgroundGradientFrom: '#020617',
    backgroundGradientTo: '#0891b2',
    textColor: '',
  }
  switch (type) {
    case 'text':
      return { ...base, title: 'Título de la sección', description: 'Escribe aquí la descripción de esta sección.' }
    case 'image-text':
      return { ...base, title: 'Imagen con texto', description: 'Describe la imagen a la derecha del texto.', imageAlt: 'Imagen descriptiva' }
    case 'stats':
      return { ...base, title: 'Cifras que respaldan', stats: [{ value: '+12', label: 'años de experiencia' }] }
    case 'cta':
      return { ...base, title: '¿Listo para empezar?', description: 'Cuéntanos sobre tu proyecto.', primaryButton: 'Escríbenos', primaryHref: '#contacto', secondaryButton: 'Ver catálogo', secondaryHref: '/catalogo' }
    case 'quote':
      return { ...base, quote: 'La luz correcta transforma cualquier espacio.', quoteAuthor: 'Equipo ilumaX' }
  }
}

export function normalizeHomepageConfig(raw: unknown): HomepageConfig {
  const src = (raw ?? {}) as Partial<HomepageConfig>
  const hero: Partial<HomepageConfig['hero']> = src.hero ?? {}
  return {
    version: 1,
    hero: {
      layout: ['text-left-image-right', 'text-right-image-left', 'text-center', 'text-only'].includes(hero.layout ?? '') ? (hero.layout as HeroLayout) : DEFAULT_HOMEPAGE_CONFIG.hero.layout,
      contentAlign: ['left', 'center', 'right'].includes(hero.contentAlign ?? '') ? (hero.contentAlign as 'left' | 'center' | 'right') : DEFAULT_HOMEPAGE_CONFIG.hero.contentAlign,
      backgroundType: ['solid', 'image', 'gradient'].includes(hero.backgroundType ?? '') ? (hero.backgroundType as BackgroundType) : DEFAULT_HOMEPAGE_CONFIG.hero.backgroundType,
      backgroundSolid: typeof hero.backgroundSolid === 'string' ? hero.backgroundSolid : DEFAULT_HOMEPAGE_CONFIG.hero.backgroundSolid,
      backgroundImage: typeof hero.backgroundImage === 'string' ? hero.backgroundImage : '',
      backgroundGradientFrom: typeof hero.backgroundGradientFrom === 'string' ? hero.backgroundGradientFrom : DEFAULT_HOMEPAGE_CONFIG.hero.backgroundGradientFrom,
      backgroundGradientTo: typeof hero.backgroundGradientTo === 'string' ? hero.backgroundGradientTo : DEFAULT_HOMEPAGE_CONFIG.hero.backgroundGradientTo,
      showBadge: hero.showBadge ?? true,
      showStats: hero.showStats ?? true,
      showImage: hero.showImage ?? true,
      overlay: hero.overlay ?? true,
    },
    studio: {
      backgroundType: (['solid', 'image', 'gradient'] as const).includes((src.studio?.backgroundType ?? '') as BackgroundType) ? (src.studio?.backgroundType as BackgroundType) : DEFAULT_HOMEPAGE_CONFIG.studio.backgroundType,
      backgroundSolid: typeof src.studio?.backgroundSolid === 'string' ? src.studio.backgroundSolid : DEFAULT_HOMEPAGE_CONFIG.studio.backgroundSolid,
      backgroundImage: typeof src.studio?.backgroundImage === 'string' ? src.studio.backgroundImage : '',
      backgroundGradientFrom: typeof src.studio?.backgroundGradientFrom === 'string' ? src.studio.backgroundGradientFrom : DEFAULT_HOMEPAGE_CONFIG.studio.backgroundGradientFrom,
      backgroundGradientTo: typeof src.studio?.backgroundGradientTo === 'string' ? src.studio.backgroundGradientTo : DEFAULT_HOMEPAGE_CONFIG.studio.backgroundGradientTo,
      textColor: typeof src.studio?.textColor === 'string' ? src.studio.textColor : '',
      accentColor: typeof src.studio?.accentColor === 'string' ? src.studio.accentColor : '',
      mutedColor: typeof src.studio?.mutedColor === 'string' ? src.studio.mutedColor : '',
      layout: src.studio?.layout === 'text-right' ? 'text-right' : 'text-left',
    },
    segments: Array.isArray(src.segments) ? src.segments.filter((s) => s && typeof s === 'object') : [],
  }
}

export function moveSegment(list: HomepageSegment[], from: number, to: number): HomepageSegment[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (!item) return list
  next.splice(to, 0, item)
  return next
}
