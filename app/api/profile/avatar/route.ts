import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { uploadAvatarImage } from '@/services/uploads'

/**
 * API: Subir un avatar de usuario al bucket de Supabase.
 * La lógica de validación y storage vive en /services/uploads.
 */
export async function POST(request: Request) {
  await requireUser()
  const form = await request.formData()
  const file = form.get('file')

  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Selecciona una imagen válida' }, { status: 400 })
  }

  const result = await uploadAvatarImage(file)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ url: result.url })
}