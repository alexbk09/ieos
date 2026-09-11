export type HeroLayout = 'text-left-image-right' | 'text-right-image-left' | 'text-center' | 'text-only'
export type BackgroundType = 'solid' | 'image' | 'gradient'
export type SegmentType =
  | 'text'
  | 'image-text'
  | 'stats'
  | 'cta'
  | 'quote'
  // --- Nuevos tipos orientados a tienda de afiliados (SEO/UX) ---
  | 'category-grid'
  | 'product-carousel'
  | 'trust-badges'
  | 'how-it-works'
  | 'faq'
  | 'testimonials'
  | 'newsletter'

/** Ítem de FAQ (pregunta/respuesta) → habilita FAQPage JSON-LD. */
export type FaqItem = { question: string; answer: string }

/** Ítem de testimonio (prueba social). */
export type TestimonialItem = { name: string; role?: string; text: string; rating?: number }

/** Ítem de "cómo funciona" (transparencia del modelo de afiliado). */
export type HowItWorksStep = { number: string; title: string; text: string }

/** Ítem de sello de confianza (envío, garantía, pago seguro…). */
export type TrustBadge = { icon: string; title: string; text: string }

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
  // --- Campos de los nuevos tipos ---
  /** category-grid: slugs de categorías a mostrar (pSEO → /categoria/[slug]). */
  categorySlugs?: string[]
  /** product-carousel: slugs de productos a destacar (fallback: destacados). */
  productSlugs?: string[]
  /** product-carousel: etiqueta del carrusel (ej: "Más vendidos"). */
  carouselLabel?: string
  /** faq: lista de preguntas/respuestas. */
  faqItems?: FaqItem[]
  /** testimonials: lista de testimonios. */
  testimonials?: TestimonialItem[]
  /** how-it-works: pasos. */
  steps?: HowItWorksStep[]
  /** trust-badges: sellos de confianza. */
  badges?: TrustBadge[]
  /** newsletter: texto del botón y placeholder. */
  newsletterButton?: string
  newsletterPlaceholder?: string
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

/**
 * Seed por defecto del inicio (tienda de afiliados AliExpress).
 * RITMO VISUAL: las bandas usan los TOKENS de superficie (--surface-1/2/3), que
 * cambian solos entre modo claro y oscuro. Así pasamos de un tinte suave al
 * siguiente (sin saltos bruscos blanco↔negro) y reservamos UNA única banda
 * profunda (--surface-deep) para el CTA final del boletín.
 * El admin puede editar, reordenar o eliminar cada segmento desde Configuración.
 */
export const DEFAULT_HOMEPAGE_CONFIG: HomepageConfig = {
  version: 1,
  hero: {
    layout: 'text-left-image-right',
    contentAlign: 'left',
    backgroundType: 'gradient',
    backgroundSolid: 'transparent',
    backgroundImage: '',
    // Degradado con tokens: se adapta solo al modo claro/oscuro.
    backgroundGradientFrom: 'var(--surface-1)',
    backgroundGradientTo: 'var(--surface-3)',
    showBadge: true,
    showStats: true,
    showImage: true,
    overlay: true,
  },
  studio: {
    backgroundType: 'gradient',
    backgroundSolid: 'transparent',
    backgroundImage: '',
    backgroundGradientFrom: 'var(--surface-2)',
    backgroundGradientTo: 'var(--surface-3)',
    textColor: '',
    accentColor: '',
    mutedColor: '',
    layout: 'text-left',
  },
  segments: [
    {
      id: 'seg-trust',
      type: 'trust-badges',
      enabled: true,
      backgroundType: 'solid',
      backgroundSolid: 'var(--surface-1)',
      backgroundImage: '',
      backgroundGradientFrom: 'var(--surface-1)',
      backgroundGradientTo: 'var(--surface-3)',
      textColor: '',
      eyebrow: 'Compra con confianza',
      title: 'Compra con total seguridad',
      description: 'Curamos las mejores ofertas de AliExpress para que compres tranquilo: envío rastreable, pago protegido y precios verificados.',
      badges: [
        { icon: 'truck', title: 'Envío rastreable', text: 'Seguimiento en tiempo real de tu pedido.' },
        { icon: 'shield', title: 'Compra protegida', text: 'Pago seguro respaldado por AliExpress.' },
        { icon: 'tag', title: 'Precios verificados', text: 'Curamos los mejores descuentos del día.' },
      ],
    },
    {
      id: 'seg-categories',
      type: 'category-grid',
      enabled: true,
      backgroundType: 'solid',
      backgroundSolid: 'var(--surface-2)',
      backgroundImage: '',
      backgroundGradientFrom: 'var(--surface-2)',
      backgroundGradientTo: 'var(--surface-3)',
      textColor: '',
      eyebrow: 'Explora por categoría',
      title: 'Categorías destacadas',
      description: 'Encuentra los productos más vendidos y mejor valorados de AliExpress, organizados por categoría para descubrir tu próximo hobby.',
      categorySlugs: [],
    },
    {
      id: 'seg-featured',
      type: 'product-carousel',
      enabled: true,
      backgroundType: 'solid',
      backgroundSolid: 'var(--surface-3)',
      backgroundImage: '',
      backgroundGradientFrom: 'var(--surface-3)',
      backgroundGradientTo: 'var(--surface-1)',
      textColor: '',
      eyebrow: 'Selección del día',
      title: 'Ofertas que no puedes dejar pasar',
      description: 'Una curaduría de los productos con mejor relación calidad-precio de AliExpress, actualizada cada día.',
      carouselLabel: 'Más buscados',
      productSlugs: [],
    },
    {
      id: 'seg-how',
      type: 'how-it-works',
      enabled: true,
      backgroundType: 'solid',
      backgroundSolid: 'var(--surface-1)',
      backgroundImage: '',
      backgroundGradientFrom: 'var(--surface-1)',
      backgroundGradientTo: 'var(--surface-2)',
      textColor: '',
      eyebrow: 'Transparencia',
      title: '¿Cómo funciona?',
      description: 'Elige, compara y compra directo en AliExpress con total transparencia. Nosotros curamos las mejores ofertas para que ahorres tiempo y dinero.',
      steps: [
        { number: '01', title: 'Explora', text: 'Navega por nuestras categorías y ofertas curadas.' },
        { number: '02', title: 'Compara', text: 'Revisa precios, reseñas y valoraciones reales de compradores.' },
        { number: '03', title: 'Compra', text: 'Te llevamos a AliExpress para completar tu compra segura.' },
      ],
    },
    {
      id: 'seg-testimonials',
      type: 'testimonials',

      enabled: true,
      backgroundType: 'solid',
      backgroundSolid: 'var(--surface-2)',
      backgroundImage: '',
      backgroundGradientFrom: 'var(--surface-2)',
      backgroundGradientTo: 'var(--surface-3)',
      textColor: '',
      eyebrow: 'Opiniones reales',
      title: 'Lo que dicen nuestros clientes',
      description: 'Miles de compradores ya encontraron lo que buscaban a través de nuestras ofertas.',
      testimonials: [
        { name: 'María G.', role: 'Compradora verificada', text: 'Encontré exactamente lo que buscaba a un precio increíble. El envío llegó antes de lo esperado.', rating: 5 },
        { name: 'Carlos R.', role: 'Comprador verificada', text: 'Comparé en varios sitios y aquí siempre encuentro las mejores ofertas de AliExpress.', rating: 5 },
        { name: 'Lucía M.', role: 'Compradora verificada', text: 'Me encanta que todo esté curado. Ahorro muchísimo tiempo buscando.', rating: 4 },
      ],
    },
    {
      id: 'seg-faq',
      type: 'faq',
      enabled: true,
      backgroundType: 'solid',
      backgroundSolid: 'var(--surface-1)',
      backgroundImage: '',
      backgroundGradientFrom: 'var(--surface-1)',
      backgroundGradientTo: 'var(--surface-2)',
      textColor: '',
      eyebrow: 'Dudas frecuentes',
      title: 'Preguntas frecuentes',
      description: 'Resolvemos las dudas más comunes sobre cómo comprar a través de nuestra tienda.',
      faqItems: [
        { question: '¿Cómo compro un producto?', answer: 'Haz clic en el producto y te llevaremos a AliExpress para completar la compra de forma segura. Nosotros no vendemos directamente: somos una tienda de afiliados.' },
        { question: '¿Cuánto tarda el envío?', answer: 'Depende del vendedor y del destino. La mayoría de los envíos tardan entre 7 y 15 días hábiles.' },
        { question: '¿El pago es seguro?', answer: 'Sí. La compra se realiza directamente en AliExpress, que cuenta con protección al comprador y métodos de pago seguros.' },
        { question: '¿Pagan algo extra por usar la tienda?', answer: 'No. Tú pagas el mismo precio que en AliExpress. Nosotros recibimos una comisión del vendedor sin coste adicional para ti.' },
      ],
    },
    {
      id: 'seg-newsletter',
      type: 'newsletter',
      enabled: true,
      backgroundType: 'solid',
      backgroundSolid: 'var(--surface-deep)',
      backgroundImage: '',
      backgroundGradientFrom: 'var(--surface-deep)',
      backgroundGradientTo: 'var(--surface-deep)',
      textColor: '',
      eyebrow: 'No te pierdas nada',
      title: 'Recibe las mejores ofertas en tu correo',
      description: 'Suscríbete y recibe cada semana los descuentos y novedades más relevantes de AliExpress.',
      newsletterButton: 'Suscribirme',
      newsletterPlaceholder: 'tu@correo.com',
    },
  ],
}


export function createSegment(type: SegmentType): HomepageSegment {
  const base = {
    id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    enabled: true,
    // Por defecto los segmentos nuevos usan la superficie principal del tema
    // (se adapta sola a modo claro/oscuro, sin bandas blancas "quemadas").
    backgroundType: 'solid' as BackgroundType,
    backgroundSolid: 'var(--surface-1)',
    backgroundImage: '',
    backgroundGradientFrom: 'var(--surface-1)',
    backgroundGradientTo: 'var(--surface-3)',
    textColor: '',
  }

  switch (type) {
    case 'text':
      return { ...base, title: 'Título de la sección', description: 'Escribe aquí la descripción de esta sección.' }
    case 'image-text':
      return { ...base, title: 'Imagen con texto', description: 'Describe la imagen a la derecha del texto.', imageAlt: 'Imagen descriptiva' }
    case 'stats':
      return { ...base, title: 'Cifras que respaldan', stats: [{ value: '+1.000', label: 'productos curados' }] }
    case 'cta':
      return { ...base, title: '¿Listo para encontrar tu hobby?', description: 'Explora las ofertas curadas y compra con confianza.', primaryButton: 'Ver ofertas', primaryHref: '#catalogo', secondaryButton: 'Ver catálogo', secondaryHref: '/catalogo' }
    case 'quote':
      return { ...base, quote: 'El hobby correcto cambia tu tiempo libre.', quoteAuthor: 'Equipo zonadehobbies' }
    // --- Nuevos tipos (afiliados) ---
    case 'category-grid':
      return { ...base, title: 'Explora por categoría', description: 'Encuentra las mejores ofertas de AliExpress organizadas por nicho.', categorySlugs: [] }
    case 'product-carousel':
      return { ...base, title: 'Ofertas destacadas', carouselLabel: 'Más buscados', productSlugs: [] }
    case 'trust-badges':
      return {
        ...base,
        title: 'Compra con confianza',
        badges: [
          { icon: 'truck', title: 'Envío rastreable', text: 'Seguimiento en tiempo real de tu pedido.' },
          { icon: 'shield', title: 'Compra protegida', text: 'Pago seguro respaldado por AliExpress.' },
          { icon: 'tag', title: 'Precios de oferta', text: 'Curamos los mejores descuentos del día.' },
        ],
      }
    case 'how-it-works':
      return {
        ...base,
        title: '¿Cómo funciona?',
        description: 'Elige, compara y compra directo en AliExpress con total transparencia.',
        steps: [
          { number: '01', title: 'Explora', text: 'Navega por nuestras categorías y ofertas curadas.' },
          { number: '02', title: 'Compara', text: 'Revisa precios, reseñas y valoraciones reales.' },
          { number: '03', title: 'Compra', text: 'Te llevamos a AliExpress para completar tu compra segura.' },
        ],
      }
    case 'faq':
      return {
        ...base,
        title: 'Preguntas frecuentes',
        faqItems: [
          { question: '¿Cómo compro un producto?', answer: 'Haz clic en el producto y te llevaremos a AliExpress para completar la compra de forma segura.' },
          { question: '¿Cuánto tarda el envío?', answer: 'Depende del vendedor y destino. La mayoría de los envíos tardan entre 7 y 15 días.' },
        ],
      }
    case 'testimonials':
      return {
        ...base,
        title: 'Lo que dicen nuestros clientes',
        testimonials: [
          { name: 'María G.', role: 'Compradora verificada', text: 'Encontré exactamente lo que buscaba a un precio increíble.', rating: 5 },
        ],
      }
    case 'newsletter':
      return {
        ...base,
        title: 'Recibe las mejores ofertas',
        description: 'Suscríbete y recibe en tu correo los descuentos y novedades más relevantes.',
        newsletterButton: 'Suscribirme',
        newsletterPlaceholder: 'tu@correo.com',
      }
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
    // Si no hay segmentos guardados (config nueva o vacía), se usa el seed por
    // defecto para que el inicio nunca quede "vacío/gris". El admin puede
    // editar o eliminar segmentos; al guardar, su lista persiste tal cual.
    segments: Array.isArray(src.segments) && src.segments.length > 0
      ? src.segments.filter((s) => s && typeof s === 'object')
      : DEFAULT_HOMEPAGE_CONFIG.segments,
  }
}


export function moveSegment(list: HomepageSegment[], from: number, to: number): HomepageSegment[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (!item) return list
  next.splice(to, 0, item)
  return next
}
