'use client'

import { Globe2, Star } from 'lucide-react'

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

  const copyright = currentFooter.copyright ?? `© 2025 ${currentBrand.name}. ${currentBrand.address}.`
  const slogan = currentFooter.slogan ?? 'Iluminamos ideas.'

  // Clases según la variante: la tienda usa estilos propios (slate/blue);
  // el admin usa los tokens del tema shadcn.
  const baseClass =
    variant === 'admin'
      ? 'border-t border-border px-5 py-7'
      : 'border-t border-slate-200 px-5 py-7 dark:border-slate-800'
  const textClass = variant === 'admin' ? 'text-muted-foreground' : 'text-slate-500'
  const iconClass =
    variant === 'admin'
      ? 'text-muted-foreground hover:text-foreground'
      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'

  return (
    <footer className={`${baseClass} ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs sm:flex-row sm:items-center">
        {/* Redes sociales (opcional) */}
        {(social?.instagram || social?.linkedin || social?.email) && (
          <div className="flex items-center gap-2">
            {social.instagram && (
              <a href={social.instagram} aria-label="Instagram" className={`grid size-8 place-items-center rounded-full border transition-colors ${variant === 'admin' ? 'border-border' : 'border-slate-200 dark:border-slate-700'} ${iconClass}`}>
                <Star size={14} />
              </a>
            )}
            {social.linkedin && (
              <a href={social.linkedin} aria-label="LinkedIn" className={`grid size-8 place-items-center rounded-full border transition-colors ${variant === 'admin' ? 'border-border' : 'border-slate-200 dark:border-slate-700'} ${iconClass}`}>
                <Star size={14} />
              </a>
            )}
            {social.email && (
              <a href={social.email} aria-label="Enviar correo" className={`grid size-8 place-items-center rounded-full border transition-colors ${variant === 'admin' ? 'border-border' : 'border-slate-200 dark:border-slate-700'} ${iconClass}`}>
                <Globe2 size={14} />
              </a>
            )}
          </div>
        )}

        <span className={textClass}>{copyright}</span>
        {slogan && <span className={textClass}>{slogan}</span>}
      </div>
    </footer>
  )
}