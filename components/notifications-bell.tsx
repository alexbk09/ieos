'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, BellRing, CheckCircle2, ClipboardList, CreditCard, FileText, Info, MessageSquare, Package, Percent, Truck, UserPlus, Wallet } from 'lucide-react'
import { useNotifications } from '@/components/notifications-provider'
import { Skeleton } from '@/components/ui/skeleton'

type TypeMeta = { icon: typeof Bell; tone: 'info' | 'success' | 'warn' | 'danger' | 'brand' }
const TONES: Record<string, string> = {
  info: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  brand: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
}
const TYPE_META: Record<string, TypeMeta> = {
  system: { icon: Info, tone: 'info' },
  solicitud: { icon: ClipboardList, tone: 'brand' },
  cotizacion: { icon: FileText, tone: 'info' },
  factura: { icon: FileText, tone: 'warn' },
  despacho: { icon: Truck, tone: 'success' },
  cuentas_cobrar: { icon: Wallet, tone: 'danger' },
  pago: { icon: CreditCard, tone: 'success' },
  producto: { icon: Package, tone: 'info' },
  usuario: { icon: UserPlus, tone: 'info' },
  tasa: { icon: Percent, tone: 'warn' },
  mensaje: { icon: MessageSquare, tone: 'info' },
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return `hace ${Math.round(hrs / 24)} d`
}

/** Posición fixed calculada bajo el botón, limitada al viewport. */
type DropPos = { top: number; left: number } | null

export function NotificationsBell({ instanceId = 'notif-bell' }: { instanceId?: string }) {
  const { ready, openMenuId, toggleMenu, markAsRead, markAllAsRead, notifications, unread } = useNotifications()
  const [pos, setPos] = useState<DropPos>(null)
  const [mounted, setMounted] = useState(false)
  const open = openMenuId === instanceId

  useEffect(() => setMounted(true), [])

  // Cada vez que abre, calcula dónde queda el panel sin cortarse.
  useEffect(() => {
    if (!open) { setPos(null); return }
    const btn = document.querySelector<HTMLButtonElement>(`[data-bell="${instanceId}"]`)
    if (!btn) { setPos(null); return }
    const rect = btn.getBoundingClientRect()
    const width = Math.min(368, window.innerWidth - 16)
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
    const top = Math.min(rect.bottom + 6, window.innerHeight - 8)
    setPos({ top, left })
  }, [open, instanceId])

  return (
    <>
      <button
        type="button"
        data-bell={instanceId}
        aria-label={unread > 0 ? `Notificaciones (${unread} sin leer)` : 'Notificaciones'}
        aria-expanded={open}
        onClick={() => toggleMenu(instanceId)}
        className="relative grid size-10 cursor-pointer place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
      >
        <BellRing size={17} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[1.1rem] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-brand-foreground">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && mounted && pos && createPortal(
        <div
          className="fixed z-[9999] w-[min(23rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          style={{ top: pos.top, left: pos.left }}
          role="dialog"
          aria-label="Notificaciones"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notificaciones</p>
            {unread > 0 && (
              <button type="button" onClick={markAllAsRead} className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <CheckCircle2 size={13} /> Marcar todas
              </button>
            )}
            <button type="button" onClick={() => toggleMenu(instanceId)} aria-label="Cerrar" className="grid size-6 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted">
              <span aria-hidden>✕</span>
            </button>
          </div>

          <div className="max-h-[min(20rem,50dvh)] overflow-y-auto">
            {!ready ? (
              <div className="space-y-2 p-3">{[0, 1].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Bell size={18} className="text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Novedades importantes aparecerán aquí.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const meta = TYPE_META[n.type] ?? TYPE_META.system
                const Icon = meta.icon
                const badge = !n.read_at
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      if (badge) markAsRead(n.id)
                      toggleMenu(instanceId)
                      if (n.href) window.location.assign(n.href)
                    }}
                    className={`flex w-full cursor-pointer items-start gap-3 border-b border-border/60 px-4 py-3 text-left last:border-b-0 hover:bg-muted/60 ${badge ? 'bg-cyan-500/[0.04]' : ''}`}
                  >
                    <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${TONES[meta.tone]}`}>
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.title}</span>
                        {badge && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="No leída" />}
                      </span>
                      {n.body && <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{n.body}</span>}
                      <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground/70">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}