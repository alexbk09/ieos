import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createProductsBulk } from '@/services/catalog'

/**
 * API: Carga masiva de productos desde Excel.
 * Recibe un arreglo de productos ya parseados (nombres de marca/proveedor/categoría
 * incluidos). La lógica de resolución/creación automática vive en /services/catalog.
 */
export async function POST(request: Request) {
  await requireAdmin()

  const body = await request.json()
  const items = Array.isArray(body.items) ? body.items : []

  if (items.length === 0) {
    return NextResponse.json({ error: 'El archivo no contiene productos válidos.' }, { status: 400 })
  }
  if (items.length > 500) {
    return NextResponse.json({ error: 'Máximo 500 productos por carga.' }, { status: 400 })
  }

  // Normalizar y validar cada item
  const normalized = items.map((item: any, index: number) => {
    const name = String(item.name ?? '').trim()
    const slug = String(item.slug ?? '').trim()

    const pricing_type = (item.pricing_type === 'weight' ? 'weight' : 'unit') as 'unit' | 'weight'

    return {
      name,
      slug,
      description: item.description || null,
      price_usd: Number(item.price_usd ?? 0),
      stock: Math.max(0, Math.floor(Number(item.stock ?? 0))),
      costo_inicial: Number(item.costo_inicial ?? 0),
      image_url: item.image_url || null,
      // Nombres desde el Excel: se resuelven o crean en el servicio
      marca_nombre: item.marca_nombre ?? null,
      proveedor_nombre: item.proveedor_nombre ?? null,
      categoria_nombre: item.categoria_nombre ?? null,
      categoria_dos_nombre: item.categoria_dos_nombre ?? null,
      // IDs ya resueltos (si el front ya los mandó)
      marca_id: item.marca_id || null,
      proveedor_id: item.proveedor_id || null,
      featured: Boolean(item.featured),
      category_ids: Array.isArray(item.category_ids) ? item.category_ids.filter(Boolean) : [],
      images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
      // Nuevos campos: precio por peso, unidad, stock gramos, sku, etc.
      pricing_type,
      price_per_kilo_usd: Number(item.price_per_kilo_usd ?? 0),
      price_per_gram_usd: Number(item.price_per_gram_usd ?? 0),
      stock_grams: Number(item.stock_grams ?? 0),
      min_order_grams: Number(item.min_order_grams ?? 0),
      unit_label: item.unit_label || null,
      is_available: item.is_available !== undefined ? Boolean(item.is_available) : true,
      low_stock_threshold: Number(item.low_stock_threshold ?? 10),
      sku: item.sku || null,
      bar_code: item.bar_code || null,
      bulk_discount_percent: Number(item.bulk_discount_percent ?? 0),
      sort_order: Number(item.sort_order ?? 0),
      weight_grams: item.weight_grams != null ? Number(item.weight_grams) : null,
      _row: index + 2, // fila en Excel (1 = encabezado)
    }
  })

  // Validar campos obligatorios antes de insertar
  const invalidRows: { row: number; error: string }[] = []
  normalized.forEach((item: any) => {
    if (!item.name) invalidRows.push({ row: item._row, error: 'Falta el nombre del producto.' })
    if (!item.slug) invalidRows.push({ row: item._row, error: 'Falta el slug.' })
    if (!Number.isFinite(item.price_usd) || item.price_usd < 0) {
      invalidRows.push({ row: item._row, error: 'El precio debe ser un número válido mayor o igual a 0.' })
    }
  })

  if (invalidRows.length > 0) {
    return NextResponse.json({ error: 'Hay filas con datos inválidos.', invalidRows }, { status: 400 })
  }

  const result = await createProductsBulk(normalized)
  if (result.errors && result.errors.length > 0) {
    return NextResponse.json(
      { error: 'Algunos productos no se pudieron crear.', errors: result.errors, created: result.products.length },
      { status: 207 },
    )
  }

  return NextResponse.json({ created: result.products.length, products: result.products })
}