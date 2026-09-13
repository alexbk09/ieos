'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { CircleUserRound, Menu, ShoppingBag, X } from 'lucide-react'
import { getBrowserUser, getBrowserUserRole } from '@/services/auth-client'
import { ThemeToggle } from '@/components/theme-toggle'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { UserMenu } from '@/components/user-menu'
import { useTranslations } from '@/hooks/use-translations'
import { useLocalizedPath } from '@/hooks/use-localized-path'

type SessionRole = 'admin' | 'client' | null

export type HeaderNavLink = { href: string; label: string; highlight?: boolean }

export type HeaderBrand = {
  name: string
  tagline: string
  logoUrl: string | null
  iconUrl: string | null
  /** Número de WhatsApp (con código país). Se usa en el footer (enlace directo). */
  whatsapp?: string
}

/**
 * Enlaces por defecto si el admin aún no configura nav_links.
 * IMPORTANTE: cada href debe resolver SIEMPRE (rutas reales o anclas que
 * existen en la home: #como-funciona, #contacto). Nunca anclas huérfanas.
 */
const DEFAULT_NAV_LINKS: HeaderNavLink[] = [
  { href: '/', label: 'Inicio' },
  { href: '/#como-funciona', label: 'Cómo funciona' },
  { href: '/#contacto', label: 'Contacto' },
  // Hub de contenido: guías, comparativas y consejos de compra (pSEO).
  { href: '/guias', label: 'Guías' },
  { href: '/catalogo', label: 'Catálogo', highlight: true },
]

/** Marca por defecto si la BD no tiene configurada (usa los logos optimizados). */
const DEFAULT_BRAND: HeaderBrand = {
  name: 'zonadehobbies',
  tagline: 'Ofertas de AliExpress verificadas',
  logoUrl: '/logos/zonadehobbies-wordmark-on-light.webp',
  iconUrl: '/logos/zonadehobbies-favicon.png',
}

/** TRUE si el href es solo una ancla interna (no cambia de ruta). */
function isHashLink(href: string): boolean {
  return href.startsWith('#') || href.startsWith('/#')
}

/**
 * Encabezado compartido de la tienda (portada y catálogo completo).
 * Incluye: logo (dinámico), navegación (dinámica), modo oscuro, botón de
 * sesión según el rol del usuario autenticado y botón del carrito con contador.
 *
 * Los valores de marca y navegación provienen de site_settings; si no llegan,
 * se usan los por defecto para que la tienda siga funcionando.
 */
export function SiteHeader({ cartCount, onOpenCart, navLinks, brand }: {
  cartCount: number
  onOpenCart: () => void
  navLinks?: HeaderNavLink[]
  brand?: Partial<HeaderBrand>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [sessionRole, setSessionRole] = useState<SessionRole>(null)
  // Traductor de la interfaz (idioma activo de la página, vía contexto).
  const t = useTranslations()
  // Enlaces internos del header (logo + navegación) en el idioma activo.
  const localizedPath = useLocalizedPath()

  // Combina la marca actual con los valores por defecto.
  const currentBrand: HeaderBrand = { ...DEFAULT_BRAND, ...(brand ?? {}) }
  // Usa la navegación configurada o los enlaces por defecto. El `Array.isArray`
  // es defensivo: si algún origen devolviera un objeto (dato corrupto antiguo) el
  // menú caería al fallback en lugar de quedarse vacío.
  const links = (Array.isArray(navLinks) && navLinks.length > 0 ? navLinks : DEFAULT_NAV_LINKS).filter((l) => l.label && l.href)

  // Verifica la sesión al montar para mostrar el botón correcto (iniciar sesión, mis solicitudes o panel admin).
  useEffect(() => {
    let active = true
    getBrowserUser().then(async (user) => {
      if (!active || !user) { if (active) setSessionRole(null); return }
      const role = await getBrowserUserRole(user)
      if (active) setSessionRole(role === 'admin' ? 'admin' : 'client')
    })
    return () => { active = false }
  }, [])

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <Link href={localizedPath('/')} className="flex items-center gap-2" aria-label={currentBrand.name}>
          {/* Logo real (wordmark). En modo oscuro se invierte: los wordmarks de
              marca son monocromo (letras oscuras/blancas), así que invertir da
              la versión clara sin duplicar assets ni columnas en la BD. */}
          {currentBrand.logoUrl ? (
            <Image
              src={currentBrand.logoUrl}
              alt={currentBrand.name}
              width={200}
              height={80}
              priority
              className="h-9 w-auto object-contain dark:invert"
            />
          ) : (
            <>
              {currentBrand.iconUrl ? (
                <Image src={currentBrand.iconUrl} alt="" width={36} height={36} className="size-9 rounded-xl object-cover" />
              ) : (
                <span className="grid size-9 place-items-center rounded-xl bg-brand font-mono text-sm font-black text-brand-foreground">iX</span>
              )}
              <span className="text-lg font-semibold tracking-[-0.05em]">{currentBrand.name.split(' ')[0]}</span>
            </>
          )}
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {links.map((link) => {
            const href = localizedPath(link.href)
            const className = link.highlight ? 'font-semibold text-brand-strong' : ''
            const key = link.href + link.label
            // Las anclas puras usan <a> (scroll nativo); las rutas usan <Link>
            // (navegación cliente, sin recargar la página).
            return isHashLink(link.href)
              ? <a key={key} href={href} className={className}>{link.label}</a>
              : <Link key={key} href={href} className={className}>{link.label}</Link>
          })}
        </nav>

        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle />

          {sessionRole ? (
            <UserMenu />
          ) : (
            <a href="/login" aria-label={t('header.account')} className="hidden size-10 place-items-center rounded-full border border-border md:grid"><CircleUserRound size={17} /></a>
          )}

          <button aria-label={t('header.openCart')} onClick={onOpenCart} className="relative grid size-10 place-items-center rounded-full bg-navy text-navy-foreground"><ShoppingBag size={17} />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">{cartCount}</span>}</button>

          <button aria-label={t('header.menu')} onClick={() => setMenuOpen(!menuOpen)} className="grid size-10 place-items-center md:hidden">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-border px-5 py-4 md:hidden">
          <div className="flex flex-col gap-4 text-sm">
            {links.map((link) => {
              // Móvil: mismo criterio que escritorio (ancla → <a>, ruta → <Link>)
              // y SIEMPRE con el idioma activo (bug: antes no localizaba).
              const href = localizedPath(link.href)
              const className = link.highlight ? 'font-semibold text-brand-strong' : ''
              const key = link.href + link.label
              return isHashLink(link.href)
                ? <a key={key} href={href} onClick={() => setMenuOpen(false)} className={className}>{link.label}</a>
                : <Link key={key} href={href} onClick={() => setMenuOpen(false)} className={className}>{link.label}</Link>
            })}
            {sessionRole === 'admin' ? <Link href="/admin" onClick={() => setMenuOpen(false)} className="font-semibold text-brand-strong">{t('header.adminPanel')}</Link> : sessionRole === 'client' ? <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="font-semibold text-brand-strong">{t('header.myRequests')}</Link> : null}
            {sessionRole && <Link href="/perfil" onClick={() => setMenuOpen(false)}>{t('header.myAccount')}</Link>}
            {!sessionRole && <Link href="/login" onClick={() => setMenuOpen(false)}>{t('header.account')}</Link>}
          </div>
        </div>
      )}
    </header>
  )
}