'use client'

import { useEffect, useState } from 'react'
import { CircleUserRound, Menu, ShoppingBag, X } from 'lucide-react'
import { getBrowserUser, getBrowserUserRole } from '@/services/auth-client'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/user-menu'

type SessionRole = 'admin' | 'client' | null

export type HeaderNavLink = { href: string; label: string; highlight?: boolean }

export type HeaderBrand = {
  name: string
  tagline: string
  logoUrl: string | null
  iconUrl: string | null
  /** Número de WhatsApp configurado en site_settings (para confirmar pedidos). */
  whatsapp?: string
}

/** Enlaces por defecto si el admin aún no configura nav_links. */
const DEFAULT_NAV_LINKS: HeaderNavLink[] = [
  { href: '/', label: 'Inicio' },
  { href: '/#studio', label: 'Nuestro espacio' },
  { href: '/#contacto', label: 'Contacto' },
  { href: '/catalogo', label: 'Catálogo completo', highlight: true },
]

/** Marca por defecto si la BD no tiene configurada. */
const DEFAULT_BRAND: HeaderBrand = { name: 'IEOS', tagline: 'Wall Panels & Pisos SPC', logoUrl: null, iconUrl: null }

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

  // Combina la marca actual con los valores por defecto.
  const currentBrand: HeaderBrand = { ...DEFAULT_BRAND, ...(brand ?? {}) }
  // Usa la navegación configurada o los enlaces por defecto.
  const links = (navLinks && navLinks.length > 0 ? navLinks : DEFAULT_NAV_LINKS).filter((l) => l.label && l.href)

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
        <a href="/" className="flex items-center gap-2">
          {currentBrand.logoUrl ? (
            <img src={currentBrand.logoUrl} alt={`${currentBrand.name} — logo`} className="h-9 w-auto object-contain" />
          ) : currentBrand.iconUrl ? (
            <img src={currentBrand.iconUrl} alt={`${currentBrand.name} — ícono`} className="size-9 rounded-xl object-cover" />
          ) : (
            <span className="grid size-9 place-items-center rounded-xl bg-brand font-mono text-sm font-black text-brand-foreground">IE</span>
          )}
          <span className="text-lg font-semibold tracking-[-0.05em]">
            {currentBrand.name.split(' ')[0]}
     {/*        {currentBrand.name.includes('X') || currentBrand.name.toLowerCase().includes('x') ? (
              <span className="text-cyan-500">X</span>
            ) : null} */}
          </span>
        </a>

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {links.map((link) => (
            <a key={link.href + link.label} href={link.href} className={link.highlight ? 'font-semibold text-brand-strong' : ''}>{link.label}</a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {sessionRole ? (
            <UserMenu />
          ) : (
            <a href="/login" aria-label="Cuenta" className="hidden size-10 place-items-center rounded-full border border-border md:grid"><CircleUserRound size={17} /></a>
          )}

          <button aria-label="Abrir carrito" onClick={onOpenCart} className="relative grid size-10 place-items-center rounded-full bg-navy text-navy-foreground"><ShoppingBag size={17} />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-brand-foreground">{cartCount}</span>}</button>

          <button aria-label="Menú" onClick={() => setMenuOpen(!menuOpen)} className="grid size-10 place-items-center md:hidden">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-border px-5 py-4 md:hidden">
          <div className="flex flex-col gap-4 text-sm">
            {links.map((link) => (
              <a key={link.href + link.label} href={link.href} onClick={() => setMenuOpen(false)} className={link.highlight ? 'font-semibold text-brand-strong' : ''}>{link.label}</a>
            ))}
            {sessionRole === 'admin' ? <a href="/admin" onClick={() => setMenuOpen(false)} className="font-semibold text-brand-strong">Panel admin</a> : sessionRole === 'client' ? <a href="/dashboard" onClick={() => setMenuOpen(false)} className="font-semibold text-brand-strong">Mis Solicitudes</a> : null}
            {sessionRole && <a href="/perfil" onClick={() => setMenuOpen(false)}>Mi Perfil</a>}
            {!sessionRole && <a href="/login" onClick={() => setMenuOpen(false)}>Mi cuenta</a>}
          </div>
        </div>
      )}
    </header>
  )
}