'use client'

import { useState } from 'react'
import { ChevronDown, ClipboardList, LoaderCircle, Package } from 'lucide-react'
import { toast } from 'sonner'
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS } from '@/lib/request-status'
import { formatBolivars, moneyUsd } from '@/lib/currency'

type Item = { id: string; product_name: string; quantity: number; unit_price_usd: number }
type Request = { id: string; user_id: string; status: string; total_usd: number; created_at: string; solicitud_items: Item[] }

/**
 * Gestor de solicitudes (CRUD de estado).
 * La lógica de datos se delega en las API routes; la UI es independiente de Supabase.
 * Muestra montos en USD y Bs usando la tasa oficial del día (dolarapi.com).
 */
export function RequestManager({ initialRequests, exchangeRate }: { initialRequests: Request[]; exchangeRate: number }) {
  const [requests, setRequests] = useState(initialRequests)
  const [open, setOpen] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  /** Actualiza el estado de una solicitud. */
  async function changeStatus(id: string, status: string) {
    setUpdatingId(id)
    const response = await fetch(`/api/admin/solicitudes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setUpdatingId(null)

    if (!response.ok) {
      toast.error('No se pudo actualizar')
      return
    }

    setRequests((current) => current.map((request) => (request.id === id ? { ...request, status } : request)))
    toast.success('Estado actualizado')
  }

  return (
    <section className="rounded-3xl border border-border bg-card p-5 sm:p-7">
      <div className="mb-6 flex items-center gap-3">
        <ClipboardList className="text-cyan-600" />
        <div>
          <h2 className="font-medium">Solicitudes recibidas</h2>
          <p className="text-sm text-muted-foreground">{requests.length} pedidos para gestionar</p>
        </div>
      </div>

      <div className="space-y-3">
        {requests.map((request) => (
          <div key={request.id} className="rounded-2xl border border-border">
            <button
              onClick={() => setOpen(open === request.id ? null : request.id)}
              className="flex w-full items-center justify-between gap-4 p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-muted"><Package size={17} /></span>
                <div>
                  <p className="font-mono text-xs">#{request.id.slice(0, 8).toUpperCase()}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(request.created_at).toLocaleDateString('es-VE')} · {request.solicitud_items?.length ?? 0} productos
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold">{moneyUsd(Number(request.total_usd))}</p>
                  <p className="text-xs text-muted-foreground">{formatBolivars(Number(request.total_usd), exchangeRate)}</p>
                </div>
                <span className="rounded-full bg-accent/25 px-3 py-1 text-xs text-accent-foreground">
                  {REQUEST_STATUS_LABELS[request.status] ?? request.status}
                </span>
                <ChevronDown size={16} className={open === request.id ? 'rotate-180' : ''} />
              </div>
            </button>

            {open === request.id && (
              <div className="border-t border-border bg-muted/30 p-4">
                <div className="space-y-2">
                  {request.solicitud_items?.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.quantity} × {item.product_name}</span>
                      <div className="text-right">
                        <p className="text-muted-foreground">{moneyUsd(Number(item.unit_price_usd))}</p>
                        <p className="text-xs text-muted-foreground">{formatBolivars(Number(item.unit_price_usd), exchangeRate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <div>
                    <p className="font-semibold">Total: {moneyUsd(Number(request.total_usd))}</p>
                    <p className="text-xs text-muted-foreground">{formatBolivars(Number(request.total_usd), exchangeRate)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {updatingId === request.id && <LoaderCircle size={15} className="animate-spin text-muted-foreground" />}
                    <select
                      value={request.status}
                      disabled={updatingId === request.id}
                      onChange={(e) => changeStatus(request.id, e.target.value)}
                      className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none disabled:opacity-50"
                    >
                      {REQUEST_STATUSES.map((status) => (
                        <option key={status} value={status}>{REQUEST_STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {!requests.length && <p className="py-12 text-center text-sm text-muted-foreground">Todavía no hay solicitudes recibidas.</p>}
      </div>
    </section>
  )
}