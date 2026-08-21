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