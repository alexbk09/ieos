'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getBrowserUser } from '@/services/auth-client'
import { subscribeToNotifications, type AppNotificationLike } from '@/services/notifications-client'

/**
 * Contexto del centro de notificaciones compartido por todas las campanas.
 * Evita que dos botones (desktop y móvil) creen suscripciones realtime
 * duplicadas o dupliquen el contador de no leídas: el estado y el canal
 * viven aquí, una sola vez por sesión.
 * Toda operación de datos va vía /services (regla de capas).
 */
type NotificationsContextValue = {
  ready: boolean
  unread: number
  notifications: AppNotificationLike[]
  openMenuId: string | null
  toggleMenu: (id: string) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications debe usarse dentro de <NotificationsProvider>')
  return ctx
}

/**
 * Proveedor único del feed de notificaciones. Almacena estado de la bandeja
 * en memoria y no duplica por instancia de campana. Realtime se subscribe
 * una única vez; el canal se abre con nombre único por sesión para evitar
 * el error "cannot add callbacks after subscribe()" del singleton de Supabase.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<AppNotificationLike[]>([])
  const [unread, setUnread] = useState(0)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(true)

  // 1) Detecta sesión del navegador (una sola vez).
  useEffect(() => {
    let active = true
    getBrowserUser()
      .then((user) => {
        if (!active) return
        setUserId(user?.id ?? null)
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => { active = false }
  }, [])

  const refreshFromApi = useCallback(async () => {
    // Precaución: evita ciclos en pruebas o sin usuario.
    if (!userId) return
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { notifications?: AppNotificationLike[]; unread?: number }
      if (!mountedRef.current) return
      setNotifications(data.notifications ?? [])
      setUnread(data.unread ?? 0)
    } catch {
      /* Silencio: no spam de red/polling. */
    }
  }, [userId])

  // 2) Carga inicial al identificar el usuario.
  useEffect(() => {
    if (!userId) return
    refreshFromApi()
  }, [userId, refreshFromApi])

  // 3) Realtime cliente con canal único (por sesión) + respaldo polling 30s.
  useEffect(() => {
    if (!userId) return

    let active = true
    subscribeToNotifications((notification) => {
      if (!active) return
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) return prev
        return [notification, ...prev].slice(0, 40)
      })
      setUnread((prev) => prev + 1)
    }).then((unsub) => {
      if (!active && unsub) unsub()
      else unsubscribeRef.current = unsub
    })

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refreshFromApi()
    }, 30000)

    return () => {
      active = false
      clearInterval(interval)
      unsubscribeRef.current?.()
      unsubscribeRef.current = null
    }
  }, [userId, refreshFromApi])

  // Marca una notificación como leída (API + estado).
  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)))
      setUnread((prev) => Math.max(0, prev - 1))
    } catch {}
  }, [])

  // Marca todas las notificaciones como leídas.
  const markAllAsRead = useCallback(async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
      setUnread(0)
    } catch {}
  }, [])

  // Si una campana ya está abierta y se pulsa otra, solo se alterna esa.
  const toggleMenu = useCallback((id: string) => {
    setOpenMenuId((current) => (current === id ? null : id))
  }, [])

  return (
    <NotificationsContext.Provider value={{ ready, unread, notifications, openMenuId, toggleMenu, markAsRead, markAllAsRead }}>
      {children}
    </NotificationsContext.Provider>
  )
}