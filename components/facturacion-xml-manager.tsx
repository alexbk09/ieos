'use client'

import { useCallback, useState } from 'react'
import { Download, FileCode2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { moneyUsd } from '@/lib/currency'

type EnvioSeniat = {
  id: string
  estado: 'generado' | 'firmado' | 'enviado' | 'rechazado' | 'anulado'
  created_at: string
}

type FacturaXML = {
  id: string
  invoice_number: string
  issued_at: string
  customer_name: string | null
  total: number
  xml_generado: string | null
  envio: EnvioSeniat | null
}

const ENVIO_LABELS: Record<EnvioSeniat['estado'], string> = {
  generado: 'Generado',
  firmado: 'Firmado',
  enviado: 'Enviado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
}

/** Gestor de facturación XML SENIAT. Genera y descarga el XML de facturas. */
export function FacturacionXmlManager({ initialFacturas }: { initialFacturas: FacturaXML[] }) {
  const [facturas, setFacturas] = useState(initialFacturas)
  const [generando, setGenerando] = useState<string | null>(null)

  // Modal de ver XML
  const [verXml, setVerXml] = useState<{ id: string; numero: string } | null>(null)
  const [xmlTexto, setXmlTexto] = useState('')
  const [xmlCargando, setXmlCargando] = useState(false)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/facturacion-xml', { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json()
    setFacturas(result.facturas ?? [])
  }, [])

  /** Genera el XML de una factura. */
  async function generar(factura: FacturaXML) {
    setGenerando(factura.id)
    try {
      const response = await fetch('/api/admin/facturacion-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: factura.id }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        toast.error(result.error ?? 'No se pudo generar el XML')
        return
      }
      refresh()
      toast.success(`XML generado para ${factura.invoice_number}`)
    } catch {
      toast.error('No se pudo generar el XML')
    } finally {
      setGenerando(null)
    }
  }

  /** Descarga el XML de una factura como archivo .xml. */
  async function descargar(factura: FacturaXML) {
    try {
      const response = await fetch(`/api/admin/facturacion-xml?xml=${factura.id}`, { cache: 'no-store' })
      if (!response.ok) {
        toast.error('No se pudo descargar el XML')
        return
      }
      const result = await response.json()
      const xml = result.xml
      if (!xml) {
        toast.error('Esta factura aún no tiene XML generado')
        return
      }
      const blob = new Blob([xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${factura.invoice_number}.xml`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('XML descargado')
    } catch {
      toast.error('No se pudo descargar el XML')
    }
  }

  /** Abre el modal para ver el XML. */
  async function verXML(factura: FacturaXML) {
    setVerXml({ id: factura.id, numero: factura.invoice_number })
    setXmlTexto('')
    setXmlCargando(true)
    try {
      const response = await fetch(`/api/admin/facturacion-xml?xml=${factura.id}`, { cache: 'no-store' })
      const result = await response.json()
      setXmlTexto(result.xml ?? '')
    } catch {
      toast.error('No se pudo cargar el XML')
    } finally {
      setXmlCargando(false)
    }
  }

  const columns: TableColumn<FacturaXML>[] = [
    {
      key: 'factura',
      header: 'Factura',
      sortable: true,
      sortValue: (f) => f.invoice_number,
      render: (f) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <FileText size={16} />
          </div>
          <div>
            <p className="font-medium">{f.invoice_number}</p>
            <p className="max-w-xs truncate text-xs text-muted-foreground">{f.customer_name || 'Cliente'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      hiddenMobile: true,
      render: (f) => <span className="font-mono text-sm">{moneyUsd(f.total)}</span>,
    },
    {
      key: 'estado',
      header: 'Estado XML',
      render: (f) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${f.xml_generado ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
          {f.xml_generado ? (f.envio ? ENVIO_LABELS[f.envio.estado] : 'Generado') : 'Sin XML'}
        </span>
      ),
    },
    {
      key: 'fecha',
      header: 'Emitida',
      hiddenMobile: true,
      render: (f) => <span className="text-xs text-muted-foreground">{new Date(f.issued_at).toLocaleDateString('es-VE')}</span>,
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-32',
      cellClassName: 'text-right',
      render: (f) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => verXML(f)}
            aria-label={`Ver XML de ${f.invoice_number}`}
            title="Ver XML"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FileCode2 size={14} />
          </button>
          {f.xml_generado ? (
            <button
              onClick={() => descargar(f)}
              aria-label={`Descargar XML de ${f.invoice_number}`}
              title="Descargar XML"
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download size={14} />
            </button>
          ) : (
            <button
              onClick={() => generar(f)}
              disabled={generando === f.id}
              aria-label={`Generar XML de ${f.invoice_number}`}
              title="Generar XML"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {generando === f.id ? (
                <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <FileCode2 size={13} />
              )}
              Generar
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <DataTable
        data={facturas}
        columns={columns}
        rowKey={(f) => f.id}
        searchKeys={(f) => `${f.invoice_number} ${f.customer_name ?? ''}`}
        searchPlaceholder="Buscar facturas…"
        emptyMessage="No se encontraron facturas"
        noDataMessage="Aún no hay facturas emitidas"
      />

      {/* Modal de ver XML */}
      <Modal
        open={Boolean(verXml)}
        onClose={() => setVerXml(null)}
        size="xl"
        title={`XML · ${verXml?.numero ?? ''}`}
        description="Contenido del XML de la factura electrónica (SENIAT)."
        icon={<FileCode2 size={18} />}
        footer={
          <button onClick={() => setVerXml(null)} className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
            Cerrar
          </button>
        }
      >
        {xmlCargando ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p>
        ) : xmlTexto ? (
          <pre className="max-h-96 overflow-auto rounded-2xl border border-border bg-muted/40 p-4 text-xs leading-relaxed">{xmlTexto}</pre>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Esta factura aún no tiene XML generado.</p>
        )}
      </Modal>
    </div>
  )
}