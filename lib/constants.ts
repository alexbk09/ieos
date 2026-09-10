/**
 * Constantes de negocio centralizadas.
 * Evita "magic numbers" y strings quemados en componentes y servicios.
 */

// Configuración de idiomas: la FUENTE ÚNICA (locales soportados, idioma por
// defecto y idioma raíz/puente) vive en lib/i18n-config.mjs, que es lógica
// pura reutilizable por los tests de Node y los scripts .mjs (que no pueden
// importar TypeScript). Aquí se re-expone para que el resto de la app siga
// teniendo un único punto de configuración.
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  SOURCE_LOCALE,
  HREFLANG_X_DEFAULT,
  PUBLISHED_LOCALES,
} from '@/lib/i18n-config'

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

/**
 * Token público de verificación de Google Search Console (método meta tag).
 * Se emite como <meta name="google-site-verification" content={...} /> en el
 * <head> desde app/layout.tsx. Es complementario al archivo físico
 * public/google8222e40aea313a4f.html (método HTML file) que sirve Google.
 */
export const GOOGLE_SITE_VERIFICATION = 'google8222e40aea313a4f'

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

// ---------- Asistente IA (catálogo + afiliación AliExpress/Amazon) ----------

/** Máximo de productos que el asistente devuelve por búsqueda (controla costo y ruido). */
export const AGENT_MAX_PRODUCT_RESULTS = 6

/** Máximo de categorías que el asistente devuelve por búsqueda. */
export const AGENT_MAX_CATEGORY_RESULTS = 8

/** Longitud mínima del término para filtrar por texto (evita escaneos inútiles en la DB). */
export const AGENT_MIN_QUERY_LENGTH = 2

/** Pasos máximos de herramientas por turno (buscar categoría → buscar producto → agregar). */
export const AGENT_MAX_STEPS = 4

/** Creatividad del modelo: baja para respuestas fieles al catálogo real (sin inventar). */
export const AGENT_TEMPERATURE = 0.3

/** Prefijo de la ruta pública de categoría usada por el asistente para enlazar. */
export const AGENT_CATEGORY_PATH_PREFIX = '/categoria/'

/** Nombre de la marca que anuncia el Asistente IA (chat flotante). */
export const AGENT_BRAND_NAME = 'zonahobbies'

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

/** Slug del módulo admin "SEO de Categorías" (hubs pSEO) para permisos RBAC. */
export const CATEGORY_SEO_MODULE_SLUG = 'categorias_seo'

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

// ---------- Motor de contenido SEO (DeepSeek) ----------
// Centraliza la configuración del cerebro de contenido para no quemar
// números ni frases en el servicio (regla de oro: cero magic numbers).

/** Temperatura del LLM: mayor valor = más variación (menos plantillas repetidas). */
export const SEO_TEMPERATURE = 0.65

/** Máximo de tokens de salida del generador SEO (título + HTML + FAQ). */
export const SEO_MAX_TOKENS = 1400

/** Longitud recomendada del título SEO (Google trunca por encima de 60). */
export const SEO_TITLE_MIN_LENGTH = 40
export const SEO_TITLE_MAX_LENGTH = 60

/** Rango de palabras clave objetivo por producto. */
export const SEO_MIN_KEYWORDS = 3
export const SEO_MAX_KEYWORDS = 12

/** Rango de preguntas frecuentes generadas por producto. */
export const SEO_MIN_FAQ = 2
export const SEO_MAX_FAQ = 6

/** Longitud mínima de la descripción HTML generada. */
export const SEO_MIN_DESCRIPTION_CHARS = 200

/**
 * Frases genéricas de AliExpress prohibidas (contenido duplicado).
 * El validador rechaza cualquier título/descripción que las contenga.
 */
export const SEO_BANNED_PHRASES = [
  'compra segura',
  'envio global',
  'envío global',
  'mejor precio',
  'oferta del dia',
  'alta calidad',
  'envio rapido',
  'envío rápido',
] as const

/** Secciones H2 obligatorias en la descripción (jerarquía SEO de la ficha). */
export const SEO_REQUIRED_SECTIONS = ['Características principales', 'Preguntas Frecuentes'] as const

/** Sección H2 opcional (solo cuando el producto trae datos físicos). */
export const SEO_OPTIONAL_SPECS_SECTION = 'Especificaciones físicas'

/** Número máximo de productos relacionados mostrados en la ficha (enlazado interno). */
export const RELATED_PRODUCTS_LIMIT = 4

/** Número máximo de categorías mostradas en la navegación cross-categoría. */
export const CATEGORY_NAV_LIMIT = 12

/** Número de palabras iniciales que forman la "firma" anti-duplicado de un título. */
export const SEO_TITLE_SIGNATURE_WORDS = 4

// ---------- Merchant / Rich Results (schema JSON-LD) ----------

/** País de operación de la tienda (ISO 3166-1 alpha-2) para ShippingDetails. */
export const STORE_COUNTRY_CODE = 'VE'

/** Días mínimos/máximos de entrega estimada para productos de afiliado (Merchant). */
export const AFFILIATE_SHIPPING_MIN_DAYS = 7
export const AFFILIATE_SHIPPING_MAX_DAYS = 15

/** Días para devolución del producto (Merchant Return Policy). */
export const MERCHANT_RETURN_DAYS = 30



// ---------- Sitemap / SEO ----------

/**
 * Revalidación del sitemap (segundos → 1 hora).
 * Google valora frescura, pero consultar la BD en cada request sería costoso:
 * 1 hora equilibra crawl budget y datos actualizados.
 *
 * ⚠️ Next.js exige un LITERAL estático en `export const revalidate = ...`
 * (no resuelve identificadores importados). Por eso app/sitemap.ts duplica
 * este valor como literal: si cambias aquí, actualiza también ese archivo.
 */
export const SITEMAP_REVALIDATE_SECONDS = 3600

/** Máximo de URLs por archivo de sitemap (límite duro de Google: 50,000). */
export const SITEMAP_MAX_URLS = 50_000

/**
 * Máximo de imágenes por URL en el sitemap de imágenes.
 * Google permite hasta 1,000 por página; usamos 8 para enviar la galería
 * principal (el mismo tope del schema JSON-LD) sin inflar el archivo.
 */
export const SITEMAP_MAX_IMAGES_PER_URL = 8

// ---------- Internacionalización (i18n) ----------
// La FUENTE ÚNICA de locales (lista soportada, idioma por defecto y raíz/puente)
// vive en lib/i18n-config.mjs y se re-expone al inicio de este archivo. Aquí solo
// van los parámetros de negocio que NO son lógica pura: cookie, motor de
// traducción y el slug del módulo RBAC de traducciones.

/** Nombre de la cookie donde se persiste la preferencia de idioma del usuario. */
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'

/** Caducidad de la cookie de idioma (1 año, en segundos). */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Temperatura del LLM de traducción. Baja a propósito: aquí buscamos traducciones
 * FIELES y consistentes (no creatividad), a diferencia del redactor SEO que sí
 * necesita variación para no repetir plantillas.
 */
export const TRANSLATION_TEMPERATURE = 0.2

/** Máximo de tokens de salida del traductor de contenido (nombre + descripción + SEO). */
export const TRANSLATION_MAX_TOKENS = 1600

/** Nº máximo de entidades a traducir por lote (controla el coste de tokens). */
export const TRANSLATION_BATCH_SIZE = 10

/** Slug del módulo "Idiomas de Categorías" (traducciones) para permisos RBAC. */
export const CATEGORY_I18N_MODULE_SLUG = 'categorias_idiomas'

/** Endpoint del modelo de traducción (DeepSeek, API compatible con OpenAI). */
export const TRANSLATION_API_URL = 'https://api.deepseek.com/v1/chat/completions'

/** Modelo de chat usado para traducir contenido. */
export const TRANSLATION_MODEL = 'deepseek-chat'
