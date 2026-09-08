'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { BarChart3, BookOpen, Building2, ClipboardList, CreditCard, FileText, FolderTree, Landmark, LogOut, MapPin, Menu, Package, Percent, Receipt, Settings2, ShieldCheck, Tag, Truck, UserRound, Users, Wallet, Warehouse, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SiteFooter } from '@/components/site-footer'
import { ThemeToggle } from '@/components/theme-toggle'
import { UserMenu } from '@/components/user-menu'
import { NotificationsBell } from '@/components/notifications-bell'
import { resetBodyScroll } from '@/lib/scroll-lock'
import { getInitials } from '@/lib/utils'

/** Item individual del menú de navegación del panel. */
type NavItem = { href: string; label: string; icon: LucideIcon; moduleSlug?: string }

/** Grupo de navegación: título de sección + items relacionados. */
type NavGroup = { title: string; items: NavItem[] }

/** Permiso de un usuario autenticado sobre un módulo (viene de /api/admin/permissions). */
type UserModulePermission = {
  module_slug: string
  can_read: boolean
  can_write: boolean
  can_delete: boolean
}

/**
 * Navegación del panel agrupada por módulos:
 * - General: resumen del panel.
 * - Catálogo: gestión de productos, categorías, marcas y proveedores.
 * - Ventas: cotizaciones, facturación y solicitudes.
 * - Usuarios: gestión de usuarios y roles/permisos.
 * - Sistema: ajuste de precios y configuración general.
 */
const navGroups: NavGroup[] = [
  {
    title: 'General',
    items: [
      { href: '/admin', label: 'Resumen', icon: BarChart3, moduleSlug: 'dashboard' },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { href: '/admin/productos', label: 'Productos', icon: Package, moduleSlug: 'productos' },
      { href: '/admin/categorias', label: 'Categorías', icon: FolderTree, moduleSlug: 'categorias' },
      { href: '/admin/marcas', label: 'Marcas', icon: Tag, moduleSlug: 'marcas' },
      { href: '/admin/proveedores', label: 'Proveedores', icon: Building2, moduleSlug: 'proveedores' },
    ],
  },
  {
    title: 'Ventas',
    items: [
      { href: '/admin/cotizaciones', label: 'Cotizaciones', icon: FileText, moduleSlug: 'cotizaciones' },
      { href: '/admin/facturacion', label: 'Facturación', icon: Receipt, moduleSlug: 'facturacion' },
      { href: '/admin/solicitudes', label: 'Solicitudes', icon: ClipboardList, moduleSlug: 'solicitudes' },
    ],
  },
  {
    title: 'Logística',
    items: [
      { href: '/admin/almacenes', label: 'Almacenes', icon: Warehouse, moduleSlug: 'almacenes' },
      { href: '/admin/transportistas', label: 'Transportistas', icon: Truck, moduleSlug: 'transportistas' },
      { href: '/admin/despachos', label: 'Despacho y Rutas', icon: MapPin, moduleSlug: 'despachos' },
      { href: '/admin/envios', label: 'Zonas de Envío', icon: MapPin, moduleSlug: 'envios' },
    ],
  },
  {
    title: 'Finanzas',
    items: [
      { href: '/admin/cuentas-cobrar', label: 'Cuentas por Cobrar', icon: Wallet, moduleSlug: 'cuentas_cobrar' },
      { href: '/admin/conciliacion', label: 'Conciliación bancaria', icon: Landmark, moduleSlug: 'conciliacion' },
      { href: '/admin/pasarelas', label: 'Pasarelas de Pago', icon: CreditCard, moduleSlug: 'pasarelas' },
    ],
  },
  {
    title: 'Contabilidad',
    items: [
      { href: '/admin/libros-fiscales', label: 'Libros Fiscales', icon: BookOpen, moduleSlug: 'libros_fiscales' },
      { href: '/admin/facturacion-xml', label: 'Facturación XML', icon: Receipt, moduleSlug: 'facturacion_xml' },
      { href: '/admin/reporte-margen', label: 'Reporte de Margen', icon: Percent, moduleSlug: 'reporte_margen' },
    ],
  },
  {
    title: 'Usuarios',
    items: [
      { href: '/admin/usuarios', label: 'Usuarios', icon: Users, moduleSlug: 'usuarios' },
      { href: '/admin/roles', label: 'Roles y permisos', icon: ShieldCheck, moduleSlug: 'roles_permissions' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/admin/ajustes-precios', label: 'Ajuste de precios', icon: Percent, moduleSlug: 'ajustes_precios' },
      { href: '/admin/configuracion', label: 'Configuración', icon: Settings2, moduleSlug: 'configuracion' },
    ],
  },
]

/** Renderiza la lista de grupos de navegación con sus títulos de sección. */
function NavLinks({ pathname, onNavigate, permissions }: { pathname: string; onNavigate?: () => void; permissions: UserModulePermission[] | null }) {
  // Mapa de permisos por slug de módulo → can_read (acceso rápido para filtrar).
  const canReadBySlug = new Map((permissions ?? []).map((p) => [p.module_slug, p.can_read]))

  // Filtra los grupos: conserva solo los grupos con al menos un ítem visible.
  // Mientras los permisos no han cargado (null), muestra todos los items
  // para evitar un menú vacío momentáneo. Cuando ya cargaron, un item sin
  // moduleSlug siempre se muestra y uno con moduleSlug solo si can_read = true.
  const visibleGroups = navGroups
    .map(({ title, items }) => ({
      title,
      items: items.filter((item) => {
        if (!permissions) return true
        return !item.moduleSlug || canReadBySlug.get(item.moduleSlug) === true
      }),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <nav className="scrollbar-theme mt-10 flex-1 space-y-6 overflow-y-auto">
      {visibleGroups.map(({ title, items }) => (
        <div key={title}>
          <p className="flex items-center gap-2 px-4 pb-2 font-mono text-[10px] uppercase tracking-[.2em] text-muted-foreground">
            <span className="h-px w-3 bg-border" />{title}
          </p>
          <div className="space-y-1">
            {items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm transition ${pathname === href ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                <Icon size={18} className="shrink-0" />{label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}

/**
 * Panel de navegación lateral del admin (logo + enlaces + acciones).
 * El UserMenu se renderiza por separado: en el header del sidebar de
 * escritorio y en la barra superior móvil.
 */
function AdminNav({ pathname, onNavigate, companyName = 'ilumaX', permissions }: { pathname: string; onNavigate?: () => void; companyName?: string; permissions: UserModulePermission[] | null }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-accent font-mono font-black text-primary">{getInitials(companyName)}</span>
          <div>
            <p className="font-semibold tracking-tight">{companyName}</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Panel de control</p>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <NavLinks pathname={pathname} onNavigate={onNavigate} permissions={permissions} />

      <div className="mt-auto space-y-2 pt-8">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
          <X size={18} />Volver a la tienda
        </Link>
        <Link href="/perfil" onClick={onNavigate} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
          <UserRound size={18} />Mi Perfil
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
 * El UserMenu (avatar con Mi Perfil + Cerrar sesión) se muestra en el
 * header del sidebar de escritorio y en la barra superior móvil.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [siteFooter, setSiteFooter] = useState<{ footer: { copyright?: string; slogan?: string }; brand: { name: string; address: string }; social: { instagram?: string; linkedin?: string; email?: string } } | null>(null)
  const [permissions, setPermissions] = useState<UserModulePermission[] | null>(null)

  // Limpieza residual: si el body quedó con overflow:hidden de un modal
  // cerrado incorrectamente en una sesión anterior, lo restaura al navegar.
  useEffect(() => {
    resetBodyScroll()
  }, [pathname])

  // Obtiene los permisos del usuario autenticado para filtrar el menú.
  // Se consulta la API /api/admin/permissions (no Supabase directo).
  useEffect(() => {
    let active = true
    fetch('/api/admin/permissions', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('No se pudieron cargar los permisos'))))
      .then((data) => {
        if (!active) return
        setPermissions(Array.isArray(data?.permissions) ? data.permissions : null)
      })
      .catch((err) => {
        console.error('AdminShell: no se pudieron cargar los permisos', err)
        if (active) setPermissions(null)
      })
    return () => { active = false }
  }, [])

  // Obtiene la configuración del footer desde la API pública de site_settings.
  // Usa la API (no Supabase directo) y es cacheada en CDN por 60s.
  useEffect(() => {
    let active = true
    fetch('/api/site-settings')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('No se pudo cargar la configuración'))))
      .then((data) => {
        if (!active || !data?.settings) return
        setSiteFooter({
          footer: data.settings.footer_texts,
          brand: { name: data.settings.company_name, address: data.settings.address },
          social: data.settings.social_links,
        })
      })
      .catch((err) => console.error('AdminShell: no se pudo cargar el footer', err))
    return () => { active = false }
  }, [])

  return <div className="flex min-h-screen flex-col bg-background text-foreground">
    {/* Sidebar fijo en escritorio (lg+) */}
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-border bg-card p-6 lg:flex">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-accent font-mono font-black text-primary">{getInitials(siteFooter?.brand?.name ?? 'ilumaX')}</span>
          <div>
            <p className="font-semibold tracking-tight">{siteFooter?.brand?.name ?? 'ilumaX'}</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Panel de control</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationsBell instanceId="notifications-desktop" />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      <NavLinks pathname={pathname} permissions={permissions} />

      <div className="space-y-2 pt-8">
        <Link href="/" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
          <X size={18} />Volver a la tienda
        </Link>
        <Link href="/perfil" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
          <UserRound size={18} />Mi Perfil
        </Link>
        <form action="/auth/signout" method="post">
          <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
            <LogOut size={18} />Cerrar sesión
          </button>
        </form>
      </div>
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
      <AdminNav pathname={pathname} onNavigate={() => setSidebarOpen(false)} companyName={siteFooter?.brand?.name} permissions={permissions} />
    </aside>

    {/* Barra superior móvil con botón hamburguesa y menú de usuario */}
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/90 px-5 py-3 backdrop-blur-xl lg:hidden">
      <div className="flex items-center gap-3">
        <button aria-label="Abrir menú" onClick={() => setSidebarOpen(true)} className="grid size-10 place-items-center rounded-full border border-border text-foreground">
          <Menu size={18} />
        </button>
        <span className="grid size-9 place-items-center rounded-xl bg-accent font-mono text-sm font-black text-primary">{getInitials(siteFooter?.brand?.name ?? 'ilumaX')}</span>
      </div>
      <div className="flex items-center gap-2">
        <p className="hidden font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:block">Panel de control</p>
        <NotificationsBell instanceId="notifications-mobile" />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>

    <main className="flex-1 lg:pl-72">{children}</main>

    <div className="lg:pl-72">
      <SiteFooter
        variant="admin"
        footer={siteFooter?.footer}
        brand={siteFooter?.brand}
        social={siteFooter?.social}
      />
    </div>
  </div>
}

export function AdminPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <header className="flex flex-col gap-5 border-b border-border px-5 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-8"><div><p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.06em] sm:text-4xl">{title}</h1>{description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}</div>{action}</header>
}