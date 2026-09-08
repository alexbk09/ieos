'use client'

import { useMemo, useState } from 'react'
import { LOCAL_IMAGES_PREFIX } from '@/lib/constants'
import { ArrowUpRight, CheckCircle2, Globe2, LoaderCircle, MapPin, Navigation, Search, Send, Sparkles, Star } from 'lucide-react'
import { CaptchaWidget } from '@/components/ui/captcha-widget'
import { ProductCard, type CardProduct } from '@/components/product-card'
import { ProductDetailModal } from '@/components/product-detail-modal'
import { SiteHeader, type HeaderBrand, type HeaderNavLink } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { CartDrawer } from '@/components/cart-drawer'
import { useCart } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useAgentAddToCart } from '@/hooks/use-agent-add-to-cart'
import { AgentChat } from '@/components/agent-chat'
import { DEFAULT_HOMEPAGE_CONFIG, normalizeHomepageConfig } from '@/lib/homepage-config'
import { HomepageHero, StudioSection } from '@/components/homepage-sections'

type Product = { id: string; name: string; slug: string; description: string | null; price_usd: number; stock: number; image_url: string; colors?: string[]; peso?: string | null; tamaño?: string | null; specifications?: Record<string, string>; category_id?: string | null; featured?: boolean; categories?: { id: string; name: string; slug: string; description: string | null }[]; images?: { id: string; url: string; alt_text: string | null; sort_order: number; color_name?: string | null }[] }

export type StorefrontSettings = {
  navLinks: HeaderNavLink[]
  brand: { name: string; tagline: string; logoUrl: string | null; iconUrl: string | null; whatsapp: string; address: string; email: string }
  hero: { eyebrow?: string; title?: string; titleHighlight?: string; description?: string; primaryButton?: string; primaryHref?: string; secondaryButton?: string; secondaryHref?: string; badge?: string; imageAlt?: string; imageCaption?: string; imagePosition?: string; stats?: { value: string; label: string }[] }
  heroImage: string
  studio: { eyebrow?: string; title?: string; items?: { number: string; text: string }[] }
  contact: { eyebrow?: string; title?: string; description?: string; formNamePlaceholder?: string; formEmailPlaceholder?: string; formMessagePlaceholder?: string; formButton?: string }
  footer: { copyright?: string; slogan?: string }
  social: { instagram?: string; linkedin?: string; email?: string }
  map: { lat: number; lng: number; zoom: number }
  homepageConfig: import('@/lib/homepage-config').HomepageConfig
}

const FALLBACK_SETTINGS: StorefrontSettings = {
  navLinks: [],
  brand: { name: 'ilumaX', tagline: 'Arquitectura de luz', logoUrl: null, iconUrl: null, whatsapp: '584122649707', address: 'Caracas, Venezuela', email: 'hola@ilumax.ve' },
  hero: {
    eyebrow: 'Arquitectura de luz',
    title: 'Luz que define ',
    titleHighlight: 'espacios.',
    description: 'Soluciones LED y revestimientos que convierten ambientes cotidianos en experiencias memorables. Diseñamos la atmósfera, tú habitas el resultado.',
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
  heroImage: `${LOCAL_IMAGES_PREFIX}linea-aura.webp`,
  studio: {
    eyebrow: 'El studio',
    title: 'Diseñamos lo que otros solo iluminan.',
    items: [
      { number: '01', text: 'Curaduría de piezas con intención y larga vida útil.' },
      { number: '02', text: 'Asesoría para traducir ideas en instalaciones reales.' },
      { number: '03', text: 'Materiales que hacen que cada proyecto tenga identidad.' },
    ],
  },
  contact: {
    eyebrow: 'Hablemos',
    title: 'Tu espacio tiene algo que decir.',
    description: 'Cuéntanos sobre tu próximo proyecto. Nuestro equipo puede ayudarte a elegir la solución correcta.',
    formNamePlaceholder: 'Tu nombre',
    formEmailPlaceholder: 'Correo electrónico',
    formMessagePlaceholder: 'Cuéntanos sobre tu proyecto',
    formButton: 'Enviar mensaje',
  },
  footer: { copyright: '© 2025 ilumaX. Caracas, Venezuela.', slogan: 'Iluminamos ideas.' },
  social: { instagram: 'https://instagram.com', linkedin: 'https://linkedin.com', email: 'mailto:hola@ilumax.ve' },
  map: { lat: 10.4806, lng: -66.9036, zoom: 13 },
  homepageConfig: DEFAULT_HOMEPAGE_CONFIG,
}

const fallbackProducts: Product[] = [
  { id: '1', name: 'Panel LED Orbis 24W', slug: 'panel-led-orbis-24w', description: 'Iluminación uniforme para espacios contemporáneos.', price_usd: 28, stock: 42, image_url: `${LOCAL_IMAGES_PREFIX}panel-led.webp`, colors: ['Blanco', 'Negro'], specifications: { voltage: '110-240V', watts: '24W', weight: '0.8 kg' }, featured: true },
  { id: '2', name: 'Línea Aura 12W', slug: 'linea-aura-12w', description: 'Luz lineal para crear atmósferas limpias.', price_usd: 36, stock: 18, image_url: `${LOCAL_IMAGES_PREFIX}linea-aura.webp`, colors: ['Blanco cálido', 'Blanco neutro'], specifications: { voltage: '12V', watts: '12W', weight: '0.4 kg' }, featured: true },
  { id: '3', name: 'Wall Tile Nova', slug: 'wall-tile-nova', description: 'Revestimiento modular con presencia escultórica.', price_usd: 22.5, stock: 27, image_url: `${LOCAL_IMAGES_PREFIX}wall-tile.webp`, colors: ['Arena', 'Grafito'], specifications: { dimensions: '50 x 50 cm', weight: '1.2 kg' }, featured: true },
]

const categories = ['Todos', 'Iluminación LED', 'Revestimiento 3D', 'Perfiles y accesorios']

const categoryFor = (p: Product) => p.categories?.[0]?.name ?? (p.name.includes('Tile') ? 'Revestimiento 3D' : 'Iluminación LED')

export function Storefront({ initialProducts, settings }: { initialProducts?: Product[]; settings?: Partial<StorefrontSettings> }) {
  const products = initialProducts && initialProducts.length > 0 ? initialProducts : fallbackProducts
  const exchangeRate = useExchangeRate()
  const { cart, add, change, total, count, cartOpen, setCartOpen, submitting, requested, requestOrder } = useCart(exchangeRate)

  // El Asistente IA agrega productos al carrito cuando ejecuta agregarAlCarrito.
  useAgentAddToCart(add)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [selected, setSelected] = useState<Product | null>(null)

  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [captchaVerified, setCaptchaVerified] = useState(false)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [contactSending, setContactSending] = useState(false)
  const [contactError, setContactError] = useState('')
  const [contactSent, setContactSent] = useState(false)

  const cfg: StorefrontSettings = {
    ...FALLBACK_SETTINGS,
    ...settings,
    brand: { ...FALLBACK_SETTINGS.brand, ...settings?.brand },
    hero: { ...FALLBACK_SETTINGS.hero, ...settings?.hero },
    studio: { ...FALLBACK_SETTINGS.studio, ...settings?.studio },
    contact: { ...FALLBACK_SETTINGS.contact, ...settings?.contact },
    footer: { ...FALLBACK_SETTINGS.footer, ...settings?.footer },
    social: { ...FALLBACK_SETTINGS.social, ...settings?.social },
    map: { ...FALLBACK_SETTINGS.map, ...settings?.map },
    homepageConfig: normalizeHomepageConfig(settings?.homepageConfig ?? {}),
  }

  const brand = cfg.brand
  const hero = cfg.hero
  const heroImage = cfg.heroImage || `${LOCAL_IMAGES_PREFIX}linea-aura.webp`
  const heroAlt = hero.imageAlt ?? `${brand.name} — iluminación de portada`
  const heroStats = hero.stats && hero.stats.length > 0 ? hero.stats : FALLBACK_SETTINGS.hero.stats
  const studioItems = cfg.studio.items && cfg.studio.items.length > 0 ? cfg.studio.items : FALLBACK_SETTINGS.studio.items
  const navLinks = cfg.navLinks && cfg.navLinks.length > 0 ? cfg.navLinks : []

  const filtered = useMemo(() => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) && (category === 'Todos' || categoryFor(p) === category)), [query, category, products])

  function handleCaptchaChange(verified: boolean, answer: string) {
    setCaptchaVerified(verified)
    setCaptchaAnswer(answer)
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (contactSending) return
    setContactError('')
    setContactSent(false)

    if (!contactName.trim() || contactName.trim().length < 2) {
      setContactError('Escribe tu nombre (mínimo 2 caracteres)')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail.trim())) {
      setContactError('Ingresa un correo electrónico válido')
      return
    }
    if (!contactMessage.trim() || contactMessage.trim().length < 10) {
      setContactError('El mensaje debe tener al menos 10 caracteres')
      return
    }
    if (!captchaVerified || !captchaAnswer) {
      setContactError('Resuelve el captcha para continuar')
      return
    }

    setContactSending(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName.trim(),
          email: contactEmail.trim(),
          message: contactMessage.trim(),
          captcha: captchaAnswer,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setContactError(data.error ?? 'No se pudo enviar el mensaje. Inténtalo de nuevo.')
        return
      }
      setContactSent(true)
      setContactName('')
      setContactEmail('')
      setContactMessage('')
      setCaptchaVerified(false)
      setCaptchaAnswer('')
    } catch {
      setContactError('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setContactSending(false)
    }
  }

  return <div className="flex min-h-screen flex-col bg-background text-foreground">
    <SiteHeader
      cartCount={count}
      onOpenCart={() => setCartOpen(true)}
      navLinks={navLinks}
      brand={{ name: brand.name, tagline: brand.tagline, logoUrl: brand.logoUrl, iconUrl: brand.iconUrl }}
    />
    <main className="flex-1">
      <HomepageHero config={cfg.homepageConfig} hero={hero} heroImage={heroImage} brandTagline={brand.tagline} />

      <section id="catalogo" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="flex flex-col justify-between gap-5 border-b border-border pb-7 md:flex-row md:items-end">
          <div><p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">Selección {brand.name}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.05em]">Encuentra tu próxima atmósfera</h2></div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5"><Search size={16} className="text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" className="w-44 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-full border border-border bg-card px-4 py-2.5 text-sm outline-none">{categories.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product as CardProduct} rate={exchangeRate} onAdd={add} onViewDetails={setSelected} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <a href="/catalogo" className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-navy-foreground hover:bg-brand hover:text-brand-foreground">Ver catálogo completo <ArrowUpRight size={16} /></a>
        </div>
      </section>

      <StudioSection config={cfg.homepageConfig} studio={cfg.studio} />

      <section id="contacto" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">{cfg.contact.eyebrow ?? 'Hablemos'}</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-.06em]">{cfg.contact.title ?? 'Tu espacio tiene algo que decir.'}</h2>
          <p className="mt-5 max-w-md leading-7 text-muted-foreground">{cfg.contact.description}</p>

          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-strong"><MapPin size={17} /></span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{brand.name}</p>
              <p className="truncate text-xs text-muted-foreground">{brand.address}</p>
            </div>
          </div>

          <div className="mt-3 flex gap-3">
            {cfg.social.instagram && <a href={cfg.social.instagram} aria-label="Instagram" className="grid size-10 place-items-center rounded-full border border-border"><Star size={17} /></a>}
            {cfg.social.linkedin && <a href={cfg.social.linkedin} aria-label="LinkedIn" className="grid size-10 place-items-center rounded-full border border-border"><Star size={17} /></a>}
            {cfg.social.email && <a href={cfg.social.email} aria-label="Enviar correo" className="grid size-10 place-items-center rounded-full border border-border"><Globe2 size={17} /></a>}
          </div>
        </div>

        <form onSubmit={handleContactSubmit} className="grid gap-3">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} required placeholder={cfg.contact.formNamePlaceholder ?? 'Tu nombre'} className="rounded-2xl border border-border bg-transparent px-5 py-4 text-sm outline-none focus:border-brand" />
          <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required type="email" placeholder={cfg.contact.formEmailPlaceholder ?? 'Correo electrónico'} className="rounded-2xl border border-border bg-transparent px-5 py-4 text-sm outline-none focus:border-brand" />
          <textarea value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} required placeholder={cfg.contact.formMessagePlaceholder ?? 'Cuéntanos sobre tu proyecto'} rows={4} className="rounded-2xl border border-border bg-transparent px-5 py-4 text-sm outline-none focus:border-brand" />

          <CaptchaWidget onChange={handleCaptchaChange} />

          {contactError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{contactError}</p>}
          {contactSent && <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"><CheckCircle2 size={16} /> ¡Mensaje enviado! Te responderemos pronto.</p>}

          <button type="submit" disabled={contactSending} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-4 text-sm font-semibold text-brand-foreground transition-all hover:bg-brand-strong active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60">
            {contactSending ? <><LoaderCircle size={16} className="animate-spin" /> Enviando…</> : <><Send size={15} /> {cfg.contact.formButton ?? 'Enviar mensaje'}</>}
          </button>
        </form>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-brand/10 text-brand-strong"><MapPin size={17} /></span>
              <div>
                <p className="text-sm font-semibold">Encuéntranos aquí</p>
                <p className="text-xs text-muted-foreground">{brand.address}</p>
              </div>
            </div>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${cfg.map.lat},${cfg.map.lng}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-navy px-5 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-brand hover:text-brand-foreground">
              <Navigation size={14} /> Cómo llegar
            </a>
          </div>
          <iframe title={`Mapa de ${brand.name}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${cfg.map.lng - 0.01}%2C${cfg.map.lat - 0.008}%2C${cfg.map.lng + 0.01}%2C${cfg.map.lat + 0.008}&layer=mapnik&marker=${cfg.map.lat}%2C${cfg.map.lng}`} className="h-[26rem] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </section>
    </main>
    <SiteFooter footer={cfg.footer} brand={{ name: brand.name, address: brand.address }} social={cfg.social} />

    {selected && (
      <ProductDetailModal
        product={selected as CardProduct}
        rate={exchangeRate}
        onClose={() => setSelected(null)}
        onAdd={(product, unit, quantity, colorName) => add(product, unit, quantity, colorName)}
      />
    )}

    <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} onChange={change} total={total} onSubmit={requestOrder} submitting={submitting} requested={requested} exchangeRate={exchangeRate} />

    <AgentChat />
  </div>
}