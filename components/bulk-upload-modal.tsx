'use client'

import { useCallback, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileSpreadsheet, LoaderCircle, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { FormSubmitButton } from '@/components/ui/form-field'

type Category = { id: string; name: string; slug: string }
type Marca = { id: string; nombre: string }
type Proveedor = { id: string; nombre: string }

/** Fila parseada del Excel lista para enviar a la API. */
type BulkProduct = {
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  costo_inicial: number
  image_url: string | null
  marca_nombre?: string | null
  proveedor_nombre?: string | null
  categoria_nombre?: string | null
  categoria_dos_nombre?: string | null
  marca_id?: string | null
  proveedor_id?: string | null
  featured: boolean
  category_ids: string[]
  // Nuevos campos de peso/unidad/robustez
  pricing_type?: 'unit' | 'weight'
  price_per_kilo_usd?: number
  price_per_gram_usd?: number
  stock_grams?: number
  min_order_grams?: number
  unit_label?: string
  is_available?: boolean
  low_stock_threshold?: number
  sku?: string | null
  bar_code?: string | null
  bulk_discount_percent?: number
  sort_order?: number
  weight_grams?: number | null
}

/** Producto retornado por la API con todos sus datos. */
type ImportedProduct = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  stock: number
  image_url: string | null
  featured: boolean
  categories?: { id: string; name: string; slug: string }[]
}

/** Resultado de una fila procesada del Excel. */
type ParseRow = {
  row: number
  name: string
  slug: string
  price: number
  costo: number
  stock: number
  category: string
  category2: string
  marca: string
  proveedor: string
  featured: boolean
  pricing_type: 'unit' | 'weight'
  price_per_kg: number
  stock_grams: number
  min_grams: number
  unit_label: string
  available: boolean
  sku: string
  bar_code: string
  bulk_pct: number
  sort_order: number
  weight_grams: string
  validated: boolean
  error?: string
}

/**
 * Genera y descarga la plantilla Excel guía con los nuevos campos.
 * Columnas: nombre, slug, descripcion, precio_usd, stock, categoria,
 *           featured, image_url, marca, proveedor, costo_inicial,
 *           categoria_dos, pricing_type, price_per_kg_usd, stock_grams,
 *           min_grams, unit_label, disponible, umbral_stock, sku,
 *           codigo_barra, mayoreo_pct, orden, peso_unitario_g
 */
function downloadTemplate() {
  const template = [
    {
      nombre: 'Lámpara LED de escritorio',
      slug: 'lampara-led-escritorio',
      descripcion: 'Lámpara moderna con luz regulable y puerto USB.',
      precio_usd: 25.99,
      stock: 15,
      categoria: 'Iluminación',
      featured: 'SI',
      image_url: 'https://ejemplo.com/imagen.jpg',
      marca: 'Philips',
      proveedor: 'Distribuidora Eléctrica C.A.',
      costo_inicial: 12.5,
      categoria_dos: 'Electrodomésticos',
      pricing_type: 'unidad',
      price_per_kg_usd: '',
      stock_grams: '',
      min_grams: '',
      unit_label: 'u',
      disponible: 'SI',
      umbral_stock: 10,
      sku: 'LED-PNL-24W',
      codigo_barra: '',
      mayoreo_pct: 0,
      orden: 1,
      peso_unitario_g: 800,
    },
    {
      nombre: 'Granos de café artesanal',
      slug: 'granos-cafe-artesanal',
      descripcion: 'Café de altura, molido o en grano. Se vende por peso.',
      precio_usd: 12,
      stock: 0,
      categoria: 'Alimentos',
      featured: 'NO',
      image_url: '',
      marca: 'Café Montaña',
      proveedor: 'Tostaduría Andes',
      costo_inicial: 6,
      categoria_dos: '',
      pricing_type: 'peso',
      price_per_kg_usd: 12,
      stock_grams: 50000,
      min_grams: 500,
      unit_label: 'g',
      disponible: 'SI',
      umbral_stock: 5000,
      sku: 'CAFE-ART-1KG',
      codigo_barra: '7501234567890',
      mayoreo_pct: 10,
      orden: 2,
      peso_unitario_g: '',
    },
  ]
  const worksheet = XLSX.utils.json_to_sheet(template)

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos')

  const instructions = [
    { Instrucción: 'Complete el archivo siguiendo el orden de las columnas.' },
    { Instrucción: '"nombre" es el único campo obligatorio. Los demás pueden dejarse vacíos.' },
    { Instrucción: '"slug" es usado en la URL del catálogo. Ej: lampara-led-escritorio.' },
    { Instrucción: '"precio_usd" debe ser un número (ej: 25.99). Si se deja vacío, se usa 0.' },
    { Instrucción: '"stock" debe ser un número entero (ej: 15). Si se deja vacío, se usa 0.' },
    { Instrucción: '"categoria" se crea automáticamente si no existe. Debe coincidir con el nombre exacto.' },
    { Instrucción: '"featured" acepta SI/NO o TRUE/FALSE para mostrar el producto en la portada.' },
    { Instrucción: '"image_url" es una URL de imagen pública. Puede dejarse vacío.' },
    { Instrucción: '"marca" se crea automáticamente si no existe.' },
    { Instrucción: '"proveedor" se crea automáticamente si no existe.' },
    { Instrucción: '"costo_inicial" es el costo del producto (opcional, se usa 0 si se deja vacío).' },
    { Instrucción: '"categoria_dos" es una segunda categoría opcional. Se crea si no existe.' },
    { Instrucción: '"pricing_type" acepta "peso" (se vende por gramos/kilos) o "unidad" (normal). Si se deja vacío, se usa "unidad".' },
    { Instrucción: '"price_per_kg_usd" es el precio por KILOGRAMO cuando pricing_type = peso. Ej: 12 = $12/kg.' },
    { Instrucción: '"stock_grams" es el inventario en gramos cuando pricing_type = peso. Ej: 50000 = 50 kg disponibles.' },
    { Instrucción: '"min_grams" es el peso mínimo de compra en gramos cuando pricing_type = peso. Ej: 500 = mínimo 500 g.' },
    { Instrucción: '"unit_label" es la unidad de venta: u, g, kg, m, cm, pkg, box. Default: u.' },
    { Instrucción: '"disponible" acepta SI/NO para ocultar el producto del catálogo sin borrarlo. Default: SI.' },
    { Instrucción: '"umbral_stock" es el límite para la alerta de stock bajo. Default: 10.' },
    { Instrucción: '"sku" es el código interno de inventario. Opcional.' },
    { Instrucción: '"codigo_barra" es el EAN/UPC. Opcional.' },
    { Instrucción: '"mayoreo_pct" es el descuento por compra al mayor (0-100) que se muestra como incentivo. Default: 0.' },
    { Instrucción: '"orden" es la posición en el catálogo (menor = primero). Default: 0.' },
    { Instrucción: '"peso_unitario_g" es el peso en gramos de una unidad para la ficha técnica. Opcional.' },
  ]
  const instructionsSheet = XLSX.utils.json_to_sheet(instructions)
  instructionsSheet['!cols'] = [{ wch: 130 }]
  XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instrucciones')

  XLSX.writeFile(workbook, 'plantilla-productos.xlsx')
}

/**
 * Modal de carga masiva de productos desde Excel.
 * Permite descargar la plantilla guía, cargar un archivo,
 * validar los datos y enviarlos a la API.
 */
export function BulkUploadModal({
  open,
  onClose,
  categories,
  marcas,
  proveedores,
  onImported,
}: {
  open: boolean
  onClose: () => void
  categories: Category[]
  marcas: Marca[]
  proveedores: Proveedor[]
  onImported: (products: ImportedProduct[]) => void
}) {
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<ParseRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [importErrors, setImportErrors] = useState<{ row: number; error: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Convierte un valor del Excel a texto limpio. */
  const cleanCell = (value: unknown) => String(value ?? '').trim()

  /** Convertir SI/TRUE/1 a true, el resto a false. */
  const parseFeatured = (value: unknown) => {
    const text = cleanCell(value).toUpperCase()
    return text === 'SI' || text === 'TRUE' || text === '1' || text === 'SÍ'
  }

  /** Convertir SI/TRUE/1 a true, NO/FALSE/vacío a false. */
  const parseAvailable = (value: unknown) => {
    const text = cleanCell(value).toUpperCase()
    if (!text) return true
    return text === 'SI' || text === 'TRUE' || text === '1' || text === 'SÍ'
  }

  /** Convierte un valor a número válido; si es inválido devuelve 0. */
  const parseNumber = (value: unknown) => {
    const num = Number(String(value).replace(/[^\d.-]/g, ''))
    return Number.isFinite(num) ? num : 0
  }

  /**
   * Lee el archivo Excel seleccionado, lo parsea a filas
   * y valida solo el nombre (el resto se crea/rellena en el server).
   */
  const handleFile = useCallback(
    async (file: File) => {
      if (!file) return
      // Validar extensión
      const validExtensions = ['.xlsx', '.xls', '.csv']
      const hasValidExtension = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext))
      if (!hasValidExtension) {
        toast.error('Formato no soportado', { description: 'Sube un archivo .xlsx, .xls o .csv.' })
        return
      }

      setParsing(true)
      try {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

        if (rawRows.length === 0) {
          toast.error('Archivo vacío', { description: 'La hoja principal del Excel no tiene datos.' })
          return
        }

        const parsed: ParseRow[] = rawRows.map((raw, index) => {
          const values = Object.values(raw)

          // Posiciones de columnas:
          // 0 nombre, 1 slug, 2 descripcion, 3 precio_usd, 4 stock, 5 categoria,
          // 6 featured, 7 image_url, 8 marca, 9 proveedor, 10 costo_inicial,
          // 11 categoria_dos, 12 pricing_type, 13 price_per_kg_usd, 14 stock_grams,
          // 15 min_grams, 16 unit_label, 17 disponible, 18 umbral_stock, 19 sku,
          // 20 codigo_barra, 21 mayoreo_pct, 22 orden, 23 peso_unitario_g
          const name = cleanCell(values[0] ?? '')

          // Genera un slug automáticamente si no viene en el Excel
          const autoSlug =
            name
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '') || `producto-${index + 1}`

          const pricingTypeRaw = cleanCell(values[12] ?? '').toUpperCase()
          const pricing_type: 'unit' | 'weight' = pricingTypeRaw === 'PESO' || pricingTypeRaw === 'WEIGHT' ? 'weight' : 'unit'

          const row: ParseRow = {
            row: index + 2,
            name: name || '(sin nombre)',
            slug: cleanCell(values[1] ?? '') || autoSlug,
            price: parseNumber(values[3]),
            costo: parseNumber(values[10]),
            stock: Math.max(0, Math.floor(parseNumber(values[4]))),
            category: cleanCell(values[5] ?? ''),
            category2: cleanCell(values[11] ?? ''),
            marca: cleanCell(values[8] ?? ''),
            proveedor: cleanCell(values[9] ?? ''),
            featured: parseFeatured(values[6]),
            pricing_type,
            price_per_kg: parseNumber(values[13]),
            stock_grams: parseNumber(values[14]),
            min_grams: parseNumber(values[15]),
            unit_label: cleanCell(values[16] ?? '') || (pricing_type === 'weight' ? 'g' : 'u'),
            available: parseAvailable(values[17]),
            sku: cleanCell(values[19] ?? ''),
            bar_code: cleanCell(values[20] ?? ''),
            bulk_pct: parseNumber(values[21]),
            sort_order: Math.max(0, Math.floor(parseNumber(values[22]))),
            weight_grams: cleanCell(values[23] ?? ''),
            validated: true,
          }

          // Solo el nombre es obligatorio; marca/proveedor/categoría se crean en el server
          if (!name) {
            row.error = 'Falta el nombre del producto.'
            row.validated = false
          }

          // Guardar datos extra para usarlos al enviar
          ;(row as any)._description = cleanCell(values[2] ?? '')
          ;(row as any)._imageUrl = cleanCell(values[7] ?? '')
          return row
        })

        setFileName(file.name)
        setRows(parsed)
        setImportedCount(0)
        setImportErrors([])
      } catch {
        toast.error('Error al leer el archivo', { description: 'Asegúrate de que sea un Excel válido.' })
      } finally {
        setParsing(false)
      }
    },
    [],
  )

  /** Envía los productos validados a la API. */
  async function importProducts() {
    const validRows = rows.filter((r) => r.validated)
    if (validRows.length === 0) {
      toast.error('No hay filas válidas', { description: 'Corrige los errores de validación e inténtalo de nuevo.' })
      return
    }

    const items: BulkProduct[] = validRows.map((row) => ({
      name: row.name,
      slug: row.slug,
      description: (row as any)._description || null,
      price_usd: row.price,
      stock: row.stock,
      costo_inicial: row.costo,
      image_url: (row as any)._imageUrl || null,
      marca_nombre: row.marca || null,
      proveedor_nombre: row.proveedor || null,
      categoria_nombre: row.category || null,
      categoria_dos_nombre: row.category2 || null,
      featured: row.featured,
      category_ids: [],
      // Nuevos campos
      pricing_type: row.pricing_type,
      price_per_kilo_usd: row.pricing_type === 'weight' ? row.price_per_kg : 0,
      stock_grams: row.pricing_type === 'weight' ? row.stock_grams : 0,
      min_order_grams: row.pricing_type === 'weight' ? row.min_grams : 0,
      unit_label: row.unit_label,
      is_available: row.available,
      low_stock_threshold: row.sku ? (row.stock < 10 ? 10 : 10) : 10,
      sku: row.sku || null,
      bar_code: row.bar_code || null,
      bulk_discount_percent: row.bulk_pct,
      sort_order: row.sort_order,
      weight_grams: row.weight_grams ? parseNumber(row.weight_grams) : null,
    }))

    setImporting(true)
    try {
      const response = await fetch('/api/admin/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const result = await response.json()

      if (!response.ok && response.status !== 207) {
        const invalid = result.invalidRows ?? []
        if (invalid.length > 0) setImportErrors(invalid)
        toast.error('No se pudieron importar los productos', { description: result.error })
        return
      }

      const created = result.created ?? result.products?.length ?? 0
      setImportedCount(created)

      if (result.errors && result.errors.length > 0) {
        setImportErrors(result.errors)
        toast.warning('Importación parcial', {
          description: `Se crearon ${created} productos, pero ${result.errors.length} filas fallaron.`,
        })
      } else {
        toast.success('Importación completada', { description: `Se crearon ${created} productos correctamente.` })
      }

      if (created > 0) onImported(result.products ?? [])
    } catch {
      toast.error('Error de conexión', { description: 'No se pudo contactar el servidor.' })
    } finally {
      setImporting(false)
    }
  }

  /** Reinicia el modal al cerrarlo. */
  function resetAndClose() {
    setFileName(null)
    setRows([])
    setParsing(false)
    setImportedCount(0)
    setImportErrors([])
    if (fileInputRef.current) fileInputRef.current.value = ''
    onClose()
  }

  const validCount = rows.filter((r) => r.validated).length
  const invalidCount = rows.length - validCount

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      size="xl"
      title="Carga masiva de productos"
      description="Sube un archivo Excel con tus productos y se crearán automáticamente."
      icon={<FileSpreadsheet size={18} />}
      preventBackdropClose={importing || parsing}
      footer={
        <>
          <button
            onClick={resetAndClose}
            disabled={importing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            Cerrar
          </button>
          <FormSubmitButton loading={importing} onClick={importProducts} disabled={validCount === 0} loadingText="Importando…">
            Importar {validCount > 0 ? `${validCount} producto${validCount !== 1 ? 's' : ''}` : ''}
          </FormSubmitButton>
        </>
      }
    >
      <div className="grid gap-5">
        {/* Paso 1: Descargar plantilla */}
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium">Paso 1: Descarga la plantilla guía</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Contiene el orden correcto de columnas (incluye precio por peso, unidad, SKU, mayoreo) y una segunda hoja con instrucciones.
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Download size={15} />
              Descargar plantilla
            </button>
          </div>
        </div>

        {/* Paso 2: Subir archivo */}
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium">Paso 2: Carga tu archivo Excel</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Formatos aceptados: <span className="font-mono">.xlsx</span>, <span className="font-mono">.xls</span>, <span className="font-mono">.csv</span>
          </p>

          {parsing ? (
            <div className="mt-3 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-background px-4 py-8 text-center">
              <LoaderCircle size={24} className="animate-spin text-brand-strong" />
              <span className="text-sm font-medium">Leyendo archivo…</span>
              <span className="text-xs text-muted-foreground">Esto puede tardar unos segundos en archivos grandes.</span>
            </div>
          ) : !fileName ? (
            <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50">
              <Upload size={24} className="text-muted-foreground" />
              <span className="text-sm font-medium">Haz clic para seleccionar el Excel</span>
              <span className="text-xs text-muted-foreground">Arrastra y suelta también es soportado</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </label>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet size={20} className="shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {rows.length} fila{rows.length !== 1 ? 's' : ''} leída{rows.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted"
                >
                  Cambiar archivo
                </button>
                <button
                  onClick={() => {
                    setFileName(null)
                    setRows([])
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  aria-label="Quitar archivo"
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Nota sobre creación automática */}
        {fileName && (
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-xs text-muted-foreground">
            Las columnas <span className="font-mono text-cyan-700">categoria</span>,{' '}
            <span className="font-mono text-cyan-700">categoria_dos</span>,{' '}
            <span className="font-mono text-cyan-700">marca</span> y{' '}
            <span className="font-mono text-cyan-700">proveedor</span> se crean automáticamente si no existen. Solo el
            nombre del producto es obligatorio. Usa <span className="font-mono text-cyan-700">pricing_type = peso</span> para
            productos que se venden por gramos/kilos (con price_per_kg_usd, stock_grams y min_grams).
          </div>
        )}

        {/* Vista previa de filas */}
        {rows.length > 0 && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Vista previa
                {validCount > 0 && <span className="ml-2 text-xs font-normal text-emerald-600">{validCount} válidas</span>}
                {invalidCount > 0 && <span className="ml-2 text-xs font-normal text-destructive">{invalidCount} con errores</span>}
              </p>
            </div>

            <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted/90 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Fila</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Nombre</th>
                    <th className="hidden px-3 py-2 text-xs font-medium text-muted-foreground sm:table-cell">Slug</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Precio</th>
                    <th className="hidden px-3 py-2 text-xs font-medium text-muted-foreground sm:table-cell">Tipo</th>
                    <th className="hidden px-3 py-2 text-xs font-medium text-muted-foreground sm:table-cell">Stock</th>
                    <th className="hidden px-3 py-2 text-xs font-medium text-muted-foreground sm:table-cell">Categorías</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.row} className={row.validated ? '' : 'bg-destructive/5'}>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.row}</td>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground sm:table-cell">/{row.slug}</td>
                      <td className="px-3 py-2">
                        {row.pricing_type === 'weight'
                          ? `$${row.price_per_kg.toFixed(2)}/kg`
                          : `$${row.price.toFixed(2)}`}
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${row.pricing_type === 'weight' ? 'bg-cyan-500/10 text-cyan-600' : 'bg-muted text-muted-foreground'}`}>
                          {row.pricing_type === 'weight' ? '⚖ peso' : 'unidad'}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell">
                        {row.pricing_type === 'weight' ? `${row.stock_grams.toLocaleString('es-VE')} g` : row.stock}
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell">
                        {[row.category, row.category2].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {row.validated ? (
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">Válida</span>
                        ) : (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                            {row.error ?? 'Inválida'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Resultado de importación */}
        {importedCount > 0 && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-sm font-medium text-emerald-700">✓ {importedCount} producto{importedCount !== 1 ? 's' : ''} importado{importedCount !== 1 ? 's' : ''} correctamente</p>
            <p className="mt-0.5 text-xs text-emerald-700/70">Los productos ya aparecen en el catálogo.</p>
          </div>
        )}

        {/* Errores de importación */}
        {importErrors.length > 0 && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">Errores durante la importación</p>
            <ul className="mt-2 grid gap-1.5">
              {importErrors.slice(0, 10).map((err, i) => (
                <li key={i} className="text-xs text-destructive/80">
                  <span className="font-mono font-medium">Fila {err.row}:</span> {err.error}
                </li>
              ))}
              {importErrors.length > 10 && (
                <li className="text-xs text-muted-foreground">…y {importErrors.length - 10} errores más</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}