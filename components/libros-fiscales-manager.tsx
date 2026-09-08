'use client'

import { useState } from 'react'
import { BookOpen, Download, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { moneyUsd } from '@/lib/currency'

type RegistroVenta = {
  invoice_number?: string
  issuer_rif?: string
  customer_name?: string | null
  customer_document?: string | null
  subtotal?: number
  iva_amount?: number
  exento_amount?: number
  total?: number
  issued_at?: string
}

type RegistroCompra = {
  id: string
  numero_factura?: string
  emisor_rif?: string
  emisor_nombre?: string | null
  base_imponible?: number
  iva_amount?: number
  exento_amount?: number
  total?: number
  fecha_emision?: string
}

/** Gestor de libros fiscales. Genera y exporta libros de compra/venta en Excel. */
export function LibrosFiscalesManager() {
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
  const hoyStr = hoy.toISOString().slice(0, 10)

  const [tipo, setTipo] = useState<'venta' | 'compra'>('venta')
  const [inicio, setInicio] = useState(inicioMes)
  const [fin, setFin] = useState(hoyStr)
  const [cargando, setCargando] = useState(false)
  const [registros, setRegistros] = useState<RegistroVenta[] | RegistroCompra[]>([])
  const [resumen, setResumen] = useState<{ cantidad: number; base_imponible: number; iva_amount: number; exento_amount: number; total: number } | null>(null)

  // Modal de factura de proveedor (libro de compras)
  const [facturaOpen, setFacturaOpen] = useState(false)
  const [facturaForm, setFacturaForm] = useState({ numero_factura: '', emisor_rif: '', emisor_nombre: '', base_imponible: '', iva_amount: '', exento_amount: '', total: '', fecha_emision: hoyStr })
  const [facturaSaving, setFacturaSaving] = useState(false)

  async function generar() {
    if (!inicio || !fin) {
      toast.error('Selecciona el período del libro')
      return
    }
    setCargando(true)
    try {
      const response = await fetch(`/api/admin/libros-fiscales?tipo=${tipo}&inicio=${inicio}&fin=${fin}`, { cache: 'no-store' })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        toast.error(result.error ?? 'No se pudo generar el libro')
        return
      }
      const data = await response.json()
      setRegistros(data.registros ?? [])
      setResumen(data.resumen ?? null)
    } catch {
      toast.error('No se pudo generar el libro')
    } finally {
      setCargando(false)
    }
  }

  async function exportarExcel() {
    if (registros.length === 0) {
      toast.error('No hay registros para exportar')
      return
    }

    // Carga diferida: la librería xlsx (~1.8MB) solo se descarga
    // cuando el usuario pulsa "Exportar", no al abrir la página.
    const XLSX = await import('xlsx')

    const filas = registros.map((r: any) =>
      tipo === 'venta'
        ? {
            'N° Factura': r.invoice_number ?? '',
            'RIF Emisor': r.issuer_rif ?? '',
            'Cliente': r.customer_name ?? '',
            'Documento': r.customer_document ?? '',
            'Base Imponible': Number(r.subtotal ?? 0),
            'IVA': Number(r.iva_amount ?? 0),
            'Exento': Number(r.exento_amount ?? 0),
            'Total': Number(r.total ?? 0),
            'Fecha': r.issued_at ? new Date(r.issued_at).toLocaleDateString('es-VE') : '',
          }
        : {
            'N° Factura': r.numero_factura ?? '',
            'RIF': r.emisor_rif ?? '',
            'Proveedor': r.emisor_nombre ?? '',
            'Base Imponible': Number(r.base_imponible ?? 0),
            'IVA': Number(r.iva_amount ?? 0),
            'Exento': Number(r.exento_amount ?? 0),
            'Total': Number(r.total ?? 0),
            'Fecha': r.fecha_emision ? new Date(r.fecha_emision).toLocaleDateString('es-VE') : '',
          },
    )

    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Libro ${tipo === 'venta' ? 'Ventas' : 'Compras'}`)
    XLSX.writeFile(wb, `libro_${tipo}_${inicio}_${fin}.xlsx`)

    // Registrar exportación
    await fetch('/api/admin/libros-fiscales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'registrar_exportacion', tipo, inicio, fin, formato: 'excel' }),
    })

    toast.success('Libro exportado en Excel')
  }

  const ventaColumns: TableColumn<any>[] = [
    { key: 'factura', header: 'N° Factura', render: (r) => <span className="font-mono text-sm">{r.invoice_number ?? '—'}</span> },
    { key: 'cliente', header: 'Cliente', render: (r) => <span className="text-sm">{r.customer_name || '—'}</span> },
    { key: 'base', header: 'Base', hiddenMobile: true, render: (r) => <span className="font-mono text-sm">{moneyUsd(Number(r.subtotal ?? 0))}</span> },
    { key: 'iva', header: 'IVA', hiddenMobile: true, render: (r) => <span className="font-mono text-sm">{moneyUsd(Number(r.iva_amount ?? 0))}</span> },
    { key: 'total', header: 'Total', render: (r) => <span className="font-mono text-sm font-semibold">{moneyUsd(Number(r.total ?? 0))}</span> },
    { key: 'fecha', header: 'Fecha', hiddenMobile: true, render: (r) => <span className="text-xs text-muted-foreground">{r.issued_at ? new Date(r.issued_at).toLocaleDateString('es-VE') : '—'}</span> },
  ]

  const compraColumns: TableColumn<any>[] = [
    { key: 'factura', header: 'N° Factura', render: (r) => <span className="font-mono text-sm">{r.numero_factura ?? '—'}</span> },
    { key: 'proveedor', header: 'Proveedor', render: (r) => <span className="text-sm">{r.emisor_nombre || '—'}</span> },
    { key: 'rif', header: 'RIF', hiddenMobile: true, render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.emisor_rif ?? '—'}</span> },
    { key: 'base', header: 'Base', hiddenMobile: true, render: (r) => <span className="font-mono text-sm">{moneyUsd(Number(r.base_imponible ?? 0))}</span> },
    { key: 'iva', header: 'IVA', hiddenMobile: true, render: (r) => <span className="font-mono text-sm">{moneyUsd(Number(r.iva_amount ?? 0))}</span> },
    { key: 'total', header: 'Total', render: (r) => <span className="font-mono text-sm font-semibold">{moneyUsd(Number(r.total ?? 0))}</span> },
    { key: 'fecha', header: 'Fecha', hiddenMobile: true, render: (r) => <span className="text-xs text-muted-foreground">{r.fecha_emision ? new Date(r.fecha_emision).toLocaleDateString('es-VE') : '—'}</span> },
  ]

  async function saveFacturaProveedor() {
    if (!facturaForm.numero_factura.trim() || !facturaForm.emisor_rif.trim()) {
      toast.error('Completa el número de factura y el RIF')
      return
    }
    setFacturaSaving(true)
    const response = await fetch('/api/admin/libros-fiscales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...facturaForm, tipo }),
    })
    setFacturaSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo registrar la factura')
      return
    }
    setFacturaOpen(false)
    setFacturaForm({ numero_factura: '', emisor_rif: '', emisor_nombre: '', base_imponible: '', iva_amount: '', exento_amount: '', total: '', fecha_emision: hoyStr })
    generar()
    toast.success('Factura de proveedor registrada')
  }

  return (
    <div className="grid gap-6">
      {/* Selector de libro y período */}
      <div className="rounded-3xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Tipo de libro</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as 'venta' | 'compra')}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="venta">Libro de Ventas</option>
              <option value="compra">Libro de Compras</option>
            </select>
          </label>
          <FormInput label="Desde" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          <FormInput label="Hasta" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          <FormSubmitButton loading={cargando} onClick={generar} loadingText="Generando…">
            <BookOpen size={15} /> Generar libro
          </FormSubmitButton>
          <button
            onClick={exportarExcel}
            disabled={registros.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-40"
          >
            <Download size={15} /> Exportar Excel
          </button>
          {tipo === 'compra' && (
            <button onClick={() => setFacturaOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]">
              <Plus size={15} /> Factura proveedor
            </button>
          )}
        </div>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-3xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Registros</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{resumen.cantidad}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Base imponible</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{moneyUsd(resumen.base_imponible)}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">IVA</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-600">{moneyUsd(resumen.iva_amount)}</p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Exento</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{moneyUsd(resumen.exento_amount)}</p>
          </div>
          <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-5">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-cyan-600">{moneyUsd(resumen.total)}</p>
          </div>
        </div>
      )}

      {/* Tabla de registros */}
      <DataTable
        data={registros}
        columns={tipo === 'venta' ? ventaColumns : compraColumns}
        rowKey={(r: any) => r.id ?? r.invoice_number ?? Math.random().toString()}
        searchKeys={(r: any) => `${r.invoice_number ?? ''} ${r.numero_factura ?? ''} ${r.customer_name ?? ''} ${r.emisor_nombre ?? ''} ${r.emisor_rif ?? ''}`}
        searchPlaceholder="Buscar registros…"
        emptyMessage="No se encontraron registros"
        noDataMessage={cargando ? 'Cargando…' : 'Genera un libro para ver los registros'}
      />

      {/* Modal de factura de proveedor */}
      <Modal
        open={facturaOpen}
        onClose={() => setFacturaOpen(false)}
        size="lg"
        title="Factura de proveedor"
        description="Registra una factura recibida para el libro de compras."
        icon={<BookOpen size={18} />}
        footer={
          <>
            <button onClick={() => setFacturaOpen(false)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
              Cancelar
            </button>
            <FormSubmitButton loading={facturaSaving} onClick={saveFacturaProveedor}>
              Guardar factura
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="N° Factura" value={facturaForm.numero_factura} onChange={(e) => setFacturaForm({ ...facturaForm, numero_factura: e.target.value })} placeholder="FP-0001" autoFocus />
          <FormInput label="RIF del emisor" value={facturaForm.emisor_rif} onChange={(e) => setFacturaForm({ ...facturaForm, emisor_rif: e.target.value })} placeholder="J-00000000-0" />
          <FormInput label="Proveedor" value={facturaForm.emisor_nombre} onChange={(e) => setFacturaForm({ ...facturaForm, emisor_nombre: e.target.value })} placeholder="Nombre del proveedor" />
          <FormInput label="Fecha de emisión" type="date" value={facturaForm.fecha_emision} onChange={(e) => setFacturaForm({ ...facturaForm, fecha_emision: e.target.value })} />
          <FormInput label="Base imponible (USD)" type="number" min={0} step="0.01" value={facturaForm.base_imponible} onChange={(e) => setFacturaForm({ ...facturaForm, base_imponible: e.target.value })} placeholder="0.00" />
          <FormInput label="IVA (USD)" type="number" min={0} step="0.01" value={facturaForm.iva_amount} onChange={(e) => setFacturaForm({ ...facturaForm, iva_amount: e.target.value })} placeholder="0.00" />
          <FormInput label="Exento (USD)" type="number" min={0} step="0.01" value={facturaForm.exento_amount} onChange={(e) => setFacturaForm({ ...facturaForm, exento_amount: e.target.value })} placeholder="0.00" />
          <FormInput label="Total (USD)" type="number" min={0} step="0.01" value={facturaForm.total} onChange={(e) => setFacturaForm({ ...facturaForm, total: e.target.value })} placeholder="0.00" />
        </div>
      </Modal>
    </div>
  )
}