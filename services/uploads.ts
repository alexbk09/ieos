import { createClient as createServerClient } from '@/lib/supabase/server'
import { MAX_UPLOAD_SIZE_BYTES, PRODUCTS_BUCKET } from '@/lib/constants'

/**
 * Servicio de uploads (storage).
 * Capa única de acceso al storage de Supabase para imágenes de productos.
 */

/**
 * Sube una imagen de producto al bucket y devuelve su URL pública.
 * @param file Archivo de imagen a subir.
 * @returns La URL pública de la imagen, o un error controlado.
 */
export async function uploadProductImage(file: File) {
  const supabase = await createServerClient()

  // Validación de tipo MIME: solo imágenes.
  if (!file.type.startsWith('image/')) {
    return { error: 'Selecciona una imagen válida' }
  }

  // Validación de tamaño máximo.
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return { error: 'La imagen no puede superar 5 MB' }
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `products/${crypto.randomUUID()}.${extension}`

  const { error } = await supabase.storage.from(PRODUCTS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) return { error: 'Configura el bucket productos-bucket en Supabase' }

  const { data } = supabase.storage.from(PRODUCTS_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}