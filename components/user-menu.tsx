'use client'

import { useEffect, useRef, useState } from 'react'
import { LogOut, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getBrowserProfile } from '@/services/profiles-client'
import { UserAvatar } from '@/components/user-avatar'

/**
 * Menú de usuario en el header.
 * Muestra el avatar (imagen o iniciales) y al hacer clic despliega
 * dos opciones: "Mi Perfil" y "Cerrar sesión".
 * Funciona tanto para administradores como para clientes.
 */
export function UserMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<{ name?: string | null; avatar_url?: string | null } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Carga el perfil (nombre + avatar) al montar.
  useEffect(() => {
    let active = true
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
        className="grid size-10 cursor-pointer place-items-center rounded-full border border-slate-200 transition-colors hover:border-cyan-500 dark:border-slate-700"
      >
        <UserAvatar name={profile?.name} imageUrl={profile?.avatar_url} size="md" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-black/10 dark:border-slate-800 dark:bg-slate-900">
          {/* Cabecera con nombre del usuario */}
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className="truncate text-sm font-semibold">{profile?.name ?? 'Mi cuenta'}</p>
          </div>

          {/* Opciones del menú */}
          <div className="p-1.5">
            <button
              onClick={() => {
                setOpen(false)
                router.push('/perfil')
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <UserRound size={16} className="text-cyan-600" />
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