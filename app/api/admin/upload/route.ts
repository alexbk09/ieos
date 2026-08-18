import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { uploadProductImage } from '@/services/uploads'

/**
 * API: Subir una imagen de producto al bucket de Supabase.
 * La lógica de validación y storage vive en /services/uploads.
 */
export async function POST(request: Request) {
  await requireAdmin()
  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Selecciona una imagen válida' }, { status: 400 })
  }

  const result = await uploadProductImage(file)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ url: result.url })
}