import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createProductsBulk } from '@/services/catalog'

/**
 * API: Carga masiva de productos desde Excel.
 * Recibe un arreglo de productos validados y los crea uno a uno
 * para mantener las relaciones N:N con categorías e imágenes.
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
    const categoryIds = Array.isArray(item.category_ids) ? item.category_ids.filter(Boolean) : []

    return {
      name,
      slug,
      description: item.description || null,
      price_usd: Number(item.price_usd ?? 0),
      stock: Math.max(0, Math.floor(Number(item.stock ?? 0))),
      image_url: item.image_url || null,
      featured: Boolean(item.featured),
      category_ids: categoryIds,
      images: Array.isArray(item.images) ? item.images.filter(Boolean) : [],
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
    if (item.category_ids.length === 0) {
      invalidRows.push({ row: item._row, error: 'Falta la categoría.' })
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