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
  const tipo = body.tipo === 'principal' ? 'principal' : 'subcategoria'
  const parentId = body.parent_id ? String(body.parent_id) : null
  if (tipo === 'subcategoria' && !parentId) {
    return NextResponse.json({ error: 'Selecciona el hobby principal de esta subcategoría.' }, { status: 400 })
  }

  const result = await createCategory({
    name: String(body.name ?? '').trim(),
    slug: String(body.slug ?? '').trim(),
    description: body.description ?? null,
    tipo,
    parent_id: parentId,
    activa: body.activa !== false,
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
  const parentId = body.parent_id ? String(body.parent_id) : null
  const { data: categories } = await getCategories()
  const current = (categories ?? []).find((category) => category.id === body.id)
  if (current && current.slug !== body.slug) {
    return NextResponse.json({ error: 'No se puede cambiar el slug de una categoría existente.' }, { status: 400 })
  }
  if (body.tipo === 'subcategoria' && !parentId) {
    if (current?.tipo === 'principal' || current?.parent_id) {
      return NextResponse.json({ error: 'Selecciona el hobby principal de esta subcategoría.' }, { status: 400 })
    }
  }

  const result = await updateCategory(body.id, {
    name: body.name,
    slug: body.slug,
    description: body.description ?? null,
    tipo: body.tipo === 'principal' ? 'principal' : 'subcategoria',
    parent_id: parentId,
    activa: body.activa !== false,
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