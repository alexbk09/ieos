'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Boxes, ClipboardList, FolderTree, LogOut, Package, Users, X } from 'lucide-react'

const links = [
  { href: '/admin', label: 'Resumen', icon: BarChart3 },
  { href: '/admin/productos', label: 'Productos', icon: Package },
  { href: '/admin/categorias', label: 'Categorías', icon: FolderTree },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { href: '/admin/solicitudes', label: 'Solicitudes', icon: ClipboardList },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <div className="min-h-screen bg-background text-foreground">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-border bg-card p-6 lg:block">
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-accent font-mono font-black text-primary">iX</span><div><p className="font-semibold tracking-tight">iluma<span className="text-accent-foreground">X</span></p><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Panel de control</p></div></div>
      <nav className="mt-12 space-y-2">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${pathname === href ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon size={18} />{label}</Link>)}</nav>
      <div className="absolute bottom-6 left-6 right-6 space-y-2"><Link href="/" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted"><X size={18} />Volver a la tienda</Link><form action="/auth/signout" method="post"><button className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-muted-foreground hover:bg-muted"><LogOut size={18} />Cerrar sesión</button></form></div>
    </aside>
    <main className="lg:pl-72">{children}</main>
  </div>
}

export function AdminPageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <header className="flex flex-col gap-5 border-b border-border px-5 py-7 sm:flex-row sm:items-end sm:justify-between sm:px-8"><div><p className="font-mono text-xs uppercase tracking-[.25em] text-cyan-600">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.06em] sm:text-4xl">{title}</h1>{description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}</div>{action}</header>
}
EOF

mkdir -p /vercel/share/v0-project/components /vercel/share/v0-project/app/admin/productos /vercel/share/v0-project/app/admin/categorias /vercel/share/v0-project/app/admin/usuarios /vercel/share/v0-project/app/admin/solicitudes
