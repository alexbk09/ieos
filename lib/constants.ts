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

/** Milisegundos de espera antes de recargar el catálogo mientras el usuario escribe. */
export const CATALOG_FILTER_DEBOUNCE_MS = 400

/** Nº máximo de categorías sugeridas cuando el filtro no arroja resultados. */
export const CATALOG_EMPTY_STATE_CATEGORY_SUGGESTIONS = 6

// ---------- Catálogo público: ordenamiento ----------

/**
 * Opciones de ordenamiento del catálogo.
 * `value` viaja en la query string (parámetro `sort` de /api/catalog) y
 * `labelKey` es la clave i18n que resuelve la etiqueta visible (no se queman
 * textos en los componentes).
 */
export const CATALOG_SORT_OPTIONS = [
  { value: 'relevance', labelKey: 'catalog.sortRelevance' },
  { value: 'rating', labelKey: 'catalog.sortRating' },
  { value: 'price-asc', labelKey: 'catalog.sortPriceAsc' },
  { value: 'price-desc', labelKey: 'catalog.sortPriceDesc' },
  { value: 'newest', labelKey: 'catalog.sortNewest' },
] as const

/** Tipo de orden válido (derivado de las opciones: evita strings sueltos). */
export type CatalogSortValue = (typeof CATALOG_SORT_OPTIONS)[number]['value']

/** Lista de valores de orden válidos, para validar entradas externas. */
export const CATALOG_SORT_VALUES: readonly CatalogSortValue[] = CATALOG_SORT_OPTIONS.map((option) => option.value)

/** Orden por defecto: curaduría manual del equipo + novedad. */
export const DEFAULT_CATALOG_SORT: CatalogSortValue = 'relevance'

/** Comprueba si un valor arbitrario es un orden de catálogo válido. */
export function isCatalogSortValue(value: string): value is CatalogSortValue {
  return (CATALOG_SORT_VALUES as readonly string[]).includes(value)
}

// ---------- Catálogo público: facetas de valor (filtros rápidos) ----------

/** Valoración mínima (escala 0-5) para el filtro rápido "Mejor valorados". */
export const CATALOG_TOP_RATED_MIN = 4

/**
 * Filtros rápidos del catálogo (facetas de valor).
 * `key` es a la vez el parámetro `=true` que viaja en la query de /api/catalog
 * y la clave del estado en el cliente; `labelKey` resuelve la etiqueta i18n.
 * - featured: curado por el equipo (products.featured)
 * - onSale:   tiene precio de referencia/oferta (products.precio_original != null)
 * - topRated: valoración real >= CATALOG_TOP_RATED_MIN (products.rating_average)
 * - inStock:  stock local disponible (products.stock > 0)
 * - bulk:     descuento por mayoreo activo (products.bulk_discount_percent > 0)
 */
export const CATALOG_QUICK_FILTERS = [
  { key: 'featured', labelKey: 'catalog.quickFeatured' },
  { key: 'onSale', labelKey: 'catalog.quickOnSale' },
  { key: 'topRated', labelKey: 'catalog.quickTopRated' },
  { key: 'inStock', labelKey: 'catalog.quickInStock' },
  { key: 'bulk', labelKey: 'catalog.quickBulk' },
] as const

/** Clave de un filtro rápido (derivada de CATALOG_QUICK_FILTERS). */
export type CatalogQuickFilterKey = (typeof CATALOG_QUICK_FILTERS)[number]['key']

/** Límite de productos destacados que se muestran en la portada. */
export const FEATURED_PRODUCTS_LIMIT = 6

/** Tasa de IVA aplicada al precio de venta (16%). */
export const IVA_RATE = 0.16

/** Slug del módulo "Ajuste de Margen y Control de Pérdidas" para permisos. */
export const MARGIN_ADJUSTMENT_MODULE_SLUG = 'ajustes_precios'

/**
 * Longitud mínima de contraseña aceptada por los formularios de registro/login.
 * Se usa en el atributo nativo `minLength` para no quemar el número en la UI.
 */
export const AUTH_MIN_PASSWORD_LENGTH = 6

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

/** Número máximo de reseñas crudas que el scraper recoge (se depuran después). */
export const SCRAPER_MAX_RAW_REVIEWS = 20

// ---------- Especificaciones técnicas (tabla de la ficha) ----------
// AliExpress cambia las clases con hash (ej: specification--name--Ab12) y ya no
// hidrata `window.runParams`, así que la extracción se centraliza en constantes:
// selectores agnósticos ([class*=...]) + rutas del JSON + topes de saneamiento.

/** Máximo de especificaciones técnicas guardadas por producto. */
export const SCRAPER_MAX_SPEC_ENTRIES = 60

/** Longitud máxima de la CLAVE de una especificación (evita ruido/etiquetas basura). */
export const SCRAPER_MAX_SPEC_KEY_LENGTH = 60

/** Longitud máxima del VALOR de una especificación (evita bloques de texto). */
export const SCRAPER_MAX_SPEC_VALUE_LENGTH = 180

/** Marcadores de <script> que pueden hidratar el producto como JSON embebido. */
export const SCRAPER_JSON_SCRIPT_MARKERS: string[] = [
  'window.runParams',
  '_init_data_',
  '_d_c_.DCData',
  '__NEXT_DATA__',
  '__APOLLO_STATE__',
]

/**
 * Rutas del JSON donde AliExpress expone la tabla de especificaciones.
 * Varían según la versión del frontend; se prueban en orden hasta acertar.
 */
export const SCRAPER_SPEC_JSON_ROOTS: string[][] = [
  ['data', 'productPropComponent'],
  ['data', 'productProps'],
  ['data', 'specification'],
  ['data', 'specifications'],
  ['data', 'productProperties'],
]

/** Filas de la tabla de especificaciones en el DOM (selectores CSS agnósticos). */
export const SCRAPER_SPEC_ROW_SELECTORS: string[] = [
  'li[class*="specification--prop"]',
  '[class*="product-specs"] li',
  '[class*="specification--item"]',
  '[class*="specs"] table tr',
  'table[class*="specification"] tbody tr',
]

/** Sub-selectores del NOMBRE (etiqueta) dentro de una fila de especificaciones. */
export const SCRAPER_SPEC_NAME_SELECTORS: string[] = [
  '[class*="specification--name"]',
  '[class*="prop--name"]',
  '[class*="spec-name"]',
]

/** Sub-selectores del VALOR dentro de una fila de especificaciones. */
export const SCRAPER_SPEC_VALUE_SELECTORS: string[] = [
  '[class*="specification--value"]',
  '[class*="prop--value"]',
  '[class*="spec-value"]',
]

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

// ---------- Re-enriquecimiento de productos publicados (Fase 2.6) ----------
// Los precios, el stock y las valoraciones cambian con el tiempo; estos topes
// gobiernan el botón "Actualizar precios y datos" del panel de admin.

/** Cantidad por defecto de productos a re-enriquecer por ejecución. */
export const ALI_ENRICH_BATCH_SIZE = 5

/** Tope defensivo de productos por ejecución de re-enriquecimiento. */
export const ALI_ENRICH_MAX_PRODUCTS = 20

/**
 * Máximo de IDs que se piden por llamada a `productdetail.get`.
 * Verificado: la API acepta 20 IDs de una vez, así que el re-enriquecimiento
 * completo (ej. 140 productos) se resuelve en pocas llamadas.
 */
export const ALI_DETAIL_BATCH_SIZE = 20

/**
 * Nº de productos que se procesan en paralelo (marca/specs con IA + update).
 * La IA por producto es lo más lento del re-enriquecimiento; paralelizar en
 * grupos pequeños permite actualizar TODO el catálogo dentro del tiempo máximo
 * de la función sin sobrecargar al modelo.
 */
export const ALI_ENRICH_CONCURRENCY = 5

/**
 * Espaciado mínimo entre llamadas a la API de AliExpress (ms).
 * La API responde con "ApiCallLimit ... ban will last 1 seconds" si se llama
 * demasiadas veces seguidas, así que se espera algo más de 1s entre peticiones.
 */
export const ALI_API_MIN_INTERVAL_MS = 1200

/**
 * Método oficial de AliExpress Open Platform para obtener el DETALLE ampliado
 * de un producto conocido su ID (incluye marca y propiedades técnicas).
 * Se usa como enriquecimiento cuando `product.query` no trae el campo `brand`.
 */
export const ALI_DETAIL_METHOD = 'aliexpress.affiliate.productdetail.get'

/**
 * Moneda en la que se solicitan los precios a la API oficial (EUR: coincide con
 * el precio que el usuario ve en el navegador, sin conversiones manuales).
 */
export const ALI_TARGET_CURRENCY = 'EUR'

/**
 * País de destino usado en las consultas de afiliado. Afecta a precios y
 * disponibilidad devueltos por la API (se usa un mercado soportado con EUR).
 */
export const ALI_SHIP_TO_COUNTRY = 'ES'

/**
 * Claves candidatas donde la API de AliExpress puede exponer el nombre de
 * marca del producto (el "envelope" cambia según la versión del API).
 * Se prueban en orden: la primera que venga con valor gana.
 */
export const ALI_BRAND_FIELD_CANDIDATES = ['brand', 'brand_name', 'brandName'] as const

/**
 * Valor por defecto de disponibilidad del catálogo de afiliados: los productos
 * importados no gestionan inventario local, así que se asume disponible.
 */
export const AFFILIATE_DEFAULT_STOCK = 50

/**
 * Proporción del precio de venta usada como costo inicial estimado en los
 * productos importados por el pipeline (costo = precio × ratio).
 * Centralizado para no quemar el 0.5 en el orquestador.
 */
export const AFFILIATE_COST_RATIO = 0.5

// ---------- Opiniones y valoraciones (peso SEO del producto) ----------

/**
 * Atributo rel obligatorio en TODOS los enlaces salientes de afiliado.
 * `sponsored` declara el enlace como patrocinado y `nofollow` evita regalar
 * autoridad del dominio a AliExpress/Amazon (recomendación de Google).
 */
export const AFFILIATE_LINK_REL = 'nofollow sponsored noopener noreferrer'

/** Máximo de reseñas reales que se guardan/traducen por producto. */
export const REVIEWS_MAX_STORED = 5

/** Longitud mínima de una reseña para considerarla útil (evita "ok", "bien"). */
export const REVIEWS_MIN_TEXT_LENGTH = 15

/** Longitud máxima de una reseña almacenada (recorte defensivo). */
export const REVIEWS_MAX_TEXT_LENGTH = 600

/** Temperatura del LLM que traduce las reseñas (fidelidad, sin inventar). */
export const REVIEWS_TRANSLATION_TEMPERATURE = 0.2

/** Máximo de tokens de salida de la traducción de reseñas. */
export const REVIEWS_TRANSLATION_MAX_TOKENS = 1600

/** Modelo del motor de traducción/redacción de reseñas. */
export const REVIEWS_TRANSLATION_MODEL = 'deepseek-chat'

/**
 * Idioma al que se traducen las reseñas importadas. Coincide con el idioma
 * en el que la IA redacta las descripciones (español neutro), para que la
 * sección "Opiniones" sea coherente con el resto de la ficha.
 */
export const REVIEWS_TARGET_LANGUAGE = 'es'

/**
 * Interruptor del espejado de imágenes de AliExpress a nuestro storage.
 * TRUE = descarga cada imagen y la sube al bucket propio (así el sitemap de
 * imágenes y las URLs locales funcionan), a coste de almacenamiento y tiempo
 * de pipeline. FALSE (por defecto) = se conservan las URLs del CDN de AliExpress.
 */
export const MIRROR_AFFILIATE_IMAGES = false

/** Máximo de especificaciones extraídas del título por producto. */
export const META_MAX_SPECS = 12

/** Longitud máxima aceptada para un nombre de marca derivado del título. */
export const META_MAX_MARCA_LENGTH = 40

/** Temperatura del LLM al extraer marca/specs (fidelidad literal al título). */
export const META_EXTRACTION_TEMPERATURE = 0.1

/** Máximo de tokens de salida de la extracción de metadatos. */
export const META_EXTRACTION_MAX_TOKENS = 700

/** Modelo del motor de extracción de metadatos. */
export const META_EXTRACTION_MODEL = 'deepseek-chat'

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
