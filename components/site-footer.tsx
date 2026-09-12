'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Briefcase, Camera, Code2, Mail, MessageCircle, ShieldCheck } from 'lucide-react'
import { useTranslations } from '@/hooks/use-translations'
import { useLocalizedPath } from '@/hooks/use-localized-path'
import type { Translator } from '@/lib/i18n-messages'

// ---------- Tipos ----------

/** Textos editables del footer (provienen de site_settings.footer_texts). */
export type FooterTexts = { copyright?: string; slogan?: string }

/** Datos de marca mínimos que necesita el footer para el fallback. */
export type FooterBrand = { name: string; address: string }

/** Enlaces de redes sociales (provienen de site_settings.social_links). */
export type FooterSocial = { instagram?: string; linkedin?: string; email?: string }

/** Variante visual: storefront (tienda pública) o admin (panel de control). */
export type FooterVariant = 'storefront' | 'admin'

// ---------- Fallbacks ----------

const DEFAULT_BRAND: FooterBrand = { name: 'zonadehobbies', address: 'Caracas, Venezuela' }

const DEFAULT_FOOTER: FooterTexts = {
  copyright: '© 2026 zonadehobbies. Caracas, Venezuela.',
  slogan: 'Curamos AliExpress para que compres mejor.',
}

/**
 * Enlaces fijos del footer (SEO + confianza). Usan anclas de la home y los
 * documentos legales (/terminos, /privacidad, /afiliados): TODOS resuelven,
 * nunca generan un 404.
 */
const FOOTER_LINKS = {
  explore: [
    { key: 'footer.catalog', href: '/catalogo' },
    // Hub de contenido (guías y comparativas): puerta del cluster pSEO.
    { key: 'entry.allGuides', href: '/guias' },
    { key: 'footer.howItWorks', href: '/#como-funciona' },
    { key: 'footer.faq', href: '/#faq' },
  ],
  help: [
    { key: 'footer.contact', href: '/#contacto' },
    { key: 'footer.whatsapp', href: 'whatsapp' },
  ],
  legal: [
    { key: 'footer.terms', href: '/terminos' },
    { key: 'footer.privacy', href: '/privacidad' },
    { key: 'footer.affiliate', href: '/afiliados' },
  ],
} as const

/**
 * Pie de página compartido por toda la tienda (portada, catálogo y panel admin).
 * - Variante `storefront`: footer premium de 4 columnas (marca, explorar, ayuda,
 *   legal), aviso de afiliado obligatorio y redes con íconos correctos.
 * - Variante `admin`: barra compacta (no invade el panel de control).
 * Los textos son editables desde Configuración > Footer (site_settings).
 */
export function SiteFooter({
  footer,
  brand,
  social,
  variant = 'storefront',
  className = '',
  logoUrl,
  iconUrl,
  whatsapp,
}: {
  footer?: Partial<FooterTexts>
  brand?: Partial<FooterBrand>
  social?: Partial<FooterSocial>
  variant?: FooterVariant
  className?: string
  logoUrl?: string | null
  iconUrl?: string | null
  whatsapp?: string
}) {
  const currentBrand: FooterBrand = { ...DEFAULT_BRAND, ...(brand ?? {}) }
  const currentFooter: FooterTexts = { ...DEFAULT_FOOTER, ...(footer ?? {}) }
  // Etiquetas fijas de la interfaz traducidas al idioma activo.
  const t = useTranslations()
  // Enlaces internos del footer en el idioma activo (grafo de idiomas coherente).
  const localizedPath = useLocalizedPath()

  const copyright = currentFooter.copyright ?? `© 2026 ${currentBrand.name}. ${currentBrand.address}.`
  const slogan = currentFooter.slogan ?? 'Curamos AliExpress para que compres mejor.'

  /** URL de WhatsApp si hay número configurado. */
  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : ''

  /** Resuelve el href de un enlace del footer (anclas, rutas o WhatsApp). */
  function resolveHref(href: string): string {
    if (href === 'whatsapp') return whatsappHref
    return localizedPath(href)
  }

  // ---------- Variante ADMIN: barra compacta ----------
  if (variant === 'admin') {
    return (
      <footer className={`${className} border-t border-border px-5 py-7`}>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
          <span>{copyright}</span>
          <span className="flex items-center gap-1">
            <Code2 size={11} aria-hidden="true" /> {t('footer.developedBy')}{' '}
            <a href="https://portafolio-new-jet.vercel.app" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2 hover:text-brand">
              Keiber Paez
            </a>
          </span>
        </div>
      </footer>
    )
  }

  // ---------- Variante STOREFRONT: footer premium ----------
  return (
    <footer className={`${className} border-t border-border bg-card/40`}>
      <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <BrandColumn name={currentBrand.name} slogan={slogan} social={social} logoUrl={logoUrl} iconUrl={iconUrl} t={t} />
          <FooterColumn title={t('footer.explore')}>
            {FOOTER_LINKS.explore.map((link) => (
              <FooterLink key={link.key} href={resolveHref(link.href)} label={t(link.key)} />
            ))}
          </FooterColumn>
          <FooterColumn title={t('footer.help')}>
            {FOOTER_LINKS.help.map((link) =>
              link.href === 'whatsapp'
                ? whatsappHref
                  ? <FooterLink key={link.key} href={whatsappHref} label={t(link.key)} icon={<MessageCircle size={13} />} external />
                  : null
                : <FooterLink key={link.key} href={resolveHref(link.href)} label={t(link.key)} />,
            )}
          </FooterColumn>
          <FooterColumn title={t('footer.legal')}>
            {FOOTER_LINKS.legal.map((link) => (
              <FooterLink key={link.key} href={resolveHref(link.href)} label={t(link.key)} />
            ))}
          </FooterColumn>
        </div>

        {/* Aviso de afiliado (transparencia obligatoria en tiendas de afiliados). */}
        <div className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-background/60 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-strong" aria-hidden="true" />
          <p className="text-xs leading-5 text-muted-foreground">{t('footer.affiliateNotice')}</p>
        </div>

        {/* Barra inferior: copyright + crédito de desarrollo */}
        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>{copyright}</span>
          <p className="flex items-center gap-1">
            <Code2 size={11} aria-hidden="true" />
            {t('footer.developedBy')}{' '}
            <a href="https://portafolio-new-jet.vercel.app" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2 transition-colors hover:text-brand">
              Keiber Paez
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}

/** Columna de marca del footer: logo + slogan + redes reales. */
function BrandColumn({ name, slogan, social, logoUrl, iconUrl, t }: {
  name: string
  slogan: string
  social?: Partial<FooterSocial>
  logoUrl?: string | null
  iconUrl?: string | null
  t: Translator
}) {
  // Enlaces internos del footer en el idioma activo (el logo también enlaza a la home del idioma).
  const localizedPath = useLocalizedPath()
  return (
    <div className="flex flex-col gap-4">
      <Link href={localizedPath('/')} className="flex items-center gap-2" aria-label={name}>
        {logoUrl ? (
          <Image src={logoUrl} alt={name} width={180} height={72} className="h-8 w-auto object-contain dark:invert" />
        ) : (
          <>
            {iconUrl && <Image src={iconUrl} alt="" width={32} height={32} className="size-8 rounded-lg object-cover" />}
            <span className="text-lg font-semibold tracking-[-0.05em]">{name}</span>
          </>
        )}
      </Link>
      <p className="max-w-xs text-sm text-muted-foreground">{slogan}</p>

      {/* Redes con su ícono correcto (solo si están configuradas). */}
      {(social?.instagram || social?.linkedin || social?.email) && (
        <div className="flex items-center gap-2">
          {social.instagram && (
            <a href={social.instagram} aria-label="Instagram" target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand hover:text-brand">
              <Camera size={16} />
            </a>
          )}
          {social.linkedin && (
            <a href={social.linkedin} aria-label="LinkedIn" target="_blank" rel="noreferrer" className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand hover:text-brand">
              <Briefcase size={16} />
            </a>
          )}
          {social.email && (
            <a href={social.email} aria-label={t('footer.sendEmail')} className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand hover:text-brand">
              <Mail size={16} />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/** Título + lista de una columna del footer (átomo). */
function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-[.2em] text-foreground">{title}</p>
      <ul className="flex flex-col gap-2 text-sm">{children}</ul>
    </div>
  )
}

/**
 * Enlace del footer. Usa <a> para anclas/externos (scroll y target nativos) y
 * <Link> para rutas internas (navegación cliente, sin recargar la página).
 */
function FooterLink({ href, label, icon, external }: { href: string; label: string; icon?: React.ReactNode; external?: boolean }) {
  if (!href) return null
  const className = 'inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-brand-strong'
  if (external || href.startsWith('http') || href.includes('#')) {
    return (
      <li>
        <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className={className}>
          {icon} {label}
        </a>
      </li>
    )
  }
  return (
    <li>
      <Link href={href} className={className}>
        {icon} {label}
      </Link>
    </li>
  )
}
