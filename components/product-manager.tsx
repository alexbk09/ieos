'use client'

import { useCallback, useState } from 'react'
import { FileSpreadsheet, ImagePlus, Package, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton, FormTextarea } from '@/components/ui/form-field'
import { BulkUploadModal } from '@/components/bulk-upload-modal'

type ProductImage = { id: string; url: string; alt_text: string | null; sort_order: number }
type Category = { id: string; name: string; slug: string }
type Marca = { id: string; nombre: string }
type Proveedor = { id: string; nombre: string }

/** Producto importado desde Excel (devuelto por la API). */
type ImportedProduct = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  costo_inicial?: number
  image_url: string | null
  featured: boolean
  categories?: Category[]
}

type Product = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  costo_inicial: number
  image_url: string | null
  category_id: string | null
  marca_id: string | null
  proveedor_id: string | null
  featured: boolean
  categories?: Category[]
  images?: ProductImage[]
}

/** Estado interno del formulario. Usa arreglos planos para categorías e imágenes. */
type EditorState = {
  id?: string
  name?: string
  slug?: string
  description?: string | null
  price_usd?: number
  stock?: number
  costo_inicial?: number
  marca_id?: string
  proveedor_id?: string
  featured?: boolean
  images?: string[]
  category_ids?: string[]
}

/** Convierte las imágenes de un producto a una lista plana de URLs. */
function productUrls(product?: Product) {
  if (!product) return []
  const urls = product.images?.map((img) => img.url) ?? []
  if (urls.length === 0 && product.image_url) urls.push(product.image_url)
  return [...new Set(urls)]
}

export function ProductManager({
  initialProducts,
  categories,
  marcas,
  proveedores,
}: {
  initialProducts: Product[]
  categories: Category[]
  marcas: Marca[]
  proveedores: Proveedor[]
}) {
  const [products, setProducts] = useState(initialProducts)
  const [modalOpen, setModalOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<EditorState | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  /**
   * Refresca la tabla de productos desde el servidor.
   * Trae la lista completa (con imágenes, categorías, marca y proveedor)
   * para que la tabla muestre siempre la información correcta. Los filtros
   * activos del DataTable (búsqueda, orden, página) se conservan porque la
   * tabla los aplica sobre el nuevo arreglo de datos automáticamente.
   */
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/admin/products', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudo refrescar la lista')
      const result = await response.json()
      setProducts(result.products ?? [])
    } catch {
      toast.error('Error al refrescar la tabla', { description: 'Los cambios podrían no reflejarse hasta recargar.' })
    } finally {
      setRefreshing(false)
    }
  }, [])

  /** Cuando termina la importación masiva, refresca la tabla completa con la información real del servidor. */
  function handleImported(_imported: ImportedProduct[]) {
    setBulkOpen(false)
    refresh()
  }

  /** Abre el modal para crear un producto nuevo. */
  function startNew() {
    setEditing({
      name: '',
      slug: '',
      description: '',
      price_usd: 0,
      stock: 0,
      costo_inicial: 0,
      marca_id: '',
      proveedor_id: '',
      featured: false,
      category_ids: categories[0] ? [categories[0].id] : [],
      images: [],
    })
    setModalOpen(true)
  }

  /** Abre el modal para editar un producto existente. */
  function startEdit(product: Product) {
    setEditing({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price_usd: product.price_usd,
      stock: product.stock,
      costo_inicial: product.costo_inicial ?? 0,
      marca_id: product.marca_id ?? '',
      proveedor_id: product.proveedor_id ?? '',
      featured: product.featured,
      images: productUrls(product),
      category_ids: (product.categories ?? []).map((c) => c.id),
    })
    setModalOpen(true)
  }

  /** Actualiza un campo del formulario. */
  function updateField<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditing((current) => (current ? { ...current, [key]: value } : current))
  }

  /** Alterna una categoría en la lista de categorías seleccionadas. */
  function toggleCategory(id: string) {
    setEditing((current) => {
      if (!current) return current
      const ids = current.category_ids ?? []
      return { ...current, category_ids: ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id] }
    })
  }

  /** Guarda un producto nuevo o editado. */
  async function save() {
    if (!editing?.name || !editing.slug) {
      toast.error('Falta información del producto', { description: 'Completa nombre y slug para continuar.' })
      return
    }
    if (!editing.category_ids || editing.category_ids.length === 0) {
      toast.error('Selecciona al menos una categoría', { description: 'Los productos deben pertenecer a una categoría.' })
      return
    }
    setSaving(true)
    const response = await fetch('/api/admin/products', {
      method: editing.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    setSaving(false)
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      toast.error('No se pudo guardar el producto', { description: result.error ?? 'Revisa la información e inténtalo de nuevo.' })
      return
    }
    setModalOpen(false)
    refresh()
    toast.success('Producto guardado', { description: 'Los cambios quedaron publicados en el catálogo.' })
  }

  /** Elimina un producto. */
  async function remove(id: string) {
    if (!confirm('¿Eliminar este producto?')) return
    setDeletingId(id)
    const response = await fetch(`/api/admin/products?id=${id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (!response.ok) {
      toast.error('No se pudo eliminar', { description: 'El producto no pudo borrarse en este momento.' })
      return
    }
    refresh()
    toast.success('Producto eliminado', { description: 'Se retiró del catálogo correctamente.' })
  }

  /** Sube una imagen al bucket y la agrega a la lista del producto. */
  async function upload(file: File) {
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    const response = await fetch('/api/admin/upload', { method: 'POST', body: form })
    const result = await response.json()
    setUploading(false)
    if (!response.ok) {
      toast.error('No se pudo cargar la imagen', { description: result.error ?? 'Verifica el bucket y vuelve a intentarlo.' })
      return
    }
    setEditing((current) => (current ? { ...current, images: [...(current.images ?? []), result.url] } : current))
    toast.success('Imagen cargada', { description: 'La imagen ya está lista para usar en el producto.' })
  }

  /** Quita una imagen de la lista de imágenes del producto. */
  function removeImage(url: string) {
    setEditing((current) => (current ? { ...current, images: (current.images ?? []).filter((img) => img !== url) } : current))
  }

  /** Columnas de la tabla de productos. */
  const columns: TableColumn<Product>[] = [
    {
      key: 'product',
      header: 'Producto',
      sortable: true,
      sortValue: (p) => p.name,
      render: (product) => (
        <div className="flex items-center gap-3">
          {product.images?.[0]?.url || product.image_url ? (
            <img src={product.images?.[0]?.url || product.image_url!} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted">
              <ImagePlus size={16} className="text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{product.name}</p>
            <p className="font-mono text-xs text-muted-foreground">/{product.slug}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {(product.categories ?? []).slice(0, 2).map((cat) => (
                <span key={cat.id} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{cat.name}</span>
              ))}
              {(product.categories?.length ?? 0) > 2 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">+{(product.categories ?? []).length - 2}</span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Precio',
      sortable: true,
      sortValue: (p) => Number(p.price_usd),
      render: (product) => <span className="font-medium">${Number(product.price_usd).toFixed(2)}</span>,
    },
    {
      key: 'costo',
      header: 'Costo inicial',
      sortable: true,
      sortValue: (p) => Number(p.costo_inicial),
      render: (product) => (
        <span className="font-medium text-muted-foreground">
          ${Number(product.costo_inicial ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      sortable: true,
      sortValue: (p) => p.stock,
      render: (product) => (
        <span className={product.stock < 20 ? 'font-medium text-amber-600' : ''}>
          {product.stock} <span className="text-xs text-muted-foreground">uds</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      hiddenMobile: true,
      render: (product) =>
        product.featured ? (
          <span className="rounded-full bg-accent/30 px-2.5 py-1 text-xs font-medium text-accent-foreground">Destacado</span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Activo</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-24',
      cellClassName: 'text-right',
      render: (product) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => startEdit(product)}
            aria-label={`Editar ${product.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => remove(product.id)}
            disabled={deletingId === product.id}
            aria-label={`Eliminar ${product.name}`}
            className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {deletingId === product.id ? (
              <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6">
      <DataTable
        data={products}
        columns={columns}
        rowKey={(p) => p.id}
        searchKeys={(p) => `${p.name} ${p.slug} ${p.description ?? ''} ${(p.categories ?? []).map((c) => c.name).join(' ')}`}
        searchPlaceholder="Buscar productos…"
        emptyMessage="No se encontraron productos"
        noDataMessage="Aún no hay productos"
        loading={refreshing}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setBulkOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              <FileSpreadsheet size={15} /> Carga masiva
            </button>
            <button
              onClick={startNew}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
            >
              <Plus size={15} /> Nuevo producto
            </button>
          </div>
        }
      />

      <BulkUploadModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        categories={categories}
        marcas={marcas}
        proveedores={proveedores}
        onImported={handleImported}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="xl"
        title={editing?.id ? 'Editar producto' : 'Nuevo producto'}
        description={editing?.id ? 'Actualiza la información del producto.' : 'Completa la información para publicar el producto.'}
        icon={<Package size={18} />}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
            <FormSubmitButton loading={saving} onClick={save}>
              {editing?.id ? 'Guardar cambios' : 'Crear producto'}
            </FormSubmitButton>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4">
            {/* Datos básicos */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput
                label="Nombre"
                value={editing.name ?? ''}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Ej: Lámpara LED de escritorio"
                autoFocus
              />
              <FormInput
                label="Slug"
                value={editing.slug ?? ''}
                onChange={(e) => updateField('slug', e.target.value)}
                placeholder="Ej: lampara-led-escritorio"
                hint="Usado en la URL del catálogo."
              />
            </div>

            <FormTextarea
              label="Descripción"
              value={editing.description ?? ''}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe las características del producto…"
            />

            {/* Precio, costo y stock */}
            <div className="grid gap-4 sm:grid-cols-3">
              <FormInput
                label="Precio USD"
                type="number"
                min="0"
                step="0.01"
                value={editing.price_usd ?? 0}
                onChange={(e) => updateField('price_usd', Number(e.target.value))}
              />
              <FormInput
                label="Costo inicial USD"
                type="number"
                min="0"
                step="0.01"
                value={editing.costo_inicial ?? 0}
                onChange={(e) => updateField('costo_inicial', Number(e.target.value))}
                hint="Costo de adquisición (opcional)."
              />
              <FormInput
                label="Stock"
                type="number"
                min="0"
                step="1"
                value={editing.stock ?? 0}
                onChange={(e) => updateField('stock', Number(e.target.value))}
              />
            </div>

            {/* Categorías */}
            <div className="grid gap-2 text-sm">
              <span className="font-medium">
                Categorías <span className="font-normal text-muted-foreground">(selecciona una o varias)</span>
              </span>
              <div className="grid max-h-44 gap-1.5 overflow-y-auto rounded-xl border border-input bg-background p-3">
                {categories.map((category) => {
                  const selected = (editing.category_ids ?? []).includes(category.id)
                  return (
                    <label key={category.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleCategory(category.id)}
                        className="size-4 accent-primary"
                      />
                      <span>{category.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Marca y Proveedor */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 text-sm">
                <span className="font-medium">Marca</span>
                <select
                  value={editing.marca_id ?? ''}
                  onChange={(e) => updateField('marca_id', e.target.value)}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                >
                  <option value="">Sin marca</option>
                  {marcas.map((marca) => (
                    <option key={marca.id} value={marca.id}>{marca.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 text-sm">
                <span className="font-medium">Proveedor</span>
                <select
                  value={editing.proveedor_id ?? ''}
                  onChange={(e) => updateField('proveedor_id', e.target.value)}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                >
                  <option value="">Sin proveedor</option>
                  {proveedores.map((proveedor) => (
                    <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Destacado */}
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(editing.featured)}
                onChange={(e) => updateField('featured', e.target.checked)}
                className="size-4 accent-primary"
              />
              <span className="font-medium">Mostrar como destacado</span>
              <span className="text-muted-foreground">en la portada</span>
            </label>

            {/* Imágenes */}
            <div className="rounded-2xl border border-dashed border-border p-4">
              <p className="mb-3 text-sm font-medium">Imágenes del producto</p>
              {(editing.images ?? []).length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {(editing.images ?? []).map((url, i) => (
                    <div key={url} className="relative">
                      <img src={url} alt={`Imagen ${i + 1}`} className="aspect-square w-20 rounded-xl object-cover" />
                      <button
                        onClick={() => removeImage(url)}
                        aria-label="Quitar imagen"
                        className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-destructive text-white shadow-sm"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm transition-colors hover:bg-secondary">
                <Upload size={16} />
                {uploading ? 'Cargando…' : 'Cargar imagen'}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
              </label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}