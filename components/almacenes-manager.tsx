'use client'

import { useCallback, useState } from 'react'
import { ArrowLeftRight, Boxes, Pencil, Plus, Trash2, Warehouse } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import { confirmDelete } from '@/components/confirm-dialog'

type Almacen = {
  id: string
  nombre: string
  codigo: string
  tipo: 'sucursal' | 'deposito' | 'bodega'
  direccion: string | null
  ciudad: string | null
  telefono: string | null
  responsable: string | null
  activo: boolean
  created_at: string
}

type ProductoSimple = {
  id: string
  name: string
  pricing_type: 'unit' | 'weight'
  stock: number
  stock_grams: number
}

type StockRow = {
  id: string
  almacen_id: string
  product_id: string
  stock: number
  stock_grams: number
  product_name: string
  pricing_type: 'unit' | 'weight'
}

/** Etiquetas visibles de los tipos de almacén. */
const TIPO_LABELS: Record<Almacen['tipo'], string> = {
  sucursal: 'Sucursal',
  deposito: 'Depósito',
  bodega: 'Bodega',
}

/**
 * Gestor de almacenes (CRUD + asignación de stock + transferencias).
 * Permite crear/editar/eliminar almacenes, asignar stock por producto
 * a cada almacén y transferir stock entre almacenes.
 * La lógica de datos se delega en la API /api/admin/almacenes.
 */
export function AlmacenesManager({
  initialAlmacenes,
  initialProductos,
}: {
  initialAlmacenes: Almacen[]
  initialProductos: ProductoSimple[]
}) {
  const [almacenes, setAlmacenes] = useState(initialAlmacenes)
  const [productos] = useState(initialProductos)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Almacen | null>(null)
  const [form, setForm] = useState({ nombre: '', codigo: '', tipo: 'deposito' as Almacen['tipo'], direccion: '', ciudad: '', telefono: '', responsable: '' })
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Estado del modal de stock (ver/asignar por almacén)
  const [stockAlmacen, setStockAlmacen] = useState<Almacen | null>(null)
  const [stockRows, setStockRows] = useState<StockRow[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [stockForm, setStockForm] = useState({ product_id: '', stock: '0', stock_grams: '0' })
  const [stockSaving, setStockSaving] = useState(false)

  // Estado del modal de transferencia
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferForm, setTransferForm] = useState({ product_id: '', origen: '', destino: '', cantidad: '0', cantidad_gramos: '0' })
  const [transferSaving, setTransferSaving] = useState(false)

  /** Refresca la lista de almacenes desde el servidor. */
  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/almacenes', { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json()
    setAlmacenes(result.almacenes ?? [])
  }, [])

  /** Abre el modal para crear un almacén nuevo. */
  function openCreate() {
    setEditing(null)
    setForm({ nombre: '', codigo: '', tipo: 'deposito', direccion: '', ciudad: '', telefono: '', responsable: '' })
    setModalOpen(true)
  }

  /** Abre el modal para editar un almacén existente. */
  function openEdit(almacen: Almacen) {
    setEditing(almacen)
    setForm({
      nombre: almacen.nombre,
      codigo: almacen.codigo,
      tipo: almacen.tipo,
      direccion: almacen.direccion ?? '',
      ciudad: almacen.ciudad ?? '',
      telefono: almacen.telefono ?? '',
      responsable: almacen.responsable ?? '',
    })
    setModalOpen(true)
  }

  /** Guarda la creación/edición de un almacén. */
  async function save() {
    if (!form.nombre.trim() || !form.codigo.trim()) {
      toast.error('Completa el nombre y el código del almacén')
      return
    }

    setSaving(true)
    const response = await fetch('/api/admin/almacenes', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing ? { id: editing.id, ...form } : form),
    })
    setSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo guardar el almacén')
      return
    }

    setModalOpen(false)
    refresh()
    toast.success(editing ? 'Almacén actualizado' : 'Almacén creado')
  }

  /** Elimina un almacén. */
  async function remove(id: string) {
    const ok = await confirmDelete({
      title: '¿Eliminar este almacén?',
      description: 'El stock asociado a este almacén también se eliminará.',
      confirmText: 'Sí, eliminar almacén',
    })
    if (!ok) return

    setDeletingId(id)
    const response = await fetch(`/api/admin/almacenes?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo eliminar')
      return
    }

    refresh()
    toast.success('Almacén eliminado')
  }

  /** Abre el modal de stock de un almacén y carga su inventario. */
  async function openStock(almacen: Almacen) {
    setStockAlmacen(almacen)
    setStockRows([])
    setStockForm({ product_id: '', stock: '0', stock_grams: '0' })
    setStockLoading(true)
    try {
      const response = await fetch(`/api/admin/almacenes?stock=${almacen.id}`, { cache: 'no-store' })
      const result = await response.json()
      setStockRows(result.stock ?? [])
    } catch {
      toast.error('No se pudo cargar el stock del almacén')
    } finally {
      setStockLoading(false)
    }
  }

  /** Asigna stock de un producto al almacén abierto. */
  async function saveStock() {
    if (!stockAlmacen || !stockForm.product_id) {
      toast.error('Selecciona un producto')
      return
    }

    setStockSaving(true)
    const response = await fetch('/api/admin/almacenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'asignar_stock',
        almacen_id: stockAlmacen.id,
        product_id: stockForm.product_id,
        stock: Number(stockForm.stock) || 0,
        stock_grams: Number(stockForm.stock_grams) || 0,
      }),
    })
    setStockSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo asignar el stock')
      return
    }

    await openStock(stockAlmacen)
    toast.success('Stock asignado')
  }

  /** Abre el modal de transferencia entre almacenes. */
  function openTransfer() {
    setTransferForm({ product_id: '', origen: '', destino: '', cantidad: '0', cantidad_gramos: '0' })
    setTransferOpen(true)
  }

  /** Ejecuta la transferencia de stock entre almacenes. */
  async function saveTransfer() {
    if (!transferForm.product_id || !transferForm.origen || !transferForm.destino) {
      toast.error('Selecciona producto, origen y destino')
      return
    }

    setTransferSaving(true)
    const response = await fetch('/api/admin/almacenes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'transferir',
        product_id: transferForm.product_id,
        origen: transferForm.origen,
        destino: transferForm.destino,
        cantidad: Number(transferForm.cantidad) || 0,
        cantidad_gramos: Number(transferForm.cantidad_gramos) || 0,
      }),
    })
    setTransferSaving(false)

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error(result.error ?? 'No se pudo transferir el stock')
      return
    }

    setTransferOpen(false)
    toast.success('Stock transferido')
  }

  const columns: TableColumn<Almacen>[] = [
    {
      key: 'nombre',
      header: 'Almacén',
      sortable: true,
      sortValue: (a) => a.nombre,
      render: (a) => (
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent-foreground">
            <Warehouse size={16} />
          </div>
          <div>
            <p className="font-medium">{a.nombre}</p>
            <p className="text-xs text-muted-foreground">{a.codigo} · {TIPO_LABELS[a.tipo]}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'ubicacion',
      header: 'Ubicación',
      hiddenMobile: true,
      render: (a) => (
        <span className="text-sm text-muted-foreground">{[a.ciudad, a.direccion].filter(Boolean).join(' — ') || 'Sin ubicación'}</span>
      ),
    },
    {
      key: 'responsable',
      header: 'Responsable',
      hiddenMobile: true,
      render: (a) => <span className="text-sm text-muted-foreground">{a.responsable || '—'}</span>,
    },
    {
      key: 'activo',
      header: 'Estado',
      hiddenMobile: true,
      render: (a) => (
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.activo ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
          {a.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-40',
      cellClassName: 'text-right',
      render: (a) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openStock(a)}
            aria-label={`Ver stock de ${a.nombre}`}
            title="Ver / asignar stock"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Boxes size={14} />
          </button>
          <button
            onClick={() => openEdit(a)}
            aria-label={`Editar ${a.nombre}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => remove(a.id)}
            disabled={deletingId === a.id}
            aria-label={`Eliminar ${a.nombre}`}
            className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-30"
          >
            {deletingId === a.id ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Trash2 size={14} />}
          </button>
        </div>
      ),
    },
  ]

  const stockColumns: TableColumn<StockRow>[] = [
    {
      key: 'producto',
      header: 'Producto',
      render: (row) => <span className="font-medium">{row.product_name}</span>,
    },
    {
      key: 'tipo',
      header: 'Tipo',
      hiddenMobile: true,
      render: (row) => <span className="text-xs text-muted-foreground">{row.pricing_type === 'weight' ? 'Por peso' : 'Por unidad'}</span>,
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (row) => <span className="font-mono text-sm">{row.pricing_type === 'weight' ? `${Number(row.stock_grams).toLocaleString()} g` : row.stock}</span>,
    },
  ]

  return (
    <div className="grid gap-6">
      <DataTable
        data={almacenes}
        columns={columns}
        rowKey={(a) => a.id}
        searchKeys={(a) => `${a.nombre} ${a.codigo} ${a.ciudad ?? ''} ${a.responsable ?? ''}`}
        searchPlaceholder="Buscar almacenes…"
        emptyMessage="No se encontraron almacenes"
        noDataMessage="Aún no hay almacenes"
        toolbar={
          <div className="flex gap-2">
            <button
              onClick={openTransfer}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ArrowLeftRight size={15} /> Transferir
            </button>
            <button
              onClick={openCreate}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <Plus size={15} /> Nuevo almacén
            </button>
          </div>
        }
      />

      {/* Modal de crear/editar almacén */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title={editing ? 'Editar almacén' : 'Nuevo almacén'}
        description={editing ? 'Actualiza la información del almacén.' : 'Crea una sucursal, depósito o bodega.'}
        icon={<Warehouse size={18} />}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={save}>
              {editing ? 'Guardar cambios' : 'Crear almacén'}
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Nombre del almacén" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Depósito central" autoFocus />
          <FormInput label="Código" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Ej: DEP-01" />
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Tipo</span>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as Almacen['tipo'] })}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="sucursal">Sucursal</option>
              <option value="deposito">Depósito</option>
              <option value="bodega">Bodega</option>
            </select>
          </label>
          <FormInput label="Ciudad" value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} placeholder="Ej: Caracas" />
          <FormInput label="Dirección" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección física" />
          <FormInput label="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Ej: 0412-0000000" />
          <FormInput label="Responsable" value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} placeholder="Nombre del encargado" className="sm:col-span-2" />
        </div>
      </Modal>

      {/* Modal de stock por almacén */}
      <Modal
        open={Boolean(stockAlmacen)}
        onClose={() => setStockAlmacen(null)}
        size="xl"
        title={`Stock de ${stockAlmacen?.nombre ?? ''}`}
        description="Asigna o actualiza el stock por producto en este almacén."
        icon={<Boxes size={18} />}
        footer={
          <>
            <button
              onClick={() => setStockAlmacen(null)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cerrar
            </button>
            <FormSubmitButton loading={stockSaving} onClick={saveStock}>
              Asignar stock
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Producto</span>
              <select
                value={stockForm.product_id}
                onChange={(e) => setStockForm({ ...stockForm, product_id: e.target.value })}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="">Seleccionar…</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.pricing_type === 'weight' ? ' (peso)' : ''}</option>
                ))}
              </select>
            </label>
            <FormInput label="Unidades" type="number" min={0} value={stockForm.stock} onChange={(e) => setStockForm({ ...stockForm, stock: e.target.value })} placeholder="0" />
            <FormInput label="Gramos (si es peso)" type="number" min={0} step="0.01" value={stockForm.stock_grams} onChange={(e) => setStockForm({ ...stockForm, stock_grams: e.target.value })} placeholder="0" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            <DataTable
              data={stockRows}
              columns={stockColumns}
              rowKey={(r) => r.id}
              searchKeys={(r) => r.product_name}
              searchPlaceholder="Buscar producto en almacén…"
              emptyMessage="Sin resultados"
              noDataMessage={stockLoading ? 'Cargando…' : 'Aún no hay stock en este almacén'}
              pageSize={6}
            />
          </div>
        </div>
      </Modal>

      {/* Modal de transferencia entre almacenes */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        size="lg"
        title="Transferir stock"
        description="Mueve stock entre almacenes en una sola transacción."
        icon={<ArrowLeftRight size={18} />}
        footer={
          <>
            <button
              onClick={() => setTransferOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <FormSubmitButton loading={transferSaving} onClick={saveTransfer}>
              Transferir
            </FormSubmitButton>
          </>
        }
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Producto</span>
            <select
              value={transferForm.product_id}
              onChange={(e) => setTransferForm({ ...transferForm, product_id: e.target.value })}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              <option value="">Seleccionar…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.pricing_type === 'weight' ? ' (peso)' : ''}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Origen</span>
              <select
                value={transferForm.origen}
                onChange={(e) => setTransferForm({ ...transferForm, origen: e.target.value })}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="">Seleccionar…</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Destino</span>
              <select
                value={transferForm.destino}
                onChange={(e) => setTransferForm({ ...transferForm, destino: e.target.value })}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="">Seleccionar…</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput label="Cantidad (unidades)" type="number" min={0} value={transferForm.cantidad} onChange={(e) => setTransferForm({ ...transferForm, cantidad: e.target.value })} placeholder="0" />
            <FormInput label="Gramos (si es peso)" type="number" min={0} step="0.01" value={transferForm.cantidad_gramos} onChange={(e) => setTransferForm({ ...transferForm, cantidad_gramos: e.target.value })} placeholder="0" />
          </div>
          <p className="text-xs text-muted-foreground">Para productos por unidad usa «Cantidad». Para productos por peso usa «Gramos».</p>
        </div>
      </Modal>
    </div>
  )
}