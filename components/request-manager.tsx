'use client'

import { useMemo, useState } from 'react'
import { ClipboardList, Eye, Package } from 'lucide-react'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { RequestDetailModal } from '@/components/request-detail-modal'
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS } from '@/lib/request-status'
import { formatBolivars, moneyUsd } from '@/lib/currency'
import type { Request, RequestClient } from '@/services/requests'

/** Normaliza el perfil del cliente (Supabase puede devolver objeto o array). */
function clientOf(request: Request): RequestClient | null {
  const raw = request.profiles
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

/** Estilos Tailwind del badge de estado. */
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  shipped: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
}

/**
 * Gestor de solicitudes (CRUD de estado) con:
 * - Tabla con búsqueda por cliente/producto/estado (DataTable)
 * - Filtros de estado y rango de fechas
 * - Paginación integrada
 * - Modal de detalle con datos del cliente, ítems, totales e historial de estados
 * La lógica de datos se delega en las API routes; la UI es independiente de Supabase.
 */
export function RequestManager({ initialRequests, exchangeRate }: { initialRequests: Request[]; exchangeRate: number }) {
  const [requests, setRequests] = useState(initialRequests)
  const [selected, setSelected] = useState<Request | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  /** Actualiza el estado de una solicitud y su historial local. */
  async function changeStatus(id: string, status: string) {
    const response = await fetch(`/api/admin/solicitudes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) throw new Error('No se pudo actualizar')

    const historyEntry = {
      id: crypto.randomUUID(),
      solicitud_id: id,
      previous_status: requests.find((r) => r.id === id)?.status ?? null,
      new_status: status,
      changed_by: null,
      created_at: new Date().toISOString(),
    }

    setRequests((current) =>
      current.map((request) =>
        request.id === id
          ? { ...request, status, solicitud_status_history: [historyEntry, ...(request.solicitud_status_history ?? [])] }
          : request,
      ),
    )
    setSelected((current) => (current && current.id === id ? { ...current, status, solicitud_status_history: [historyEntry, ...(current.solicitud_status_history ?? [])] } : current))
  }

  /** Aplica filtros de estado y rango de fechas. */
  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      const created = new Date(r.created_at)
      if (fromDate && created < new Date(`${fromDate}T00:00:00`)) return false
      if (toDate && created > new Date(`${toDate}T23:59:59`)) return false
      return true
    })
  }, [requests, statusFilter, fromDate, toDate])

  /** Columnas de la tabla de solicitudes. */
  const columns: TableColumn<Request>[] = [
    {
      key: 'id',
      header: 'Solicitud',
      sortable: true,
      sortValue: (r) => r.id,
      render: (r) => (
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted"><Package size={16} /></span>
          <div>
            <p className="font-mono text-xs font-medium">#{r.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Cliente',
      sortable: true,
      sortValue: (r) => clientOf(r)?.full_name ?? clientOf(r)?.email ?? '',
      render: (r) => {
        const client = clientOf(r)
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{client?.full_name || 'Sin nombre'}</p>
            <p className="truncate text-xs text-muted-foreground">{client?.email || '—'}</p>
          </div>
        )
      },
    },
    {
      key: 'items',
      header: 'Productos',
      sortable: true,
      sortValue: (r) => r.solicitud_items?.length ?? 0,
      hiddenMobile: true,
      render: (r) => <span className="text-muted-foreground">{r.solicitud_items?.length ?? 0} ítems</span>,
    },
    {
      key: 'total',
      header: 'Total',
      sortable: true,
      sortValue: (r) => Number(r.total_usd),
      render: (r) => (
        <div>
          <p className="font-medium">{moneyUsd(Number(r.total_usd))}</p>
          <p className="text-xs text-muted-foreground">{formatBolivars(Number(r.total_usd), exchangeRate)}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      sortValue: (r) => r.status,
      render: (r) => (
        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[r.status] ?? 'bg-muted text-muted-foreground'}`}>
          {REQUEST_STATUS_LABELS[r.status] ?? r.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setSelected(r)
          }}
          aria-label="Ver detalle de la solicitud"
          title="Ver detalle"
          className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Eye size={15} />
        </button>
      ),
      cellClassName: 'text-right',
    },
  ]

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <ClipboardList className="text-cyan-600" />
        <div>
          <h2 className="font-medium">Solicitudes recibidas</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} pedidos para gestionar</p>
        </div>
      </div>

      {/* Filtros: estado + rango de fechas */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        >
          <option value="all">Todos los estados</option>
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>{REQUEST_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          aria-label="Desde"
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        <span className="text-xs text-muted-foreground">—</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          aria-label="Hasta"
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey={(r) => r.id}
        searchKeys={(r) => {
          const client = clientOf(r)
          const products = (r.solicitud_items ?? []).map((i) => i.product_name).join(' ')
          return `${r.id} ${client?.full_name ?? ''} ${client?.email ?? ''} ${client?.phone ?? ''} ${products} ${r.status}`
        }}
        searchPlaceholder="Buscar por cliente, producto, email o estado…"
        emptyMessage="No se encontraron solicitudes"
        noDataMessage="Aún no hay solicitudes recibidas"
        pageSize={8}
        onRowClick={(r) => setSelected(r)}
      />

      {/* Modal de detalle con historial de estados */}
      {selected && (
        <RequestDetailModal
          request={selected}
          exchangeRate={exchangeRate}
          onClose={() => setSelected(null)}
          onStatusChange={changeStatus}
        />
      )}
    </section>
  )
}