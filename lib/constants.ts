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

// ---------- Slugs de módulos nuevos (Logística, Finanzas, Contabilidad) ----------

/** Slug del módulo "Almacenes" (multi-almacén) para permisos. */
export const ALMACENES_MODULE_SLUG = 'almacenes'

/** Slug del módulo "Despacho y Rutas" para permisos. */
export const DESPACHOS_MODULE_SLUG = 'despachos'

/** Slug del módulo "Transportistas" para permisos. */
export const TRANSPORTISTAS_MODULE_SLUG = 'transportistas'

/** Slug del módulo "Zonas de Envío" para permisos. */
export const ENVIOS_MODULE_SLUG = 'envios'

/** Slug del módulo "Cuentas por Cobrar" para permisos. */
export const CUENTAS_COBRAR_MODULE_SLUG = 'cuentas_cobrar'

/** Slug del módulo "Conciliación Bancaria" para permisos. */
export const CONCILIACION_MODULE_SLUG = 'conciliacion'

/** Slug del módulo "Cuentas Bancarias" para permisos. */
export const CUENTAS_BANCARIAS_MODULE_SLUG = 'cuentas_bancarias'

/** Slug del módulo "Pasarelas de Pago" para permisos. */
export const PASARELAS_MODULE_SLUG = 'pasarelas'

/** Slug del módulo "Libros Fiscales" para permisos. */
export const LIBROS_FISCALES_MODULE_SLUG = 'libros_fiscales'

/** Slug del módulo "Facturación XML SENIAT" para permisos. */
export const FACTURACION_XML_MODULE_SLUG = 'facturacion_xml'

/** Slug del módulo "Reporte de Margen Neto" para permisos. */
export const REPORTE_MARGEN_MODULE_SLUG = 'reporte_margen'

/** Slug del módulo "Analítica de Productos" para permisos. */
export const ANALYTICS_PRODUCTS_MODULE_SLUG = 'analytics_productos'

// ---------- Analítica de productos ----------

/**
 * Tipos de evento de producto rastreados para el panel de analítica.
 * Cada uno incrementa un contador diario en product_daily_analytics.
 */
export const PRODUCT_EVENT_TYPES = {
  /** Vista del detalle del producto (modal o página /productos/[slug]). */
  VIEW: 'product_view',
  /** Clic sobre la card para abrir el detalle. */
  CARD_CLICK: 'card_click',
  /** Producto agregado al carrito híbrido (local). */
  ADD_TO_CART: 'add_to_cart',
  /** Clic de salida a un marketplace de afiliado (AliExpress/Amazon/store). */
  AFFILIATE_CLICK: 'affiliate_click',
  /** Producto mostrado como resultado del Asistente IA. */
  AI_IMPRESSION: 'ai_impression',
} as const

/** Mercados de afiliado reconocidos por la analítica (ali/amazon/store). */
export const PRODUCT_ANALYTICS_MARKETS = {
  ALIEXPRESS: 'aliexpress',
  AMAZON: 'amazon',
  STORE: 'store',
} as const

/** Origen de una búsqueda rastreada (filtro del catálogo o asistente IA). */
export const SEARCH_LOG_SOURCES = {
  /** Búsqueda por filtro en el catálogo público. */
  CATALOG_FILTER: 'catalog_filter',
  /** Búsqueda ejecutada por el Asistente IA. */
  AGENT: 'agent',
} as const

// ---------- Constantes de negocio nuevas ----------

/** Factor estándar aéreo para peso volumétrico (cm³ / kg). */
export const SHIPPING_VOLUMETRIC_FACTOR = 5000

/** Tarifa por defecto para envíos dentro del estado (USD por kg). */
export const DEFAULT_SHIPPING_RATE_PER_KG = 2

// ---------- Scraper AliExpress (Fase 2.1 — Extracción tradicional) ----------

/** Slug del módulo admin "Scraper AliExpress" para permisos RBAC. */
export const SCRAPER_ALIEXPRESS_MODULE_SLUG = 'scraper_aliexpress'

/** Slug del módulo admin "Pipeline AliExpress" (automatización integral) para permisos RBAC. */
export const ALI_PIPELINE_MODULE_SLUG = 'ali_pipeline'

/** Endpoint de la API de ScraperAPI (renderizado JS remoto). */
export const SCRAPERAPI_ENDPOINT = 'https://api.scraperapi.com'

/** Endpoint de la API de ZenRows (fallback si no hay ScraperAPI). */
export const ZENROWS_ENDPOINT = 'https://api.zenrows.com/v1'

/** Tiempo máximo de espera de la respuesta del proxy de scraping (ms). */
export const SCRAPER_DEFAULT_TIMEOUT_MS = 60_000

/** Retry automático del proxy si responde 429/5xx (1 reintento). */
export const SCRAPER_MAX_RETRIES = 1

/** Expresión: IDs de producto AliExpress (números largos ≥ 5 dígitos). */
export const ALIEXPRESS_PRODUCT_ID_REGEX = /\d{5,}/

/** Número máximo de imágenes por variante de color/ownerItemId devueltas. */
export const SCRAPER_MAX_IMAGES_PER_COLOR = 8

// ---------- AliExpress Open Platform (API oficial afiliados — Fase 2.2) ----------

/**
 * Endpoint para APIs de NEGOCIO de AliExpress Open Platform.
 * Según la documentación oficial, las business APIs (como las de afiliado)
 * se llaman vía GET a /sync?method={api_path}&{query}.
 */
export const ALIEXPRESS_OPEN_API_ENDPOINT = 'https://api-sg.aliexpress.com/sync'

/** Método oficial para buscar productos afiliados por keyword, ordenados por volumen o comisión. */
export const ALI_SEARCH_METHOD = 'aliexpress.affiliate.product.query'

/** Método oficial para convertir URLs normales en enlaces afiliados con tracking ID. */
export const ALI_LINK_METHOD = 'aliexpress.affiliate.link.generate'

/** Máximo de productos a procesar por ejecución del pipeline (defensivo). */
export const ALI_PIPELINE_MAX_PRODUCTS = 10

/** Cantidad por defecto de productos a optimizar por lote. */
export const ALI_OPTIMIZE_PER_BATCH = 5
