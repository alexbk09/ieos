import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createProduct, deleteProduct, getProductsWithCategories, updateProduct } from '@/services/catalog'

/**
 * API: Obtener todos los productos con categorías e imágenes (vista admin).
 * Se usa para refrescar la tabla completa después de cada mutación (crear/editar/eliminar/importar).
 */
export async function GET() {
  await requireAdmin()
  const { products, categories } = await getProductsWithCategories()
  return NextResponse.json({ products, categories })
}

/**
 * API: Crear un nuevo producto.
 * Toda la lógica de datos vive en /services/catalog.
 */
export async function POST(request: Request) {
  const { user } = await requireAdmin()
  const body = await request.json()

  const payload = {
    name: String(body.name ?? '').trim(),
    slug: String(body.slug ?? '').trim(),
    description: body.description ?? null,
    price_usd: Number(body.price_usd ?? 0),
    stock: Math.max(0, Number(body.stock ?? 0)),
    costo_inicial: Number(body.costo_inicial ?? 0),
    image_url: body.image_url || null,
    marca_id: body.marca_id || null,
    proveedor_id: body.proveedor_id || null,
    featured: Boolean(body.featured),
    category_ids: Array.isArray(body.category_ids) ? body.category_ids.filter(Boolean) : [],
    images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
    colorImages: Array.isArray(body.colorImages)
      ? body.colorImages
          .filter((img: any) => img?.url && img?.color_name)
          .map((img: any) => ({ url: String(img.url), color_name: String(img.color_name) }))
      : [],
    colors: Array.isArray(body.colors) ? body.colors.map(String).filter(Boolean) : [],
    peso: body.peso || null,
    tamaño: body.tamaño || null,
    pricing_type: (body.pricing_type === 'weight' ? 'weight' : 'unit') as 'unit' | 'weight',
    price_per_kilo_usd: Number(body.price_per_kilo_usd ?? 0),
    price_per_gram_usd: Number(body.price_per_gram_usd ?? 0),
    stock_grams: Number(body.stock_grams ?? 0),
    min_order_grams: Number(body.min_order_grams ?? 0),
    unit_label: body.unit_label || null,
    is_available: body.is_available !== undefined ? Boolean(body.is_available) : true,
    low_stock_threshold: Number(body.low_stock_threshold ?? 10),
    sku: body.sku || null,
    bar_code: body.bar_code || null,
    bulk_discount_percent: Number(body.bulk_discount_percent ?? 0),
    sort_order: Number(body.sort_order ?? 0),
    weight_grams: body.weight_grams != null ? Number(body.weight_grams) : null,
  }

  if (!payload.name || !payload.slug || !Number.isFinite(payload.price_usd)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }

  const result = await createProduct(payload)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ product: result.data })
}

/**
 * API: Actualizar un producto existente.
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const body = await request.json()
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await updateProduct(id, {
    name: body.name,
    slug: body.slug,
    description: body.description ?? null,
    price_usd: Number(body.price_usd),
    stock: Math.max(0, Number(body.stock)),
    costo_inicial: Number(body.costo_inicial ?? 0),
    image_url: body.image_url || null,
    marca_id: body.marca_id || null,
    proveedor_id: body.proveedor_id || null,
    featured: Boolean(body.featured),
    category_ids: Array.isArray(body.category_ids) ? body.category_ids.filter(Boolean) : [],
    images: Array.isArray(body.images) ? body.images.filter(Boolean) : [],
    colorImages: Array.isArray(body.colorImages)
      ? body.colorImages
          .filter((img: any) => img?.url && img?.color_name)
          .map((img: any) => ({ url: String(img.url), color_name: String(img.color_name) }))
      : [],
    colors: Array.isArray(body.colors) ? body.colors.map(String).filter(Boolean) : [],
    peso: body.peso || null,
    tamaño: body.tamaño || null,
    pricing_type: (body.pricing_type === 'weight' ? 'weight' : 'unit') as 'unit' | 'weight',
    price_per_kilo_usd: Number(body.price_per_kilo_usd ?? 0),
    price_per_gram_usd: Number(body.price_per_gram_usd ?? 0),
    stock_grams: Number(body.stock_grams ?? 0),
    min_order_grams: Number(body.min_order_grams ?? 0),
    unit_label: body.unit_label || null,
    is_available: body.is_available !== undefined ? Boolean(body.is_available) : true,
    low_stock_threshold: Number(body.low_stock_threshold ?? 10),
    sku: body.sku || null,
    bar_code: body.bar_code || null,
    bulk_discount_percent: Number(body.bulk_discount_percent ?? 0),
    sort_order: Number(body.sort_order ?? 0),
    weight_grams: body.weight_grams != null ? Number(body.weight_grams) : null,
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ product: result.data })
}

/**
 * API: Eliminar un producto.
 */
export async function DELETE(request: Request) {
  await requireAdmin()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await deleteProduct(id)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}