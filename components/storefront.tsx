'use client'

import { useEffect, useMemo, useState } from 'react'
import { SEARCH_LOG_SOURCES } from '@/lib/constants'
import { trackSearchLog } from '@/lib/analytics-client'
import { ArrowUpRight, BadgeCheck, Briefcase, Camera, CheckCircle2, LoaderCircle, Mail, Search, Send } from 'lucide-react'


import { CaptchaWidget } from '@/components/ui/captcha-widget'
import { ProductCard, type CardProduct } from '@/components/product-card'
import { ProductDetailModal } from '@/components/product-detail-modal'
import { SiteHeader, type HeaderNavLink } from '@/components/site-header'

import { SiteFooter } from '@/components/site-footer'
import { CartDrawer } from '@/components/cart-drawer'
import { AffiliateRedirectModal } from '@/components/affiliate-redirect-modal'
import { useCart } from '@/hooks/use-cart'
import { useExchangeRate } from '@/hooks/use-exchange-rate'
import { useAgentAddToCart } from '@/hooks/use-agent-add-to-cart'
import { useLocalizedPath } from '@/hooks/use-localized-path'
import { useTranslations } from '@/hooks/use-translations'
import { DEFAULT_HOMEPAGE_CONFIG, normalizeHomepageConfig } from '@/lib/homepage-config'
import { HomepageHero, StudioSection, type SegmentData } from '@/components/homepage-sections'


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
  homepageConfig: import('@/lib/homepage-config').HomepageConfig
}

const FALLBACK_SETTINGS: StorefrontSettings = {
  navLinks: [],
  brand: { name: 'zonadehobbies', tagline: 'Ofertas de AliExpress verificadas', logoUrl: '/logos/zonadehobbies-wordmark-on-light.webp', iconUrl: '/logos/zonadehobbies-favicon.png', whatsapp: '584122649707', address: 'Caracas, Venezuela', email: 'hola@zonadehobbies.online' },
  hero: {
    eyebrow: 'Ofertas verificadas · Envío internacional',
    title: 'Las mejores ofertas de AliExpress, ',
    titleHighlight: 'curadas para ti.',
    description: 'Comparamos miles de productos y seleccionamos solo los mejor valorados: precio real, reseñas de compradores y envío rastreable. Compra sin sorpresas.',
    primaryButton: 'Ver ofertas del día',
    primaryHref: '#catalogo',
    secondaryButton: 'Explorar categorías',
    secondaryHref: '/catalogo',
    badge: 'Actualizado hoy',
    imageAlt: 'Ofertas destacadas de AliExpress',
    imageCaption: 'Curaduría de ofertas',
    imagePosition: '01 / 03',
    stats: [
      { value: '+1.000', label: 'productos curados' },
      { value: '7-15', label: 'días de envío' },
      { value: '0%', label: 'coste extra para ti' },
    ],
  },
  heroImage: '',
  studio: {
    eyebrow: 'Cómo funciona',
    title: 'Compra mejor en AliExpress con nuestra ayuda.',
    items: [
      { number: '01', text: 'Explora categorías y ofertas curadas por nuestro equipo.' },
      { number: '02', text: 'Compara precios, reseñas y valoraciones reales de compradores.' },
      { number: '03', text: 'Compra directo en AliExpress con total seguridad y transparencia.' },
    ],
  },
  contact: {
    eyebrow: 'Hablemos',
    title: '¿Necesitas ayuda para elegir?',
    description: 'Escríbenos y te ayudamos a encontrar el producto ideal o a resolver cualquier duda sobre tu compra en AliExpress.',
    formNamePlaceholder: 'Tu nombre',
    formEmailPlaceholder: 'Correo electrónico',
    formMessagePlaceholder: 'Cuéntanos qué buscas',
    formButton: 'Enviar mensaje',
  },
  footer: { copyright: '© 2026 zonadehobbies. Caracas, Venezuela.', slogan: 'Curamos AliExpress para que compres mejor.' },
  social: { instagram: '', linkedin: '', email: 'mailto:hola@zonadehobbies.online' },
  homepageConfig: DEFAULT_HOMEPAGE_CONFIG,
}

// NOTA: NO hay productos "de ejemplo". Mostrar un catálogo ficticio (LED)
// confunde al cliente y genera URLs indexables falsas → si la BD viene vacía se
// muestra un estado vacío honesto.
const categoryFor = (p: Product) => p.categories?.[0]?.name ?? 'General'

export function Storefront({ initialProducts, settings, categories: initialCategories }: { initialProducts?: Product[]; settings?: Partial<StorefrontSettings>; categories?: { id: string; name: string; slug: string; description?: string | null }[] }) {

  // Catálogo real (sin datos de ejemplo). Si viene vacío se muestra estado vacío.
  const products = initialProducts ?? []
  // Categorías del filtro local: las REALES del catálogo (nada quemado).
  const categories = useMemo(() => ['Todos', ...(initialCategories ?? []).map((c) => c.name)], [initialCategories])
  const exchangeRate = useExchangeRate()
  const { cart, add, change, total, count, cartOpen, setCartOpen, popupsBlocked, setPopupsBlocked, finishAffiliateCheckout, clear } = useCart()

  // El Asistente IA agrega productos al carrito cuando ejecuta agregarAlCarrito.
  useAgentAddToCart(add)
  // Enlaces internos del inicio (CTA a catálogo, etc.) en el idioma activo.
  const localizedPath = useLocalizedPath()
  // Traductor de la interfaz (idioma activo de la página).
  const t = useTranslations()
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
    homepageConfig: normalizeHomepageConfig(settings?.homepageConfig ?? {}),
  }

  const brand = cfg.brand
  const hero = cfg.hero
  // Sin imagen configurada NO se inventa una: la portada muestra el LOGO de la
  // marca (visual sin marco). Así no aparece la foto heredada de la era LED.
  const heroImage = cfg.heroImage
  const navLinks = cfg.navLinks && cfg.navLinks.length > 0 ? cfg.navLinks : []

  // El bloque "Cómo funciona" vive en los segmentos del inicio. Si el admin NO
  // tiene un segmento 'how-it-works' habilitado, se renderiza el bloque Studio
  // (studio_texts) para que su contenido editable nunca quede huérfano y el
  // ancla #como-funciona del menú/footer siempre resuelva.
  const hasHowItWorksSegment = cfg.homepageConfig.segments.some((s) => s.enabled && s.type === 'how-it-works')


  // Datos que alimentan los segmentos dinámicos (category-grid / product-carousel).
  const segmentData: SegmentData = {
    categories: initialCategories ?? [],
    products: products as CardProduct[],
    rate: exchangeRate,
    onAdd: add,
    onViewDetails: (p) => setSelected(p as Product),
  }

  const filtered = useMemo(() => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) && (category === 'Todos' || categoryFor(p) === category)), [query, category, products])

  // Analítica: registra el término buscado en la portada solo cuando el
  // usuario se detiene de escribir (debounce 500ms). El conteo es local.
  useEffect(() => {
    if (query.trim().length < 2) return
    const t = setTimeout(() => {
      trackSearchLog(query.trim(), SEARCH_LOG_SOURCES.CATALOG_FILTER, filtered.length)
    }, 500)
    return () => clearTimeout(t)
  }, [query, filtered.length])

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
      <HomepageHero
        config={cfg.homepageConfig}
        hero={hero}
        heroImage={heroImage}
        brandTagline={brand.tagline}
        brandName={brand.name}
        brandLogoUrl={brand.logoUrl}
        brandIconUrl={brand.iconUrl}
        data={segmentData}
      />

      {/* "Cómo funciona": se usa el bloque Studio solo como respaldo si el admin
          no tiene un segmento how-it-works (evita duplicar el contenido). */}
      {!hasHowItWorksSegment && (
        <StudioSection config={cfg.homepageConfig} studio={cfg.studio} anchorId="como-funciona" />
      )}

      <section id="catalogo" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="flex flex-col justify-between gap-5 border-b border-border pb-7 md:flex-row md:items-end">
          <div><p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">Catálogo {brand.name}</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.05em]">Explora y compara productos</h2></div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5"><Search size={16} className="text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" aria-label={t('catalog.searchLabel')} className="w-44 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></label>
            {/* aria-label: sin él el select no tenía nombre accesible (auditoría select-name). */}
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t('catalog.allCategories')} className="rounded-full border border-border bg-card px-4 py-2.5 text-sm outline-none">{categories.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
        {filtered.length > 0 ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product as CardProduct} rate={exchangeRate} onAdd={add} onViewDetails={setSelected} />
            ))}
          </div>
        ) : (
          /* Estado vacío honesto: nunca se inventan productos de ejemplo. */
          <div className="mt-8 grid place-items-center rounded-3xl border border-dashed border-border py-16 text-center">
            <p className="text-sm text-muted-foreground">{t('home.catalogEmpty')}</p>
          </div>
        )}
        <div className="mt-10 text-center">
          <a href={localizedPath('/catalogo')} className="inline-flex items-center gap-2 rounded-full bg-navy px-6 py-3 text-sm font-medium text-navy-foreground hover:bg-brand hover:text-brand-foreground">Ver catálogo completo <ArrowUpRight size={16} /></a>
        </div>
      </section>

      {/* Contacto ligero (sin mapa) */}

      <section id="contacto" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">{cfg.contact.eyebrow ?? 'Hablemos'}</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-.06em]">{cfg.contact.title ?? '¿Necesitas ayuda para elegir?'}</h2>
          <p className="mt-5 max-w-md leading-7 text-muted-foreground">{cfg.contact.description}</p>

          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-strong"><BadgeCheck size={17} /></span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{brand.name}</p>
              <p className="truncate text-xs text-muted-foreground">{brand.email}</p>
            </div>
          </div>

          <div className="mt-3 flex gap-3">
            {cfg.social.instagram && <a href={cfg.social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="grid size-10 place-items-center rounded-full border border-border transition-colors hover:border-brand-strong hover:text-brand-strong"><Camera size={17} /></a>}
            {cfg.social.linkedin && <a href={cfg.social.linkedin} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="grid size-10 place-items-center rounded-full border border-border transition-colors hover:border-brand-strong hover:text-brand-strong"><Briefcase size={17} /></a>}
            {cfg.social.email && <a href={cfg.social.email} aria-label={t('footer.sendEmail')} className="grid size-10 place-items-center rounded-full border border-border transition-colors hover:border-brand-strong hover:text-brand-strong"><Mail size={17} /></a>}
          </div>
        </div>

        <form onSubmit={handleContactSubmit} className="grid gap-3">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} required placeholder={cfg.contact.formNamePlaceholder ?? 'Tu nombre'} aria-label={cfg.contact.formNamePlaceholder ?? 'Tu nombre'} className="rounded-2xl border border-border bg-transparent px-5 py-4 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
          <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required type="email" placeholder={cfg.contact.formEmailPlaceholder ?? 'Correo electrónico'} aria-label={cfg.contact.formEmailPlaceholder ?? 'Correo electrónico'} className="rounded-2xl border border-border bg-transparent px-5 py-4 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
          <textarea value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} required placeholder={cfg.contact.formMessagePlaceholder ?? 'Cuéntanos sobre tu proyecto'} aria-label={cfg.contact.formMessagePlaceholder ?? 'Cuéntanos sobre tu proyecto'} rows={4} className="rounded-2xl border border-border bg-transparent px-5 py-4 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />

          <CaptchaWidget onChange={handleCaptchaChange} />

          {contactError && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">{contactError}</p>}
          {contactSent && <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"><CheckCircle2 size={16} /> ¡Mensaje enviado! Te responderemos pronto.</p>}

          {/* hover:brightness en lugar de hover:bg-brand-strong: el acento oscuro
              (necesario para AA como texto) dejaría este CTA por debajo de 4.5:1. */}
          <button type="submit" disabled={contactSending} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-4 text-sm font-semibold text-brand-foreground transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60">
            {contactSending ? <><LoaderCircle size={16} className="animate-spin" /> Enviando…</> : <><Send size={15} /> {cfg.contact.formButton ?? 'Enviar mensaje'}</>}
          </button>
        </form>
      </section>
    </main>
    <SiteFooter
      footer={cfg.footer}
      brand={{ name: brand.name, address: brand.address }}
      social={cfg.social}
      logoUrl={brand.logoUrl}
      iconUrl={brand.iconUrl}
      whatsapp={brand.whatsapp}
    />

    {selected && (
      <ProductDetailModal
        product={selected as CardProduct}
        rate={exchangeRate}
        onClose={() => setSelected(null)}
        onAdd={(product, unit, quantity, colorName) => add(product, unit, quantity, colorName)}
      />
    )}

    <CartDrawer
      open={cartOpen}
      onClose={() => setCartOpen(false)}
      cart={cart}
      onChange={change}
      total={total}
      onFinishCheckout={finishAffiliateCheckout}
      exchangeRate={exchangeRate}
      hasNonAffiliate={cart.some((item) => !item.url_afiliado_ali && !item.url_afiliado_amazon && !item.url_afiliado_store)}
    />

    <AffiliateRedirectModal
      open={popupsBlocked}
      items={cart}
      rate={exchangeRate}
      onClose={() => setPopupsBlocked(false)}
      onClearCheckout={clear}
    />
  </div>
}
