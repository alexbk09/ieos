import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createCategory, deleteCategory, getCategories, updateCategory } from '@/services/catalog'

/**
 * API: Obtener todas las categorías (vista admin).
 * Se usa para refrescar la tabla después de cada mutación (crear/editar/eliminar).
 */
export async function GET() {
  await requireAdmin()
  const { data: categories } = await getCategories()
  return NextResponse.json({ categories })
}

/**
 * API: Crear una nueva categoría.
 * Toda la lógica de datos vive en /services/catalog.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const body = await request.json()

  const result = await createCategory({
    name: String(body.name ?? '').trim(),
    slug: String(body.slug ?? '').trim(),
    description: body.description ?? null,
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ category: result.data })
}

/**
 * API: Actualizar una categoría existente.
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const body = await request.json()

  const result = await updateCategory(body.id, {
    name: body.name,
    slug: body.slug,
    description: body.description ?? null,
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ category: result.data })
}

/**
 * API: Eliminar una categoría.
 */
export async function DELETE(request: Request) {
  await requireAdmin()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await deleteCategory(id)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}