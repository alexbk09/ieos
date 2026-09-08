'use client'

import { useState } from 'react'
import { TrendingUp, Search } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { moneyUsd } from '@/lib/currency'

type Renglon = {
  product_id: string
  product_name: string
  cantidad_vendida: number
  total_vendido_usd: number
  costo_inicial_usd: number
  ingreso_bruto_usd: number
  ingreso_neto_usd: number
  costo_total_usd: number
  ganancia_usd: number
  porcentaje: number
}

type Resumen = {
  ingreso_neto_usd: number
  costo_total_usd: number
  ganancia_usd: number
  porcentaje: number
}

/** Gestor del reporte de margen neto. Genera reportes por período. */
export function ReporteMargenManager() {
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
  const hoyStr = hoy.toISOString().slice(0, 10)

  const [inicio, setInicio] = useState(inicioMes)
  const [fin, setFin] = useState(hoyStr)
  const [cargando, setCargando] = useState(false)
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)

  async function generar() {
    if (!inicio || !fin) {
      toast.error('Selecciona el período del reporte')
      return
    }
    if (inicio > fin) {
      toast.error('La fecha de inicio no puede ser mayor que la de fin')
      return
    }

    setCargando(true)
    try {
      const response = await fetch(`/api/admin/reporte-margen?inicio=${inicio}&fin=${fin}`, { cache: 'no-store' })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        toast.error(result.error ?? 'No se pudo generar el reporte')
        return
      }
      const data = await response.json()
      setRenglones(data.renglones ?? [])
      setResumen(data.resumen ?? null)
    } catch {
      toast.error('No se pudo generar el reporte')
    } finally {
      setCargando(false)
    }
  }

  const columns: TableColumn<Renglon>[] = [
    {
      key: 'producto',
      header: 'Producto',
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <TrendingUp size={16} />
          </div>
          <div>
            <p className="font-medium">{r.product_name}</p>
            <p className="text-xs text-muted-foreground">{r.cantidad_vendida} unidades vendidas</p>
          </div>
        </div>
      ),
    },
    {
      key: 'venta',
      header: 'Venta total',
      hiddenMobile: true,
      render: (r) => <span className="font-mono text-sm">{moneyUsd(r.total_vendido_usd)}</span>,
    },
    {
      key: 'ingreso_neto',
      header: 'Ingreso neto',
      hiddenMobile: true,
      render: (r) => <span className="font-mono text-sm">{moneyUsd(r.ingreso_neto_usd)}</span>,
    },
    {
      key: 'costo',
      header: 'Costo total',
      render: (r) => <span className="font-mono text-sm text-rose-600">{moneyUsd(r.costo_total_usd)}</span>,
    },
    {
      key: 'ganancia',
      header: 'Ganancia',
      sortable: true,
      sortValue: (r) => r.ganancia_usd,
      render: (r) => <span className={`font-mono text-sm font-semibold ${r.ganancia_usd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{moneyUsd(r.ganancia_usd)}</span>,
    },
    {
      key: 'porcentaje',
      header: '% Margen',
      render: (r) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.porcentaje >= 0 ? 'bg-emerald-500/15 text-emerald-600' : 'bg-rose-500/15 text-rose-600'}`}>
          {r.porcentaje.toFixed(1)}%
        </span>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      {/* Filtro de período */}
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <FormInput label="Desde" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          <FormInput label="Hasta" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          <FormSubmitButton loading={cargando} onClick={generar} loadingText="Generando…">
            <Search size={15} /> Generar reporte
          </FormSubmitButton>
        </div>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Ingreso neto</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{moneyUsd(resumen.ingreso_neto_usd)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ventas sin IVA</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Costo total</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-600">{moneyUsd(resumen.costo_total_usd)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Costo inicial de los productos vendidos</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Ganancia neta</p>
            <p className={`mt-2 text-3xl font-semibold tracking-tight ${resumen.ganancia_usd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{moneyUsd(resumen.ganancia_usd)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ganancia real del negocio</p>
          </div>
          <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-5">
            <p className="text-sm text-muted-foreground">Margen global</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-cyan-600">{resumen.porcentaje.toFixed(1)}%</p>
            <p className="mt-1 text-xs text-muted-foreground">Sobre el ingreso neto</p>
          </div>
        </div>
      )}

      {/* Tabla de renglones */}
      <DataTable
        data={renglones}
        columns={columns}
        rowKey={(r) => r.product_id}
        searchKeys={(r) => r.product_name}
        searchPlaceholder="Buscar producto…"
        emptyMessage="No se encontraron productos"
        noDataMessage={cargando ? 'Cargando…' : 'Genera un reporte para ver la ganancia por producto'}
      />
    </div>
  )
}