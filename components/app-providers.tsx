'use client'

import type { ReactNode } from 'react'
import { NotificationsProvider } from '@/components/notifications-provider'

/**
 * Wrapper cliente para proveedores globales de UI (centro de notificaciones).
 * Se monta una sola vez en el RootLayout para que la campana funcione en el
 * panel admin, dashboard del cliente y perfil con UNA única suscripción realtime.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <NotificationsProvider>{children}</NotificationsProvider>
}