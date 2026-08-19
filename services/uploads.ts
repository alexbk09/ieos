import { createClient as createServerClient } from '@/lib/supabase/server'
import { AVATAR_IMAGE_MAX_WIDTH, AVATAR_MAX_UPLOAD_SIZE_BYTES, AVATARS_BUCKET, IMAGE_MAX_WIDTH, MAX_UPLOAD_SIZE_BYTES, PRODUCTS_BUCKET, WEBP_QUALITY } from '@/lib/constants'
import sharp from 'sharp'

/**
 * Servicio de uploads (storage).
 * Capa única de acceso al storage de Supabase para imágenes.
 * Todas las imágenes (productos, portada, avatares, settings) pasan por aquí
 * y se procesan automáticamente: conversión a WebP + redimensionamiento.
 */

/**
 * Convierte un archivo de imagen a WebP optimizado.
 * Redimensiona al ancho máximo configurado (mantiene proporción) y comprime.
 * @param file Archivo de imagen original (jpg, png, gif, etc).
 * @param maxWidth Ancho máximo en píxeles (por defecto usa el de productos).
 * @returns Buffer con la imagen WebP procesada lista para subir.
 */
async function processImageToWebP(file: File, maxWidth = IMAGE_MAX_WIDTH): Promise<Buffer> {
  return sharp(Buffer.from(await file.arrayBuffer()))
    .rotate() // respeta la orientación EXIF de fotos tomadas con móvil
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()
}

/**
 * Sube una imagen al bucket y devuelve su URL pública.
 * Punto centralizado de guardado: recibir el archivo y siempre
 * lo almacena como WebP optimizado (no guarda el formato original).
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

  // Convertir siempre a WebP optimizado (redimensionado + comprimido).
  const webpBuffer = await processImageToWebP(file)
  const path = `products/${crypto.randomUUID()}.webp`

  const { error } = await supabase.storage.from(PRODUCTS_BUCKET).upload(path, webpBuffer, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (error) return { error: 'Configura el bucket productos-bucket en Supabase' }

  const { data } = supabase.storage.from(PRODUCTS_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}

/**
 * Sube un avatar de usuario al bucket y devuelve su URL pública.
 * Redimensiona a un máximo de 512px y comprime a WebP (ideal para avatares).
 * @param file Archivo de imagen del avatar.
 * @returns La URL pública del avatar, o un error controlado.
 */
export async function uploadAvatarImage(file: File) {
  const supabase = await createServerClient()

  // Validación de tipo MIME: solo imágenes.
  if (!file.type.startsWith('image/')) {
    return { error: 'Selecciona una imagen válida' }
  }

  // Validación de tamaño máximo específico para avatares.
  if (file.size > AVATAR_MAX_UPLOAD_SIZE_BYTES) {
    return { error: 'La imagen no puede superar 2 MB' }
  }

  // Convertir siempre a WebP optimizado (redimensionado a 512px + comprimido).
  const webpBuffer = await processImageToWebP(file, AVATAR_IMAGE_MAX_WIDTH)
  const path = `${crypto.randomUUID()}.webp`

  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(path, webpBuffer, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (error) return { error: 'Configura el bucket avatars-bucket en Supabase' }

  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}