'use client'

import { useEffect, useState } from 'react'
import { CircleUserRound, ClipboardList, Menu, Moon, ShoppingBag, Sun, X } from 'lucide-react'
import { getBrowserUser, getBrowserUserRole } from '@/services/auth-client'

type SessionRole = 'admin' | 'client' | null

/**
 * Enlaces de navegación por defecto compartidos por TODAS las páginas públicas
 * (portada y catálogo completo). Vive en el SiteHeader para garantizar que
 * el menú sea exactamente el mismo en cualquier ruta.
 */
const DEFAULT_NAV_LINKS = [
  { href: '/', label: 'Inicio' },
  { href: '/#studio', label: 'Studio' },
  { href: '/#contacto', label: 'Contacto' },
  { href: '/catalogo', label: 'Catálogo completo', highlight: true },
]

/**
 * Encabezado compartido de la tienda (portada y catálogo completo).
 * Incluye: logo, navegación, modo oscuro, botón de sesión según el rol
 * del usuario autenticado y botón del carrito con contador.
 *
 * Por defecto usa DEFAULT_NAV_LINKS, por lo que el menú es idéntico en
 * la portada y el catálogo. Si una página necesita enlaces adicionales,
 * los puede pasar con navLinks (se combinan con los por defecto).
 */
export function SiteHeader({ dark, onToggleDark, cartCount, onOpenCart, navLinks = [] }: {
  dark: boolean
  onToggleDark: () => void
  cartCount: number
  onOpenCart: () => void
  navLinks?: { href: string; label: string; highlight?: boolean }[]
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [sessionRole, setSessionRole] = useState<SessionRole>(null)

  // Combina los enlaces por defecto con los adicionales que pase la página.
  const links = [...DEFAULT_NAV_LINKS, ...navLinks]

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
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <a href="/" className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-xl bg-cyan-400 font-mono text-sm font-black text-blue-950">iX</span><span className="text-lg font-semibold tracking-[-0.05em]">iluma<span className="text-cyan-500">X</span></span></a>

        <nav className="hidden items-center gap-8 text-sm text-slate-500 md:flex dark:text-slate-300">
          {links.map((link) => (
            <a key={link.href} href={link.href} className={link.highlight ? 'font-semibold text-cyan-600' : ''}>{link.label}</a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button aria-label="Cambiar tema" onClick={onToggleDark} className="grid size-10 place-items-center rounded-full border border-slate-200 dark:border-slate-700">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>

          {sessionRole === 'admin' ? (
            <a href="/admin" className="hidden items-center gap-2 rounded-full bg-blue-950 px-4 py-2.5 text-xs font-semibold text-white md:flex">Panel admin</a>
          ) : sessionRole === 'client' ? (
            <a href="/dashboard" className="hidden items-center gap-2 rounded-full bg-blue-950 px-4 py-2.5 text-xs font-semibold text-white md:flex"><ClipboardList size={14} />Mis Solicitudes</a>
          ) : (
            <a href="/login" aria-label="Cuenta" className="hidden size-10 place-items-center rounded-full border border-slate-200 md:grid dark:border-slate-700"><CircleUserRound size={17} /></a>
          )}

          <button aria-label="Abrir carrito" onClick={onOpenCart} className="relative grid size-10 place-items-center rounded-full bg-blue-950 text-white"><ShoppingBag size={17} />{cartCount > 0 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-cyan-400 text-[10px] font-bold text-blue-950">{cartCount}</span>}</button>

          <button aria-label="Menú" onClick={() => setMenuOpen(!menuOpen)} className="grid size-10 place-items-center md:hidden">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-200 px-5 py-4 md:hidden dark:border-slate-800">
          <div className="flex flex-col gap-4 text-sm">
            {links.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className={link.highlight ? 'font-semibold text-cyan-600' : ''}>{link.label}</a>
            ))}
            {sessionRole === 'admin' ? <a href="/admin" onClick={() => setMenuOpen(false)} className="font-semibold text-cyan-600">Panel admin</a> : sessionRole === 'client' ? <a href="/dashboard" onClick={() => setMenuOpen(false)} className="font-semibold text-cyan-600">Mis Solicitudes</a> : <a href="/login" onClick={() => setMenuOpen(false)}>Mi cuenta</a>}
          </div>
        </div>
      )}
    </header>
  )
}