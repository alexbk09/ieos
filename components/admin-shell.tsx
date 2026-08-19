'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { BarChart3, ClipboardList, FolderTree, LogOut, Menu, Package, Users, X } from 'lucide-react'

const links = [
  { href: '/admin', label: 'Resumen', icon: BarChart3 },
  { href: '/admin/productos', label: 'Productos', icon: Package },
  { href: '/admin/categorias', label: 'Categorías', icon: FolderTree },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { href: '/admin/solicitudes', label: 'Solicitudes', icon: ClipboardList },
]

/**
 * Panel de navegación lateral del admin.
 * En escritorio (lg+) es un sidebar fijo; en móvil/tablet se convierte
 * en un drawer deslizante con overlay, accesible desde un botón hamburguesa.
 */
function AdminNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-2xl bg-accent font-mono font-black text-primary">iX</span>
        <div>
          <p className="font-semibold tracking-tight">iluma<span className="text-accent-foreground">X</span></p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Panel de control</p>
        </div>
      </div>

      <nav className="mt-12 space-y-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${pathname === href ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            <Icon size={18} />{label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-2 pt-8">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
          <X size={18} />Volver a la tienda
        </Link>
        <form action="/auth/signout" method="post">
          <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
            <LogOut size={18} />Cerrar sesión
          </button>
        </form>
      </div>
    </>
  )
}

/**
 * Layout administrativo compartido por todas las páginas del panel.
 * El menú lateral es responsive: sidebar fijo en escritorio y drawer
 * deslizante con hamburguesa en móvil/tablet.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return <div className="min-h-screen bg-background text-foreground">
    {/* Sidebar fijo en escritorio (lg+) */}
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-border bg-card p-6 lg:flex">
      <AdminNav pathname={pathname} />
    </aside>

    {/* Overlay del drawer móvil */}
    {sidebarOpen && (
      <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
    )}

    {/* Drawer móvil/tablet */}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card p-6 transition-transform duration-300 lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <button aria-label="Cerrar menú" onClick={() => setSidebarOpen(false)} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted">
        <X size={18} />
      </button>
      <AdminNav pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
    </aside>

    {/* Barra superior móvil con botón hamburguesa */}
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/90 px-5 py-3 backdrop-blur-xl lg:hidden">
      <div className="flex items-center gap-3">
        <button aria-label="Abrir menú" onClick={() => setSidebarOpen(true)} className="grid size-10 place-items-center rounded-full border border-border text-foreground">
          <Menu size={18} />
        </button>
        <span className="grid size-9 place-items-center rounded-xl bg-accent font-mono text-sm font-black text-primary">iX</span>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Panel de control</p>
    </header>

    <main className="lg:pl-72">{children}</main>
  </div>
}

export function AdminPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <header className="flex flex-col gap-5 border-b border-border px-5 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-8"><div><p className="font-mono text-xs uppercase tracking-[.25em] text-cyan-600">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.06em] sm:text-4xl">{title}</h1>{description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}</div>{action}</header>
}