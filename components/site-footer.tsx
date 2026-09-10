'use client'

import { Code2, Globe2, Star } from 'lucide-react'
import { useTranslations } from '@/hooks/use-translations'

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

const DEFAULT_BRAND: FooterBrand = { name: 'ilumaX', address: 'Caracas, Venezuela' }

const DEFAULT_FOOTER: FooterTexts = {
  copyright: '© 2025 ilumaX. Caracas, Venezuela.',
  slogan: 'Iluminamos ideas.',
}

/**
 * Pie de página compartido por toda la tienda (portada, catálogo y panel admin).
 * Los textos son editables desde Configuración > Footer (site_settings).
 * Si no llegan datos, usa valores por defecto para que siempre se vea bien.
 */
export function SiteFooter({
  footer,
  brand,
  social,
  variant = 'storefront',
  className = '',
}: {
  footer?: Partial<FooterTexts>
  brand?: Partial<FooterBrand>
  social?: Partial<FooterSocial>
  variant?: FooterVariant
  className?: string
}) {
  const currentBrand: FooterBrand = { ...DEFAULT_BRAND, ...(brand ?? {}) }
  const currentFooter: FooterTexts = { ...DEFAULT_FOOTER, ...(footer ?? {}) }
  // Etiquetas fijas de la interfaz traducidas al idioma activo.
  const t = useTranslations()

  const copyright = currentFooter.copyright ?? `© 2025 ${currentBrand.name}. ${currentBrand.address}.`
  const slogan = currentFooter.slogan ?? 'Iluminamos ideas.'

  // Clases según la variante: la tienda y el admin usan los tokens
  // semánticos del tema de marca (--brand, --border, --muted…).
  const baseClass = 'border-t border-border px-5 py-7'
  const textClass = 'text-muted-foreground'
  const iconClass = 'text-muted-foreground hover:text-brand'

  return (
    <footer className={`${baseClass} ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs sm:flex-row sm:items-center">
        {/* Redes sociales (opcional) */}
        {(social?.instagram || social?.linkedin || social?.email) && (
          <div className="flex items-center gap-2">
            {social.instagram && (
              <a href={social.instagram} aria-label="Instagram" className={`grid size-8 place-items-center rounded-full border border-border transition-colors ${iconClass}`}>
                <Star size={14} />
              </a>
            )}
            {social.linkedin && (
              <a href={social.linkedin} aria-label="LinkedIn" className={`grid size-8 place-items-center rounded-full border border-border transition-colors ${iconClass}`}>
                <Star size={14} />
              </a>
            )}
            {social.email && (
              <a href={social.email} aria-label={t('footer.sendEmail')} className={`grid size-8 place-items-center rounded-full border border-border transition-colors ${iconClass}`}>
                <Globe2 size={14} />
              </a>
            )}
          </div>
        )}

        <span className={textClass}>{copyright}</span>
        {slogan && <span className={textClass}>{slogan}</span>}

        {/* Crédito de desarrollo: enlace a la portafolio del programador.
            Usa los tokens del tema (accent/primary) para adaptarse al modo
            claro/oscuro y a la variante admin. */}
        <div className="flex flex-col items-start gap-1 border-l-2 border-border pl-3">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Code2 size={11} aria-hidden="true" />
            {t('footer.developedBy')}
          </p>
          <a
            href="https://portafolio-new-jet.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-brand"
          >
            <span className="underline decoration-border underline-offset-2 transition-colors group-hover:decoration-brand">
              Keiber Paez
            </span>
          </a>
        </div>
      </div>
    </footer>
  )
}
