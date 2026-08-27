'use client'

import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, LogOut, Moon, Sun, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getBrowserUser, getBrowserUserRole } from '@/services/auth-client'
import { getBrowserProfile } from '@/services/profiles-client'
import { UserAvatar } from '@/components/user-avatar'
import { useDarkMode } from '@/hooks/use-dark-mode'

/**
 * Menú de usuario en el header.
 * Muestra el avatar (imagen o iniciales) y al hacer clic despliega
 * las opciones: "Panel admin" (solo administradores), "Mi Perfil" y
 * "Cerrar sesión".
 * Funciona tanto para administradores como para clientes.
 */
export function UserMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [profile, setProfile] = useState<{ name?: string | null; avatar_url?: string | null } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { dark, toggle } = useDarkMode()

  // Carga el perfil (nombre + avatar) y el rol del usuario al montar.
  useEffect(() => {
    let active = true
    getBrowserUser().then(async (user) => {
      if (!active) return
      if (user) {
        const role = await getBrowserUserRole(user)
        if (active) setIsAdmin(role === 'admin')
      }
    })
    getBrowserProfile().then((data) => {
      if (active && data) {
        setProfile({ name: data.full_name ?? data.email, avatar_url: data.avatar_url })
      }
    })
    return () => { active = false }
  }, [])

  // Cierra el menú al hacer clic fuera.
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Cierra el menú con la tecla Escape.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  /** Cierra sesión y redirige al inicio. */
  async function signOut() {
    setOpen(false)
    const form = document.createElement('form')
    form.method = 'post'
    form.action = '/auth/signout'
    document.body.appendChild(form)
    form.submit()
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        aria-label="Abrir menú de usuario"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid size-10 cursor-pointer place-items-center rounded-full border border-border transition-colors hover:border-brand"
      >
        <UserAvatar name={profile?.name} imageUrl={profile?.avatar_url} size="md" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/10">
          {/* Cabecera con nombre del usuario */}
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{profile?.name ?? 'Mi cuenta'}</p>
          </div>

          {/* Opciones del menú */}
          <div className="p-1.5">
            <button
              onClick={toggle}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              {dark ? <Sun size={16} className="text-brand" /> : <Moon size={16} className="text-brand" />}
              {dark ? 'Modo claro' : 'Modo oscuro'}
            </button>
            {isAdmin && (
              <button
                onClick={() => {
                  setOpen(false)
                  router.push('/admin')
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
              >
                <LayoutDashboard size={16} className="text-brand" />
                Panel admin
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false)
                router.push('/perfil')
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <UserRound size={16} className="text-brand" />
              Mi Perfil
            </button>
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  )
}