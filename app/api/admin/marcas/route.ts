import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createMarca, deleteMarca, getMarcas, updateMarca } from '@/services/marcas'

/**
 * API: Obtener todas las marcas (vista admin).
 * Se usa para refrescar la tabla después de cada mutación (crear/editar/eliminar).
 */
export async function GET() {
  await requireAdmin()
  const { data: marcas } = await getMarcas()
  return NextResponse.json({ marcas })
}

/**
 * API: Crear una nueva marca.
 * Toda la lógica de datos vive en /services/marcas.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const body = await request.json()

  const result = await createMarca({
    nombre: String(body.nombre ?? '').trim(),
    activa: body.activa !== false,
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ marca: result.data })
}

/**
 * API: Actualizar una marca existente (también alterna activa/inactiva).
 */
export async function PATCH(request: Request) {
  await requireAdmin()
  const body = await request.json()
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await updateMarca(id, {
    nombre: String(body.nombre ?? '').trim(),
    activa: body.activa !== false,
  })
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ marca: result.data })
}

/**
 * API: Eliminar una marca.
 */
export async function DELETE(request: Request) {
  await requireAdmin()
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const result = await deleteMarca(id)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}