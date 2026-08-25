/**
 * Constantes de negocio centralizadas.
 * Evita "magic numbers" y strings quemados en componentes y servicios.
 */

/** Tasa de cambio fija USD → Bs. para mostrar precios en bolívares. */
export const EXCHANGE_RATE = 36.5

/** Umbral mínimo de stock para considerar un producto como "stock bajo". */
export const LOW_STOCK_ALERT = 20

/** Tamaño máximo permitido para subir imágenes (5 MB). */
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024

/** Tamaño máximo permitido para subir avatares (2 MB). */
export const AVATAR_MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024

/** Calidad de compresión WebP para imágenes subidas al storage. */
export const WEBP_QUALITY = 80

/** Ancho máximo en píxeles para redimensionar imágenes (mantiene proporción). */
export const IMAGE_MAX_WIDTH = 1200

/** Ancho máximo en píxeles para avatares (mantiene proporción). */
export const AVATAR_IMAGE_MAX_WIDTH = 512

/** Bucket de Supabase Storage para imágenes de productos. */
export const PRODUCTS_BUCKET = 'productos-bucket'

/** Bucket de Supabase Storage para avatares de usuario. */
export const AVATARS_BUCKET = 'avatars-bucket'

/** Número de WhatsApp para confirmación de pedidos. */
export const WHATSAPP_NUMBER = '584122649707'

/** Prefijo de ruta para imágenes locales del catálogo (WebP optimizadas). */
export const LOCAL_IMAGES_PREFIX = '/products/webp/'

/** Cantidad de productos por página en el catálogo (infinite scroll). */
export const CATALOG_PAGE_SIZE = 10

/** Límite de productos destacados que se muestran en la portada. */
export const FEATURED_PRODUCTS_LIMIT = 6

/** Tasa de IVA aplicada al precio de venta (16%). */
export const IVA_RATE = 0.16

/** Slug del módulo "Ajuste de Margen y Control de Pérdidas" para permisos. */
export const MARGIN_ADJUSTMENT_MODULE_SLUG = 'ajustes_precios'
