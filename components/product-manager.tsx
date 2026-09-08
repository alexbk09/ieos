'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import * as XLSX from 'xlsx'
import { Building2, Download, FileSpreadsheet, ImagePlus, Package, Pencil, Plus, Tag, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { FormInput, FormSubmitButton, FormTextarea } from '@/components/ui/form-field'
import { SearchableMultiSelect, SearchableSelect } from '@/components/ui/select-search'
import { BulkUploadModal } from '@/components/bulk-upload-modal'
import { confirmDelete } from '@/components/confirm-dialog'
import { lossPerProductUnit } from '@/lib/rate-spread-calculator'
import { resetBodyScroll } from '@/lib/scroll-lock'

type ProductImage = { id: string; url: string; alt_text: string | null; sort_order: number; color_name?: string | null }
type Category = { id: string; name: string; slug: string }
type Marca = { id: string; nombre: string }
type Proveedor = { id: string; nombre: string }
type ProductMarca = { id: string; nombre: string; activa: boolean }
type ProductProveedor = { id: string; nombre: string; rif: string | null; activo: boolean }

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
  peso?: string | null
  tamaño?: string | null
  pricing_type: 'unit' | 'weight'
  price_per_kilo_usd: number
  price_per_gram_usd: number
  stock_grams: number
  min_order_grams: number
  unit_label: string
  is_available: boolean
  low_stock_threshold: number
  sku: string | null
  bar_code: string | null
  bulk_discount_percent: number
  sort_order: number
  weight_grams: number | null
  colors?: string[]
  categories?: Category[]
  images?: ProductImage[]
  marca?: ProductMarca | null
  proveedor?: ProductProveedor | null
}

/** Color con su imagen asociada (opcional) para el editor moderno. */
type ColorVariant = {
  name: string
  image?: string
}

/** Estado interno del formulario. Usa arreglos planos para categorías, imágenes y colores. */
type EditorState = {
  id?: string
  name?: string
  slug?: string
  description?: string | null
  price_usd?: number
  stock?: number
  costo_inicial?: number
  peso?: string
  tamaño?: string
  pricing_type?: 'unit' | 'weight'
  price_per_kilo_usd?: number
  price_per_gram_usd?: number
  stock_grams?: number
  min_order_grams?: number
  unit_label?: string
  is_available?: boolean
  low_stock_threshold?: number
  sku?: string
  bar_code?: string
  bulk_discount_percent?: number
  sort_order?: number
  weight_grams?: number
  marca_id?: string
  proveedor_id?: string
  featured?: boolean
  images?: string[]
  category_ids?: string[]
  colors?: ColorVariant[]
}

/** Convierte las imágenes de un producto a una lista plana de URLs (solo imágenes generales, sin color). */
function productUrls(product?: Product) {
  if (!product) return []
  const urls = product.images?.filter((img) => !img.color_name).map((img) => img.url) ?? []
  if (urls.length === 0 && product.image_url) urls.push(product.image_url)
  return [...new Set(urls)]
}

/** Extrae los colores del producto como variantes (con su imagen si existe). */
function productColors(product?: Product): ColorVariant[] {
  if (!product) return []
  const colors = product.colors ?? []
  const imageByColor = new Map<string, string>()
  for (const img of product.images ?? []) {
    if (img.color_name && img.url) imageByColor.set(img.color_name, img.url)
  }
  return colors.map((name) => ({ name, image: imageByColor.get(name) }))
}

/** Opciones de unidades de venta comunes. */
const UNIT_OPTIONS = [
  { value: 'u', label: 'u (unidad)' },
  { value: 'g', label: 'g (gramo)' },
  { value: 'kg', label: 'kg (kilo)' },
  { value: 'm', label: 'm (metro)' },
  { value: 'cm', label: 'cm (centímetro)' },
  { value: 'pkg', label: 'pkg (paquete)' },
  { value: 'box', label: 'box (caja)' },
]

/**
 * Botón de selección de imagen con input oculto por completo.
 * Usa un input con display:none + click programático (ref.click()) en
 * lugar de un <label> envolviendo un input sr-only. Así el navegador
 * NUNCA devuelve el foco visual al input al cerrar el selector de
 * archivos nativo, evitando el anillo de foco azul/ring que quedaba
 * pegado en el modal al elegir una fotografía para un color.
 */
function ImagePickerButton({
  onPick,
  children,
  disabled,
  className,
}: {
  onPick: (file: File) => void
  children: ReactNode
  disabled?: boolean
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className={className}
      >
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          // Limpia el valor para permitir re-seleccionar el mismo archivo.
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPick(file)
        }}
      />
    </>
  )
}

export function ProductManager({
  initialProducts,
  categories,
  marcas,
  proveedores,
  officialRate,
  parallelRate,
}: {
  initialProducts: Product[]
  categories: Category[]
  marcas: Marca[]
  proveedores: Proveedor[]
  officialRate: number
  parallelRate: number
}) {
  const [products, setProducts] = useState(initialProducts)
  const [modalOpen, setModalOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<EditorState | null>(null)
  const [uploading, setUploading] = useState(false)
  /** Índice del color cuya imagen se está subiendo (null = ninguno). */
  const [uploadingColorIndex, setUploadingColorIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [filteredProducts, setFilteredProducts] = useState<Product[]>(initialProducts)

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

  /**
   * Descarga un Excel con todos los productos que coinciden con el filtro
   * activo del DataTable (búsqueda actual). Si no hay filtro, exporta todos.
   */
  function exportProducts() {
    const toExport = filteredProducts
    if (toExport.length === 0) {
      toast.error('No hay productos para exportar', { description: 'Ajusta la búsqueda o agrega productos primero.' })
      return
    }

    setExporting(true)
    try {
      // Mapea los productos filtrados a filas legibles del Excel
      const rows = toExport.map((product) => ({
        Nombre: product.name,
        Slug: product.slug,
        Descripción: product.description ?? '',
        'Precio USD': Number(product.price_usd),
        'Costo inicial USD': Number(product.costo_inicial ?? 0),
        Stock: product.stock,
        Categorías: (product.categories ?? []).map((c) => c.name).join(', '),
        Marca: product.marca?.nombre ?? '',
        Proveedor: product.proveedor?.nombre ?? '',
        Destacado: product.featured ? 'SI' : 'NO',
        'URL imagen': product.images?.[0]?.url ?? product.image_url ?? '',
        // Nuevos campos de peso/venta
        'Tipo de precio': product.pricing_type === 'weight' ? 'peso' : 'unidad',
        'Precio por kg USD': Number(product.price_per_kilo_usd),
        'Precio por g USD': Number(product.price_per_gram_usd),
        'Stock gramos': Number(product.stock_grams),
        'Mín. gramos': Number(product.min_order_grams),
        Unidad: product.unit_label,
        Disponible: product.is_available ? 'SI' : 'NO',
        'Stock bajo umbral': Number(product.low_stock_threshold),
        SKU: product.sku ?? '',
        'Código barra': product.bar_code ?? '',
        'Mayoreo %': Number(product.bulk_discount_percent),
        Orden: Number(product.sort_order),
        'Peso unitario g': product.weight_grams ?? '',
      }))

      // Crea la hoja de cálculo con ancho de columnas legible
      const worksheet = XLSX.utils.json_to_sheet(rows)

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos')

      // Nombre del archivo con fecha y cantidad exportada
      const date = new Date().toISOString().slice(0, 10)
      const totalLabel = toExport.length === (products?.length ?? 0) ? 'todos' : String(toExport.length)
      XLSX.writeFile(workbook, `productos-${date}-${totalLabel}.xlsx`)

      toast.success('Exportación completada', {
        description: `Se exportaron ${toExport.length} producto${toExport.length !== 1 ? 's' : ''} a Excel.`,
      })
    } catch {
      toast.error('No se pudo exportar', { description: 'Ocurrió un error al generar el archivo Excel.' })
    } finally {
      setExporting(false)
    }
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
      peso: '',
      tamaño: '',
      pricing_type: 'unit',
      price_per_kilo_usd: 0,
      price_per_gram_usd: 0,
      stock_grams: 0,
      min_order_grams: 0,
      unit_label: 'u',
      is_available: true,
      low_stock_threshold: 10,
      sku: '',
      bar_code: '',
      bulk_discount_percent: 0,
      sort_order: 0,
      weight_grams: undefined,
      marca_id: '',
      proveedor_id: '',
      featured: false,
      category_ids: categories[0] ? [categories[0].id] : [],
      images: [],
      colors: [],
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
      peso: product.peso ?? '',
      tamaño: product.tamaño ?? '',
      pricing_type: product.pricing_type,
      price_per_kilo_usd: product.price_per_kilo_usd ?? 0,
      price_per_gram_usd: product.price_per_gram_usd ?? 0,
      stock_grams: product.stock_grams ?? 0,
      min_order_grams: product.min_order_grams ?? 0,
      unit_label: product.unit_label ?? 'u',
      is_available: product.is_available !== false,
      low_stock_threshold: product.low_stock_threshold ?? 10,
      sku: product.sku ?? '',
      bar_code: product.bar_code ?? '',
      bulk_discount_percent: product.bulk_discount_percent ?? 0,
      sort_order: product.sort_order ?? 0,
      weight_grams: product.weight_grams ?? undefined,
      marca_id: product.marca_id ?? '',
      proveedor_id: product.proveedor_id ?? '',
      featured: product.featured,
      images: productUrls(product),
      category_ids: (product.categories ?? []).map((c) => c.id),
      colors: productColors(product),
    })
    setModalOpen(true)
  }

  /** Actualiza un campo del formulario. */
  function updateField<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditing((current) => (current ? { ...current, [key]: value } : current))
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

    // Construye el payload: colores como nombres + imágenes asociadas por color
    const colors = (editing.colors ?? []).map((c) => c.name.trim()).filter(Boolean)
    const colorImages = (editing.colors ?? [])
      .filter((c) => c.name.trim() && c.image)
      .map((c) => ({ color_name: c.name.trim(), url: c.image! }))

    // Calcula precio por gramo desde el precio por kilo (si viene)
    const isWeight = editing.pricing_type === 'weight'
    const pricePerKilo = Number(editing.price_per_kilo_usd ?? 0)
    const pricePerGram = isWeight && pricePerKilo > 0 ? pricePerKilo / 1000 : Number(editing.price_per_gram_usd ?? 0)

    const response = await fetch('/api/admin/products', {
      method: editing.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editing, colors, colorImages, price_per_gram_usd: pricePerGram }),
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
    const ok = await confirmDelete({
      title: '¿Eliminar este producto?',
      description: 'Se retirará del catálogo y no se podrá recuperar.',
      confirmText: 'Sí, eliminar producto',
    })
    if (!ok) return
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

  /** Agrega un color vacío al editor. */
  function addColor() {
    setEditing((current) => (current ? { ...current, colors: [...(current.colors ?? []), { name: '', image: undefined }] } : current))
  }

  /** Actualiza el nombre de un color en el editor. */
  function updateColorName(index: number, name: string) {
    setEditing((current) => {
      if (!current) return current
      const colors = [...(current.colors ?? [])]
      colors[index] = { ...colors[index], name }
      return { ...current, colors }
    })
  }

  /** Quita un color del editor. */
  function removeColor(index: number) {
    setEditing((current) => {
      if (!current) return current
      return { ...current, colors: (current.colors ?? []).filter((_, i) => i !== index) }
    })
  }

  /** Sube una imagen para un color específico y la asigna a la variante. */
  async function uploadColorImage(index: number, file: File) {
    // Estado de carga LOCAL al color: no debe alterar el resto del modal.
    setUploadingColorIndex(index)
    const form = new FormData()
    form.append('file', file)
    const response = await fetch('/api/admin/upload', { method: 'POST', body: form })
    const result = await response.json()
    setUploadingColorIndex(null)
    if (!response.ok) {
      toast.error('No se pudo cargar la imagen', { description: result.error ?? 'Verifica el bucket y vuelve a intentarlo.' })
      return
    }
    setEditing((current) => {
      if (!current) return current
      const colors = [...(current.colors ?? [])]
      colors[index] = { ...colors[index], image: result.url }
      return { ...current, colors }
    })
    toast.success('Imagen del color cargada', { description: 'La imagen se mostrará al seleccionar este color.' })
  }

  /**
   * Limpieza de scroll: cuando el modal de producto se cierra (guardado,
   * cancelado o backdrop), restaura el overflow del body por si el
   * contador del scroll-lock quedó desincronizado (p. ej. un modal
   * anidado que cierra antes que el padre). Sin esto, el body puede
   * quedar con overflow:hidden y bloquear el scroll / clicks del panel.
   */
  useEffect(() => {
    if (!modalOpen) resetBodyScroll()
  }, [modalOpen])

  /**
   * Opciones de marca para el formulario.
   * Incluye la marca actual del producto en edición aunque esté inactiva,
   * para que la selección no desaparezca al abrir el modal.
   */
  const marcaOptions = useMemo(() => {
    const base = marcas.map((marca) => ({ value: marca.id, label: marca.nombre }))
    const currentProduct = products.find((p) => p.id === editing?.id)
    if (currentProduct?.marca && !base.some((o) => o.value === currentProduct.marca!.id)) {
      base.unshift({ value: currentProduct.marca!.id, label: currentProduct.marca!.nombre })
    }
    return [{ value: '', label: 'Sin marca' }, ...base]
  }, [marcas, products, editing?.id])

  /**
   * Opciones de proveedor para el formulario.
   * Incluye el proveedor actual del producto en edición aunque esté inactivo,
   * para que la selección no desaparezca al abrir el modal.
   */
  const proveedorOptions = useMemo(() => {
    const base = proveedores.map((proveedor) => ({ value: proveedor.id, label: proveedor.nombre }))
    const currentProduct = products.find((p) => p.id === editing?.id)
    if (currentProduct?.proveedor && !base.some((o) => o.value === currentProduct.proveedor!.id)) {
      base.unshift({ value: currentProduct.proveedor!.id, label: currentProduct.proveedor!.nombre })
    }
    return [{ value: '', label: 'Sin proveedor' }, ...base]
  }, [proveedores, products, editing?.id])

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
              {/* Badge de tipo de precio */}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${product.pricing_type === 'weight' ? 'bg-cyan-500/10 text-cyan-600' : 'bg-muted text-muted-foreground'}`}>
                {product.pricing_type === 'weight' ? '⚖ por peso' : 'por unidad'}
              </span>
              {!product.is_available && (
                <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-600">Oculto</span>
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
      render: (product) => (
        <div>
          <span className="font-medium">${Number(product.price_usd).toFixed(2)}</span>
          {product.pricing_type === 'weight' && (
            <p className="text-xs text-muted-foreground">
              ${Number(product.price_per_gram_usd).toFixed(4)}/g
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'loss',
      header: 'Pérdida USD',
      sortable: true,
      sortValue: (p) => { const { lossUsd } = lossPerProductUnit(Number(p.price_usd), officialRate, parallelRate); return lossUsd ?? 0 },
      hiddenMobile: true,
      render: (product) => { const { lossUsd } = lossPerProductUnit(Number(product.price_usd), officialRate, parallelRate); if (lossUsd === null) return <span className="text-xs text-muted-foreground/60">—</span>; return <span className="font-medium text-rose-600" title={`Diferencia entre tasa paralela y oficial: Bs. ${(parallelRate - officialRate).toFixed(2)} por USD`}>${lossUsd.toFixed(2)}</span> },
    },
    {
      key: 'stock',
      header: 'Stock',
      sortable: true,
      sortValue: (p) => (p.pricing_type === 'weight' ? p.stock_grams : p.stock),
      render: (product) => {
        const isWeight = product.pricing_type === 'weight'
        const stockValue = isWeight ? product.stock_grams : product.stock
        const low = isWeight ? stockValue < (product.min_order_grams * 10) : stockValue < product.low_stock_threshold
        return (
          <span className={low ? 'font-medium text-amber-600' : ''}>
            {isWeight
              ? `${stockValue.toLocaleString('es-VE')} g`
              : `${stockValue} ${product.unit_label || 'uds'}`}
          </span>
        )
      },
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      sortValue: (p) => p.sku ?? '',
      hiddenMobile: true,
      render: (product) => (
        product.sku ? (
          <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )
      ),
    },
    {
      key: 'marca',
      header: 'Marca',
      sortable: true,
      sortValue: (p) => p.marca?.nombre ?? '',
      hiddenMobile: true,
      render: (product) => (
        product.marca ? (
          <span className="inline-flex max-w-[160px] items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Tag size={11} className="shrink-0" />
            <span className="truncate">{product.marca.nombre}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )
      ),
    },
    {
      key: 'proveedor',
      header: 'Proveedor',
      sortable: true,
      sortValue: (p) => p.proveedor?.nombre ?? '',
      hiddenMobile: true,
      render: (product) => (
        product.proveedor ? (
          <span className="inline-flex max-w-[180px] items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{product.proveedor.nombre}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      hiddenMobile: true,
      render: (product) => (
        <div className="flex flex-col gap-1">
          {product.featured && (
            <span className="rounded-full bg-accent/30 px-2.5 py-1 text-xs font-medium text-accent-foreground">Destacado</span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${product.is_available ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
            {product.is_available ? 'Visible' : 'Oculto'}
          </span>
        </div>
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

  const isWeightEditing = editing?.pricing_type === 'weight'

  return (
    <div className="grid gap-6">
      <DataTable
        data={products}
        columns={columns}
        rowKey={(p) => p.id}
        searchKeys={(p) =>
          `${p.name} ${p.slug} ${p.description ?? ''} ${(p.categories ?? []).map((c) => c.name).join(' ')} ${p.marca?.nombre ?? ''} ${p.proveedor?.nombre ?? ''} ${p.sku ?? ''}`
        }
        searchPlaceholder="Buscar productos…"
        emptyMessage="No se encontraron productos"
        noDataMessage="Aún no hay productos"
        loading={refreshing}
        onFilteredChange={setFilteredProducts}
        toolbar={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setBulkOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              <FileSpreadsheet size={15} /> Carga masiva
            </button>
            <button
              onClick={exportProducts}
              disabled={exporting || refreshing}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            >
              {exporting ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Download size={15} />
              )}
              Exportar Excel
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

            {/* Tipo de precio: selector moderno peso/unidad */}
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="mb-2 text-sm font-medium">¿Cómo se vende este producto?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateField('pricing_type', 'unit')}
                  className={`rounded-xl border p-4 text-left transition ${
                    !isWeightEditing
                      ? 'border-brand bg-brand/10'
                      : 'border-border bg-background hover:border-brand/50'
                  }`}
                >
                  <p className="text-sm font-semibold">📦 Por unidad</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Se cobra por pieza (u, caja, metro…)
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => updateField('pricing_type', 'weight')}
                  className={`rounded-xl border p-4 text-left transition ${
                    isWeightEditing
                      ? 'border-brand bg-brand/10'
                      : 'border-border bg-background hover:border-brand/50'
                  }`}
                >
                  <p className="text-sm font-semibold">⚖️ Por peso</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Se cobra por gramos o kilos
                  </p>
                </button>
              </div>
            </div>

            {/* Precio y stock según el tipo */}
            {isWeightEditing ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormInput
                  label="Precio por kg USD"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={editing.price_per_kilo_usd ?? 0}
                  onChange={(e) => {
                    const kilo = Number(e.target.value)
                    updateField('price_per_kilo_usd', kilo)
                    if (kilo > 0) updateField('price_per_gram_usd', kilo / 1000)
                  }}
                  hint="El precio por gramo se calcula automáticamente."
                />
                <FormInput
                  label="Precio por g USD (derivado)"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={editing.price_per_gram_usd ?? 0}
                  onChange={(e) => updateField('price_per_gram_usd', Number(e.target.value))}
                />
                <FormInput
                  label="Stock disponible (gramos)"
                  type="number"
                  min="0"
                  step="1"
                  value={editing.stock_grams ?? 0}
                  onChange={(e) => updateField('stock_grams', Number(e.target.value))}
                />
                <FormInput
                  label="Peso mínimo de compra (gramos)"
                  type="number"
                  min="0"
                  step="1"
                  value={editing.min_order_grams ?? 0}
                  onChange={(e) => updateField('min_order_grams', Number(e.target.value))}
                  hint="Ej: 100 = mínimo 100 g por pedido."
                />
                <FormInput
                  label="Costo inicial USD"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editing.costo_inicial ?? 0}
                  onChange={(e) => updateField('costo_inicial', Number(e.target.value))}
                />
                <label className="grid gap-2 text-sm">
                  <span className="font-medium">Unidad de venta</span>
                  <select
                    value={editing.unit_label ?? 'g'}
                    onChange={(e) => updateField('unit_label', e.target.value)}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
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
                <label className="grid gap-2 text-sm">
                  <span className="font-medium">Unidad de venta</span>
                  <select
                    value={editing.unit_label ?? 'u'}
                    onChange={(e) => updateField('unit_label', e.target.value)}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </label>
                <FormInput
                  label="Stock bajo umbral"
                  type="number"
                  min="0"
                  step="1"
                  value={editing.low_stock_threshold ?? 10}
                  onChange={(e) => updateField('low_stock_threshold', Number(e.target.value))}
                  hint="Alerta cuando el stock baje de este valor."
                />
                <FormInput
                  label="Peso por unidad (gramos)"
                  type="number"
                  min="0"
                  step="1"
                  value={editing.weight_grams ?? ''}
                  onChange={(e) => updateField('weight_grams', e.target.value === '' ? undefined : Number(e.target.value))}
                  hint="Opcional. Se muestra en la ficha técnica."
                />
              </div>
            )}

            {/* Peso y Tamaño (opcionales, ficha técnica) */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput
                label="Peso (ficha técnica)"
                value={editing.peso ?? ''}
                onChange={(e) => updateField('peso', e.target.value)}
                placeholder="Ej: 0.8 kg"
                hint="Opcional. Se muestra en el catálogo solo si se completa."
              />
              <FormInput
                label="Tamaño"
                value={editing.tamaño ?? ''}
                onChange={(e) => updateField('tamaño', e.target.value)}
                placeholder="Ej: 50 x 50 cm"
                hint="Opcional. Se muestra en el catálogo solo si se completa."
              />
            </div>

            {/* SKU y código de barras */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput
                label="SKU"
                value={editing.sku ?? ''}
                onChange={(e) => updateField('sku', e.target.value)}
                placeholder="Ej: LED-PNL-24W"
                hint="Código interno de inventario."
              />
              <FormInput
                label="Código de barras"
                value={editing.bar_code ?? ''}
                onChange={(e) => updateField('bar_code', e.target.value)}
                placeholder="Ej: 7501234567890"
                hint="EAN/UPC (opcional)."
              />
            </div>

            {/* Mayoreo y orden */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput
                label="Descuento mayoreo (%)"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={editing.bulk_discount_percent ?? 0}
                onChange={(e) => updateField('bulk_discount_percent', Number(e.target.value))}
                hint="Se muestra como incentivo en el catálogo."
              />
              <FormInput
                label="Orden en catálogo"
                type="number"
                min="0"
                step="1"
                value={editing.sort_order ?? 0}
                onChange={(e) => updateField('sort_order', Number(e.target.value))}
                hint="Menor = aparece primero."
              />
            </div>

            {/* Colores (variantes con imagen opcional) */}
            <div className="rounded-2xl border border-dashed border-border p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Colores</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Opcional. Cada color puede tener su propia imagen y se mostrará en el catálogo.
                  </p>
                </div>
                <button
                  onClick={addColor}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted"
                >
                  <Plus size={13} /> Agregar color
                </button>
              </div>

              {(editing.colors ?? []).length === 0 ? (
                <p className="rounded-xl bg-muted/50 px-4 py-6 text-center text-xs text-muted-foreground">
                  No hay colores agregados. Si el producto tiene variantes de color, agrégalas aquí.
                </p>
              ) : (
                <div className="grid gap-3">
                  {(editing.colors ?? []).map((color, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                      {/* Thumbnail del color */}
                      {color.image ? (
                        <img src={color.image} alt={color.name || `Color ${i + 1}`} className="size-12 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <ImagePlus size={15} />
                        </div>
                      )}

                      {/* Nombre del color */}
                      <input
                        value={color.name}
                        onChange={(e) => updateColorName(i, e.target.value)}
                        placeholder={`Color ${i + 1} (ej: Blanco, Negro…)`}
                        className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
                      />

                      {/* Imagen del color */}
                      <ImagePickerButton
                        onPick={(file) => uploadColorImage(i, file)}
                        disabled={uploadingColorIndex === i}
                        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                      >
                        {uploadingColorIndex === i ? (
                          <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                        ) : (
                          <Upload size={13} />
                        )}
                        {uploadingColorIndex === i ? 'Cargando…' : color.image ? 'Cambiar' : 'Imagen'}
                      </ImagePickerButton>

                      {/* Quitar color */}
                      <button
                        onClick={() => removeColor(i)}
                        aria-label={`Quitar color ${color.name || i + 1}`}
                        className="grid size-9 shrink-0 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Categorías con buscador */}
            <div className="grid gap-2 text-sm">
              <span className="font-medium">
                Categorías <span className="font-normal text-muted-foreground">(selecciona una o varias)</span>
              </span>
              <SearchableMultiSelect
                values={editing.category_ids ?? []}
                onChange={(ids) => updateField('category_ids', ids)}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Selecciona categorías…"
                searchPlaceholder="Buscar categoría…"
                emptyText="Sin categorías que coincidan"
              />
            </div>

            {/* Marca y Proveedor con buscador */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 text-sm">
                <span className="font-medium">Marca</span>
                <SearchableSelect
                  value={editing.marca_id ?? ''}
                  onChange={(value) => updateField('marca_id', value)}
                  options={marcaOptions}
                  placeholder="Seleccionar marca…"
                  searchPlaceholder="Buscar marca…"
                  emptyText="Sin marcas que coincidan"
                />
              </div>
              <div className="grid gap-2 text-sm">
                <span className="font-medium">Proveedor</span>
                <SearchableSelect
                  value={editing.proveedor_id ?? ''}
                  onChange={(value) => updateField('proveedor_id', value)}
                  options={proveedorOptions}
                  placeholder="Seleccionar proveedor…"
                  searchPlaceholder="Buscar proveedor…"
                  emptyText="Sin proveedores que coincidan"
                />
              </div>
            </div>

            {/* Disponibilidad y destacado */}
            <div className="grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.is_available)}
                  onChange={(e) => updateField('is_available', e.target.checked)}
                  className="size-4 accent-primary"
                />
                <div>
                  <span className="font-medium">Visible en el catálogo</span>
                  <p className="text-xs text-muted-foreground">Si lo desactivas, el producto se oculta sin borrarse.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.featured)}
                  onChange={(e) => updateField('featured', e.target.checked)}
                  className="size-4 accent-primary"
                />
                <div>
                  <span className="font-medium">Mostrar como destacado</span>
                  <p className="text-xs text-muted-foreground">Aparece en la portada.</p>
                </div>
              </label>
            </div>

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
              <ImagePickerButton
                onPick={upload}
                disabled={uploading}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <Upload size={16} />
                {uploading ? 'Cargando…' : 'Cargar imagen'}
              </ImagePickerButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
