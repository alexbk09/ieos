'use client'

import { useState } from 'react'
import { CalendarDays, History, LoaderCircle, Mail, Package, Phone, UserRound, X } from 'lucide-react'
import { PAYMENT_METHOD_LABELS } from '@/lib/quote-calculator'
import { toast } from 'sonner'
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS } from '@/lib/request-status'
import { moneyUsd } from '@/lib/currency'
import { confirmAction } from '@/components/confirm-dialog'
import type { Request, RequestClient } from '@/services/requests'

/** Propiedades del modal de detalle de solicitud. */
type Props = {
  request: Request
  exchangeRate: number
  onClose: () => void
  onStatusChange: (id: string, status: string) => Promise<void>
}

/** Estilos Tailwind por estado para el badge. */
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  shipped: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
}

/** Normaliza el perfil del cliente (Supabase puede devolver objeto o array). */
function clientOf(request: Request): RequestClient | null {
  const raw = request.profiles
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

/** Formatea una fecha corta. */
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Redondea a 2 decimales (céntimos). */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Formatea un monto en bolívares con separadores locales. */
function formatBs(n: number): string {
  return `Bs. ${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Modal de detalle de solicitud para el admin.
 * Muestra: datos del cliente (con snapshot de la cotización convertida si existe),
 * lista de ítems, desglose de totales y descuentos (manual + efectivo divisas),
 * notas heredadas de la cotización, selector de estado con actualización en vivo,
 * y el historial de cambios de estado con quién lo cambió, cuándo y la transición.
 */
export function RequestDetailModal({ request, exchangeRate, onClose, onStatusChange }: Props) {
  const client = clientOf(request)
  const [updating, setUpdating] = useState(false)
  const history = request.solicitud_status_history ?? []

  // Cliente: prioriza el snapshot de la cotización convertida si existe.
  const displayName = request.customer_name ?? client?.full_name ?? 'Sin nombre'
  const displayEmail = request.customer_email ?? client?.email ?? 'Sin email'
  const displayPhone = request.customer_phone ?? client?.phone ?? 'Sin teléfono'

  // Total en Bs.: usa el guardado (total_ves) o calcula con la tasa actual.
  const rate = Number(request.exchange_rate) || exchangeRate
  const totalVes = Number(request.total_ves) || Number(request.total_usd) * rate

  // Desglose de descuentos (igual que en la cotización convertida).
  const subtotal = Number(request.subtotal_usd) || 0
  const manualPct = Math.min(Math.max(Number(request.discount_percent) || 0, 0), 100)
  const manualAmount = round2((subtotal * manualPct) / 100)
  const afterManual = round2(subtotal - manualAmount)
  const cashPct =
    request.payment_method === 'cash_divisa'
      ? Math.min(Math.max(Number(request.cash_divisa_discount_percent) || 0, 0), 100)
      : 0
  const cashAmount = round2((afterManual * cashPct) / 100)
  // Si paga en bolívares NO aplica el descuento por efectivo en divisas.
  const totalPayBolivaresBs = round2(afterManual * rate)

  /** Cambia el estado y refresca la lista en el padre. */
  async function changeStatus(status: string) {
    if (status === request.status || updating) return

    // Si la solicitud se va a anular, pedir confirmación primero.
    if (status === 'cancelled') {
      const ok = await confirmAction({
        title: '¿Anular esta solicitud?',
        description: `La solicitud #${request.id.slice(0, 8).toUpperCase()} quedará marcada como cancelada.`,
        confirmText: 'Sí, anular',
        confirmClassName: 'bg-rose-600 text-white hover:bg-rose-500 dark:bg-rose-600 dark:text-white dark:hover:bg-rose-500',
      })
      if (!ok) return
    }

    setUpdating(true)
    try {
      await onStatusChange(request.id, status)
      toast.success('Estado actualizado')
    } catch {
      toast.error('No se pudo actualizar el estado')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-blue-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-card text-foreground shadow-2xl"
      >
        {/* Encabezado */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-cyan-600">Solicitud</p>
            <h2 className="text-lg font-semibold">#{request.id.slice(0, 8).toUpperCase()}</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-9 place-items-center rounded-full bg-muted transition hover:bg-muted/70">
            <X size={17} />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Datos del cliente */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <UserRound size={14} /> Cliente
            </h3>
            <div className="grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <UserRound size={15} className="shrink-0 text-muted-foreground" />
                <p className="text-sm font-medium">{displayName}</p>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={15} className="shrink-0 text-muted-foreground" />
                <p className="truncate text-sm">{displayEmail}</p>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={15} className="shrink-0 text-muted-foreground" />
                <p className="text-sm">{displayPhone}</p>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays size={13} /> Creada el {formatDate(request.created_at)}
            </p>
          </section>

          {/* Productos */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Package size={14} /> Productos ({request.solicitud_items?.length ?? 0})
            </h3>
            <div className="space-y-2">
              {request.solicitud_items?.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.product_name}</p>
                    {item.color_name && (
                      <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400">🎨 {item.color_name}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Cantidad: {item.quantity} <span className="text-muted-foreground/70">{item.unit_label ?? 'u'}</span>
                      {item.weight_grams != null && item.weight_grams > 0 && (
                        <span className="ml-2 text-muted-foreground/70">
                          · {item.weight_grams >= 1000 ? `${(item.weight_grams / 1000).toFixed(3)} kg` : `${item.weight_grams} g`}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{moneyUsd(Number(item.unit_price_usd))}</p>
                    <p className="text-xs text-muted-foreground">{formatBs(round2(Number(item.unit_price_usd) * rate))}</p>
                  </div>
                </div>
              ))}
              {!request.solicitud_items?.length && <p className="text-sm text-muted-foreground">Sin productos.</p>}
            </div>
          </section>

          {/* Totales y estado */}
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              {subtotal > 0 && (
                <div className="flex items-center justify-between gap-8 text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium">{moneyUsd(subtotal)}</span>
                </div>
              )}
              {manualAmount > 0 && (
                <div className="flex items-center justify-between gap-8 text-sm">
                  <span className="text-muted-foreground">Descuento manual ({manualPct}%)</span>
                  <span className="font-medium text-destructive">-{moneyUsd(manualAmount)}</span>
                </div>
              )}
              {cashAmount > 0 && (
                <div className="flex items-center justify-between gap-8 text-sm">
                  <span className="text-muted-foreground">Descuento efectivo divisas ({cashPct}%)</span>
                  <span className="font-medium text-destructive">-{moneyUsd(cashAmount)}</span>
                </div>
              )}
              {request.payment_method && request.payment_method !== 'other' && (
                <p className="text-xs text-muted-foreground">
                  Pago: <span className="font-medium">{PAYMENT_METHOD_LABELS[request.payment_method] ?? request.payment_method}</span>
                </p>
              )}
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Total</p>
              <p className="text-xl font-semibold">{moneyUsd(Number(request.total_usd))}</p>
              <p className="text-sm text-muted-foreground">
                {formatBs(totalVes)} · Tasa {rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {cashPct > 0 && (
                <p className="mt-1 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-700 dark:text-emerald-400">
                  💰 Pago en bolívares: {formatBs(totalPayBolivaresBs)} (sin el {cashPct}% de efectivo en divisas)
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[request.status] ?? 'bg-muted text-muted-foreground'}`}>
                {REQUEST_STATUS_LABELS[request.status] ?? request.status}
              </span>
              <select
                value={request.status}
                disabled={updating}
                onChange={(e) => changeStatus(e.target.value)}
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
              >
                {REQUEST_STATUSES.map((status) => (
                  <option key={status} value={status}>{REQUEST_STATUS_LABELS[status]}</option>
                ))}
              </select>
              {updating && <LoaderCircle size={16} className="animate-spin text-muted-foreground" />}
            </div>
          </section>

          {/* Notas de la solicitud (heredadas de la cotización) */}
          {request.notes && (
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notas</h3>
              <p className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">{request.notes}</p>
            </section>
          )}

          {/* Historial de cambios de estado */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <History size={14} /> Historial de estados ({history.length})
            </h3>
            {history.length ? (
              <div className="space-y-0">
                {history.map((entry, i) => {
                  const who = entry.changed_by_name
                    ? (entry.changed_by_name.full_name ?? entry.changed_by_name.email ?? 'Desconocido')
                    : 'Desconocido'
                  return (
                    <div key={entry.id} className="relative flex gap-4 pb-5 last:pb-0">
                      {/* Línea vertical */}
                      {i < history.length - 1 && <span className="absolute left-[7px] top-5 h-full w-px bg-border" aria-hidden />}
                      <span className="mt-1.5 size-3.5 shrink-0 rounded-full border-2 border-cyan-500 bg-card" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {entry.previous_status ? (
                            <p className="text-sm">
                              <span className="font-medium">{REQUEST_STATUS_LABELS[entry.previous_status] ?? entry.previous_status}</span>
                              <span className="mx-1.5 text-muted-foreground">→</span>
                              <span className="font-medium">{REQUEST_STATUS_LABELS[entry.new_status] ?? entry.new_status}</span>
                            </p>
                          ) : (
                            <p className="text-sm font-medium">{REQUEST_STATUS_LABELS[entry.new_status] ?? entry.new_status}</p>
                          )}
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {REQUEST_STATUS_LABELS[entry.new_status] ?? entry.new_status}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(entry.created_at)} · Cambiado por {who}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay cambios de estado registrados.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}