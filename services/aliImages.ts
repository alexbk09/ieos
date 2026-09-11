import { createClient as createServerClient } from '@/lib/supabase/server'
import { IMAGE_MAX_WIDTH, PRODUCTS_BUCKET, WEBP_QUALITY } from '@/lib/constants'
import sharp from 'sharp'

/**
 * Servicio de espejado de imágenes externas (Fase 2.4).
 * ------------------------------------------------------------------
 * Responsabilidad exclusiva: descargar una imagen alojada en un CDN ajeno
 * (AliExpress) y subirla OPTIMIZADA a nuestro propio storage, devolviendo su
 * URL pública local.
 *
 * POR QUÉ existe:
 *  - Google solo admite imágenes de otro dominio en el sitemap si ese dominio
 *    está verificado; al espejar, las fotos pasan a ser del dominio propio y
 *    el `<image:loc>` del sitemap (y el schema) funcionan.
 *
 * Reglas de oro:
 *  - Capa de abstracción pura: NO toca React.
 *  - Contrato estable { url } | { error } (best-effort, nunca lanza).
 */

/** Resultado del espejado de una imagen. */
export type ResultadoEspejado = { url?: string; error?: string }

/**
 * Descarga una imagen externa, la convierte a WebP optimizado y la sube al
 * bucket de productos. Si algo falla, devuelve { error } para que el llamador
 * conserve la URL original (no se pierde la imagen por un fallo de red).
 */
export async function espejarImagenExterna(
  urlExterna: string,
  opciones: { maxWidth?: number } = {},
): Promise<ResultadoEspejado> {
  try {
    if (!/^https?:\/\//i.test(urlExterna)) return { error: 'URL de imagen inválida.' }

    const respuesta = await fetch(urlExterna, {
      headers: { accept: 'image/*' },
      cache: 'no-store',
    })
    if (!respuesta.ok) return { error: `No se pudo descargar la imagen (HTTP ${respuesta.status}).` }

    const contentType = respuesta.headers.get('content-type') ?? ''
    if (contentType && !contentType.startsWith('image/')) {
      return { error: 'El recurso descargado no es una imagen.' }
    }

    const buffer = Buffer.from(await respuesta.arrayBuffer())
    const webp = await sharp(buffer)
      .rotate()
      .resize({ width: opciones.maxWidth ?? IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    const supabase = await createServerClient()
    const path = `products/${crypto.randomUUID()}.webp`
    const { error } = await supabase.storage.from(PRODUCTS_BUCKET).upload(path, webp, {
      contentType: 'image/webp',
      upsert: false,
    })
    if (error) return { error: 'Configura el bucket productos-bucket en Supabase.' }

    const { data } = supabase.storage.from(PRODUCTS_BUCKET).getPublicUrl(path)
    return { url: data.publicUrl }
  } catch (err: any) {
    return { error: err?.message ?? 'Error espejando la imagen.' }
  }
}

/**
 * Espeja una lista de imágenes externas preservando el color asociado.
 * Best-effort: si una imagen falla, se conserva su URL original.
 * @param imagenes Lista { color, url } a espejar.
 * @returns La misma lista con URLs locales cuando el espejado tuvo éxito.
 */
export async function espejarImagenesExternas(
  imagenes: { color: string | null; url: string }[],
): Promise<{ color: string | null; url: string }[]> {
  const salida: { color: string | null; url: string }[] = []
  for (const imagen of imagenes) {
    const resultado = await espejarImagenExterna(imagen.url)
    salida.push({ color: imagen.color, url: resultado.url ?? imagen.url })
  }
  return salida
}
