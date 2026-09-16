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

// Presentación de precios de la VITRINA (conversión EUR→USD, colchón de
// conversión e interruptor de la referencia en bolívares). La lógica pura vive
// en lib/display-price.mjs para poder probarse con `node --test`; aquí se
// re-expone para que el resto de la app tenga un único punto de configuración.
export {
  EUR_USD_REFERENCE_RATE,
  PRICE_DISPLAY_MARKUP_PERCENT,
  SHOW_BOLIVAR_PRICES,
} from '@/lib/display-price'

/** Umbral mínimo de stock para considerar un producto como "stock bajo". */
export const LOW_STOCK_ALERT = 20

/**
 * Ventana (en días) de las métricas de analítica mostradas en el Dashboard.
 * Un mes móvil equilibra señal reciente y volumen suficiente de datos.
 */
export const DASHBOARD_ANALYTICS_DAYS = 30

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

// ---------- Portada: grilla de productos con rotación aleatoria ----------

/**
 * Nº de productos que muestra la grilla del inicio.
 * 12 = 4 filas completas de 3 en desktop y 6 filas de 2 en tablet: más variedad
 * visible que los 6 "destacados" originales sin penalizar el render (las
 * imágenes bajo el pliegue se cargan en diferido).
 */
export const HOME_PRODUCTS_LIMIT = 12

/**
 * Tope de productos que se piden a la BD para poder BARAJAR con variedad.
 * Cuanto mayor es el pool, menos repeticiones entre visitas; el tope evita que
 * la consulta crezca sin control si un día el catálogo es enorme.
 */
export const HOME_PRODUCTS_MAX_POOL = 60

/** Factor del pool aleatorio respecto al límite visible (variedad por visita). */
export const HOME_PRODUCTS_POOL_FACTOR = 4

/** Ruta de la API pública que sirve la muestra aleatoria del inicio. */
export const HOME_PRODUCTS_API_PATH = '/api/home-products'

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

// ---------- Slugs legado (sistema anterior de tienda física) ----------

/** Slug del módulo "Cotizaciones" (legado del sistema anterior). */
export const COTIZACIONES_MODULE_SLUG = 'cotizaciones'

/** Slug del módulo "Facturación" (legado del sistema anterior). */
export const FACTURACION_MODULE_SLUG = 'facturacion'

/** Slug del módulo "Solicitudes" (legado del sistema anterior). */
export const SOLICITUDES_MODULE_SLUG = 'solicitudes'

// ---------- Módulos legado ocultos (no pertenecen a la plataforma de afiliación) ----------

/**
 * Slugs de los módulos del ANTIGUO sistema de tienda física (Ventas, Logística,
 * Contabilidad y Finanzas, más el control de margen/pérdidas) que YA NO forman
 * parte de esta plataforma de afiliación.
 *
 * Esta es la FUENTE ÚNICA de verdad y alimenta tres comportamientos:
 *   1. El menú lateral (`components/admin-shell.tsx`) deja de mostrar los grupos.
 *   2. La matriz de permisos (`services/roles.ts` → getModules/getUserPermissions)
 *      deja de ofrecerlos, así que ningún rol nuevo puede recibirlos.
 *   3. `hasPermission()` niega el acceso directo por URL y a sus APIs.
 *
 * NO se eliminan archivos ni tablas: ocultar es 100% reversible y no borra datos.
 * Para reactivar un módulo, basta con quitar su slug de esta lista.
 */
export const HIDDEN_MODULE_SLUGS: readonly string[] = [
  // Ventas (sistema anterior)
  COTIZACIONES_MODULE_SLUG,
  FACTURACION_MODULE_SLUG,
  SOLICITUDES_MODULE_SLUG,
  // Logística
  ALMACENES_MODULE_SLUG,
  TRANSPORTISTAS_MODULE_SLUG,
  DESPACHOS_MODULE_SLUG,
  ENVIOS_MODULE_SLUG,
  // Finanzas
  CUENTAS_COBRAR_MODULE_SLUG,
  CONCILIACION_MODULE_SLUG,
  PASARELAS_MODULE_SLUG,
  CUENTAS_BANCARIAS_MODULE_SLUG,
  // Contabilidad
  LIBROS_FISCALES_MODULE_SLUG,
  FACTURACION_XML_MODULE_SLUG,
  REPORTE_MARGEN_MODULE_SLUG,
  // Control de margen y pérdidas
  MARGIN_ADJUSTMENT_MODULE_SLUG,
]

/** Conjunto derivado para consultas O(1) sobre los slugs ocultos. */
const HIDDEN_MODULE_SLUG_SET = new Set(HIDDEN_MODULE_SLUGS)

/**
 * Indica si un módulo es legado y debe permanecer oculto (menú, permisos y acceso).
 * @param slug Slug del módulo a consultar (puede ser null/undefined).
 * @returns true si el módulo no debe mostrarse ni permitir acceso.
 */
export function isModuleHidden(slug: string | null | undefined): boolean {
  return slug ? HIDDEN_MODULE_SLUG_SET.has(slug) : false
}

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

/** Slug del módulo admin "Guías y Comparativas" (entradas SEO) para permisos RBAC. */
export const ENTRY_MODULE_SLUG = 'guias_comparativas'

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

// ---------- Disponibilidad AliExpress (Fase 2.8 — degradación SEO-safe) ----------
// Un producto afiliado puede DESAPARECER del catálogo de AliExpress o quedarse
// sin precio comprable. La API de afiliados no expone inventario real (el
// "stock" de los afiliados es un placeholder), así que la verificación compara
// el detalle fresco de la API con el estado publicado y DEGRADA la ficha
// (OutOfStock + alternativas) sin ocultarla: así no se pierde la URL indexada.

/**
 * Estados y acciones del evaluador puro de disponibilidad.
 * Se re-exportan desde lib/ali-availability.mjs para que la app tenga un único
 * punto de configuración (misma fuente que consumen los tests de Node).
 */
export { ALI_ESTADO, ALI_ACCION } from '@/lib/ali-availability'

/**
 * Ausencias consecutivas del detalle en AliExpress necesarias para degradar.
 * Con 2 se descarta el falso positivo por un fallo transitorio (rate limit o
 * error de lote) sin dejar un producto muerto publicado más de una corrida.
 */
export const ALI_UNAVAILABLE_MISSES_THRESHOLD = 2

/**
 * Tope defensivo de productos verificados por ejecución del botón manual.
 * La verificación es REANUDABLE: se priorizan los productos con
 * `ali_last_checked_at` más antiguo (nulos primero), así que pulsar de nuevo
 * continúa por los pendientes en lugar de repetir los mismos.
 */
export const ALI_AVAILABILITY_MAX_PRODUCTS = 500

/** Tamaño de página al leer el catálogo afiliado a verificar (Supabase). */
export const ALI_AVAILABILITY_PAGE_SIZE = 500

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

// ---------- Entradas SEO (guías y comparativas) ----------
// Parametrizan el gate de calidad de las entradas pSEO. La fuente única es
// este archivo: lib/entry-rules.mjs recibe TODO por parámetro, así que los
// tests validan la lógica sin depender de constantes quemadas.

/**
 * Tipos de entrada soportados. DEBEN coincidir con el CHECK de la migración
 * 0056 (`seo_entries.tipo`) para que la IA nunca proponga un tipo inválido.
 */
export const ENTRY_TYPES = [
  'comparativa',
  'top_lista',
  'guia_compra',
  'caso_uso',
  'vale_la_pena',
  'problema_solucion',
  'mito_realidad',
  'regalo',
] as const

/**
 * Prefijo i18n de la etiqueta visible de cada tipo de entrada.
 * La clave se DERIVA del tipo (`entry.type.comparativa`, …) para no mantener un
 * segundo mapa a mano: si mañana se añade un tipo, basta con traducir su clave.
 */
export const ENTRY_TYPE_LABEL_PREFIX = 'entry.type.'

/**
 * Devuelve la clave i18n de la etiqueta de un tipo de entrada.
 * POR QUÉ existe: el filtro por tipo del hub /guias se pinta con el idioma
 * activo; así el componente no quema textos en español ni conoce los tipos.
 * @param tipo Tipo de entrada (ver ENTRY_TYPES).
 * @returns Clave i18n o null cuando el tipo no está soportado.
 */
export function entryTypeLabelKey(tipo: string | null | undefined): string | null {
  const valor = String(tipo ?? '')
  return (ENTRY_TYPES as readonly string[]).includes(valor) ? ENTRY_TYPE_LABEL_PREFIX + valor : null
}

/**
 * Estados del ciclo editorial. Reflejan el CHECK de la migración 0056.
 * Solo 'publicado' es visible en público y entra al sitemap.
 */
export const ENTRY_STATUSES = ['borrador', 'revision', 'publicado', 'archivado'] as const

/**
 * Temperatura del LLM al redactar entradas: MÁS ALTA que la de fichas porque
 * aquí queremos voz editorial propia (no plantillas repetidas entre entradas).
 */
export const ENTRY_TEMPERATURE = 0.75

/** Máximo de tokens de salida (artículo + comparativa + FAQ). */
export const ENTRY_MAX_TOKENS = 4000

/** Longitud del título SEO de la entrada (Google trunca por encima de ~65). */
export const ENTRY_TITLE_MIN_LENGTH = 30
export const ENTRY_TITLE_MAX_LENGTH = 65

/** Longitud de la meta description (resumen) que se muestra en Google. */
export const ENTRY_RESUMEN_MIN_LENGTH = 110
export const ENTRY_RESUMEN_MAX_LENGTH = 160

/**
 * Mínimo de palabras del cuerpo del artículo. Es el gate ANTI "thin content":
 * por debajo de este umbral, Google considera la página de bajo valor.
 */
export const ENTRY_MIN_WORDS = 450

/**
 * Secciones H2 obligatorias del artículo. Reproducen el recorrido mental del
 * comprador (contexto → comparación → para quién → cómo elegir → dudas), que es
 * la estructura que Google usa para entender la página.
 */
export const ENTRY_REQUIRED_SECTIONS = [
  'Por qué sí comprarlo',
  'Comparativa',
  'Para quién es',
  'Cómo elegir',
  'Preguntas Frecuentes',
] as const

/** Rango de preguntas frecuentes por entrada (alimentan el schema FAQPage). */
export const ENTRY_MIN_FAQ = 3
export const ENTRY_MAX_FAQ = 6

/** Rango de palabras clave long-tail objetivo por entrada. */
export const ENTRY_MIN_KEYWORDS = 3
export const ENTRY_MAX_KEYWORDS = 12

/**
 * Rango de productos reales que una entrada debe comparar/mencionar.
 * El mínimo 2 evita "entradas hueco" que no aportan nada a la comparación.
 */
export const ENTRY_MIN_PRODUCTS = 2
export const ENTRY_MAX_PRODUCTS = 5

/** Máximo de criterios en la tabla comparativa (legibilidad móvil). */
export const ENTRY_MAX_CRITERIA = 8

/**
 * Tope de entradas por categoría (anti "doorway/spam a escala"): fuerza a
 * cubrir ángulos distintos en vez de inundar un nicho con variaciones.
 */
export const ENTRY_MAX_PER_CATEGORY = 6

/** Productos relacionados máximos sobre los que el brief propone pares. */
export const ENTRY_MAX_PAIRS = 6

/** Entradas relacionadas que se muestran al pie de una entrada. */
export const ENTRY_RELATED_LIMIT = 3

/**
 * Entradas que muestra el índice /guias por CADA página del paginador.
 * El hub descarga una sola vez las guías publicadas (lote acotado por
 * ENTRY_INDEX_MAX_ITEMS) y pagina en el CLIENTE: cambiar de página o filtrar es
 * instantáneo, sin peticiones nuevas y sin perder el HTML estático que lee
 * Google. Se mantiene moderado para no saturar la primera pantalla.
 */
export const ENTRY_INDEX_PAGE_SIZE = 12

/**
 * Botones/huecos máximos que pinta el paginador del hub (incluye las elipsis).
 * Acotarlo evita una fila interminable de números cuando hay muchas guías.
 */
export const ENTRY_INDEX_PAGE_LINKS = 7

/**
 * Tope de guías que descarga el hub en una sola consulta.
 * POR QUÉ existe: el índice busca, filtra y pagina en el cliente, así que
 * necesita el lote completo; el tope mantiene la respuesta (y el HTML) acotada
 * aunque el contenido crezca. Va muy por encima del catálogo realista
 * (ENTRY_MAX_PER_CATEGORY × nichos) y por debajo del corte de PostgREST.
 */
export const ENTRY_INDEX_MAX_ITEMS = 240

/**
 * Opciones de orden del índice /guias. `value` es el orden que entiende
 * lib/entry-index.mjs (lógica pura) y `labelKey` la clave i18n de su etiqueta.
 */
export const ENTRY_INDEX_SORT_OPTIONS = [
  { value: 'recent', labelKey: 'entry.sortRecent' },
  { value: 'reading', labelKey: 'entry.sortFastRead' },
  { value: 'az', labelKey: 'entry.sortAz' },
] as const

/** Orden válido del índice (derivado de las opciones: sin strings sueltos). */
export type EntryIndexSortValue = (typeof ENTRY_INDEX_SORT_OPTIONS)[number]['value']

/** Valores de orden válidos, para validar entradas externas. */
export const ENTRY_INDEX_SORT_VALUES: readonly EntryIndexSortValue[] = ENTRY_INDEX_SORT_OPTIONS.map(
  (option) => option.value,
)

/** Orden por defecto: lo recién publicado primero (señal de frescura pSEO). */
export const DEFAULT_ENTRY_INDEX_SORT: EntryIndexSortValue = 'recent'

/** Comprueba si un valor arbitrario es un orden de índice válido. */
export function isEntryIndexSortValue(value: string): value is EntryIndexSortValue {
  return (ENTRY_INDEX_SORT_VALUES as readonly string[]).includes(value)
}

/**
 * Tope de entradas que descarga de una vez el panel admin de "Guías y
 * Comparativas". El panel busca y pagina en CLIENTE sobre ese lote: acotarlo
 * mantiene la respuesta de la API predecible y la tabla siempre ligera.
 */
export const ENTRY_ADMIN_LIST_LIMIT = 100

/**
 * Tipos de entrada que crea el "generador masivo" del panel (3 guías por clic).
 * Cubren las tres intenciones de búsqueda más rentables de un nicho de
 * afiliación: ranking de ventas, idea de regalo y veredicto de compra.
 * DEBEN existir en ENTRY_TYPES (y en el CHECK de la migración 0056).
 */
export const ENTRY_BULK_TYPES = ['top_lista', 'regalo', 'vale_la_pena'] as const

/** Velocidad media de lectura (palabras por minuto) para el tiempo estimado. */
export const ENTRY_READING_WORDS_PER_MINUTE = 200

/**
 * Muletillas y clichés de IA prohibidos en las entradas. Son la huella digital
 * del "contenido basura generado a escala": si aparecen, el gate rechaza la
 * entrada para que se reescriba.
 */
export const ENTRY_BANNED_PHRASES = [
  'en el mundo actual',
  'en la era digital',
  'sumergete',
  'no busques mas',
  'como todos sabemos',
  'en conclusion',
  'sin duda alguna',
  'hoy en dia en el mercado',
] as const

// ---------- Merchant / Rich Results (schema JSON-LD) ----------

/** País de operación de la tienda (ISO 3166-1 alpha-2) para ShippingDetails. */
export const STORE_COUNTRY_CODE = 'VE'

/** Días mínimos/máximos de entrega estimada para productos de afiliado (Merchant). */
export const AFFILIATE_SHIPPING_MIN_DAYS = 7
export const AFFILIATE_SHIPPING_MAX_DAYS = 15

/** Días para devolución del producto (Merchant Return Policy). */
export const MERCHANT_RETURN_DAYS = 30



// ---------- SEO / Redes sociales ----------

/**
 * Imagen social (og:image / twitter:image) por defecto: 1200x630 con el
 * wordmark y el claim de marca. Generada por scripts/optimize-logos.mjs.
 * Sin esta imagen, compartir la web en WhatsApp/Facebook/X muestra un hueco.
 */
export const OG_IMAGE_PATH = '/og/zonadehobbies-og.jpg'

/**
 * Autor por defecto de los contenidos editoriales (firma visible E-E-A-T).
 * ------------------------------------------------------------------
 * POR QUÉ es configurable por entorno: la firma es una decisión de MARCA (el
 * nombre de la tienda, del equipo o de una persona) y no debe estar quemada en
 * el código. Se usa en dos sitios:
 *  1) Al generar/crear contenido con IA (guías y hubs) se firma con este valor.
 *  2) El panel PRERRELLENA el campo con él, así aparece lleno desde el inicio
 *     y el administrador puede cambiarlo entrada por entrada.
 * Variable: NEXT_PUBLIC_DEFAULT_AUTHOR (pública a propósito: no es un secreto y
 * el editor —que es cliente— necesita leerla para prerrellenar el campo).
 */
export const DEFAULT_AUTHOR = process.env.NEXT_PUBLIC_DEFAULT_AUTHOR?.trim() || 'Equipo editorial'

/**
 * Nº máximo de categorías que muestra la grilla del inicio.
 * POR QUÉ: con 200 categorías, volcarlas todas satura la portada, diluye el
 * enlazado interno y hunde la conversión. Mostramos una vitrina curada + un
 * botón "ver todas" hacia /catalogo (mejor UX y mejor SEO).
 */
export const HOMEPAGE_CATEGORY_GRID_LIMIT = 12

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
export const SITEMAP_REVALIDATE_SECONDS = 86400

// ---------- Caché de datos públicos (lecturas repetidas) ----------

/**
 * Revalidación (segundos) de los datos públicos que se leen MUCHAS veces:
 * configuración del sitio (site_settings) y navegación de categorías.
 * ------------------------------------------------------------------
 * POR QUÉ existe: son datos idénticos para todas las páginas y se consultaban
 * una y otra vez (site_settings se leía 4 veces por render: root shell, metadata
 * raíz, metadata de página y la propia página). Con ~2.000 páginas estáticas eso
 * eran miles de round-trips a Supabase (≈250 ms cada uno): la causa real de que
 * el build tardara minutos. Memoizados por idioma, el build hace 6 consultas.
 * 5 min: el mismo ciclo que el ISR de la tienda (no añade retardo nuevo).
 */
export const PUBLIC_DATA_REVALIDATE_SECONDS = 300

/** Etiqueta de caché de site_settings (se invalida al guardar en el panel). */
export const SITE_SETTINGS_CACHE_TAG = 'site-settings'

/** Etiqueta de caché de la navegación de categorías (se invalida al editar categorías). */
export const CATEGORY_NAV_CACHE_TAG = 'category-nav'

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

/**
 * Máximo de tokens de salida del traductor de contenido.
 * Debe cubrir, en UNA sola respuesta, todos los idiomas pendientes con su
 * contenido COMPLETO: nombre, título SEO, cuerpo de la ficha (descripción HTML)
 * y FAQ/guía del hub. Con 1600 el cuerpo HTML se truncaba en cuanto había más de
 * un idioma destino, por eso se dimensiona para varias fichas largas.
 */
export const TRANSLATION_MAX_TOKENS = 8000

/**
 * Idiomas por llamada al traducir contenido LARGO (artículos de guías).
 * ------------------------------------------------------------------
 * POR QUÉ existe: pedir 5 idiomas en UNA sola llamada para un artículo de
 * ~6.000 caracteres de HTML + FAQ desborda el límite de tokens de salida
 * (finish_reason = 'length'): la respuesta se corta a la mitad y el JSON llega
 * incompleto → error 500. Con un lote pequeño cada respuesta cabe entera; el
 * número de llamadas sigue siendo proporcional a los idiomas pendientes.
 */
export const TRANSLATION_LOCALE_BATCH_SIZE = 2

/**
 * Máximo de tokens de salida al REDACTAR el nombre de una categoría en el idioma
 * raíz. Es una sola línea corta (2-5 palabras), así que no comparte el
 * presupuesto de 8k del traductor de fichas y artículos completos.
 */
export const TRANSLATION_NAME_MAX_TOKENS = 400

/** Nº máximo de entidades a traducir por lote (controla el coste de tokens). */
export const TRANSLATION_BATCH_SIZE = 10

/** Slug del módulo "Idiomas de Categorías" (traducciones) para permisos RBAC. */
export const CATEGORY_I18N_MODULE_SLUG = 'categorias_idiomas'

/**
 * Entidades (producto o categoría) que traduce el botón "Traducir pendientes"
 * del panel por cada tanda. Se mantiene BAJO a propósito para acotar la duración
 * de cada petición HTTP; el cliente repite tandas hasta terminar, mostrando el
 * progreso en vivo.
 */
export const I18N_PENDING_BATCH_LIMIT = 5

/** Endpoint del modelo de traducción (DeepSeek, API compatible con OpenAI). */
export const TRANSLATION_API_URL = 'https://api.deepseek.com/v1/chat/completions'

/** Modelo de chat usado para traducir contenido. */
export const TRANSLATION_MODEL = 'deepseek-chat'

// ---------- Indexación en buscadores (Google / IndexNow) ----------

/**
 * Slug del módulo admin "Indexación en Buscadores" para permisos RBAC.
 * Los botones de envío a buscadores y el vaciado de la cola se protegen con
 * este slug (read = ver el panel; write = sincronizar/enviar lotes/auditar;
 * delete = limpiar históricos).
 */
export const SEO_INDEXING_MODULE_SLUG = 'seo_indexing'

/**
 * Tope diario de envíos a buscadores (IndexNow / Indexing API) desde el panel.
 * ------------------------------------------------------------------
 * POR QUÉ 100 por defecto: se mantiene muy por debajo de las cuotas de los
 * buscadores (IndexNow admite lotes enormes y la Indexing API arranca en
 * 200/día) para no parecer "spam a escala" ni agotar la cuota de pruebas de
 * Google. El panel muestra la cuota restante en vivo y bloquea al agotarse.
 *
 * Configurable por instalación con `NEXT_PUBLIC_INDEXING_DAILY_LIMIT` (se usa
 * el prefijo NEXT_PUBLIC para que el servidor y la interfaz lean EXACTAMENTE el
 * mismo número; si se sube mucho, los buscadores pueden marcar la práctica
 * como abusiva y limitar el acceso).
 */
export const INDEXING_DAILY_LIMIT = Number(process.env.NEXT_PUBLIC_INDEXING_DAILY_LIMIT) || 100

/**
 * URLs que se envían (o inspeccionan) por tanda desde el panel.
 * El cliente repite tandas hasta vaciar la cola, igual que en traducciones.
 * Configurable por instalación con `NEXT_PUBLIC_INDEXING_BATCH_SIZE`.
 */
export const SEO_INDEXING_BATCH_SIZE = Number(process.env.NEXT_PUBLIC_INDEXING_BATCH_SIZE) || 25

/**
 * Máximo de URLs del sitemap que se importan a la cola en una sincronización.
 * Evita traer miles de filas de golpe (lotes de 25 en 25 hasta completar).
 */
export const SEO_INDEXING_SYNC_LIMIT = 1000

/**
 * Reintentos máximos por URL antes de marcarla como `error` definitivo.
 * 3 cubre caídas puntuales de red o un 429 sin castigar la cuota.
 */
export const SEO_INDEXING_MAX_ATTEMPTS = 3

/** Milisegundos que se espera como MÁXIMO por una llamada a un buscador en el
 * camino de publicación. Si el buscador tarda más, la publicación NO se
 * bloquea: la URL queda en cola y el panel la reintenta.
 */
export const SEO_INDEXING_REQUEST_TIMEOUT_MS = 8000

/**
 * Milisegundos máximos de espera al leer el sitemap publicado (/sitemap.xml).
 * Es la fuente de verdad de la sincronización; si tarda más (build/offline),
 * se cae al origen de datos interno (los mismos servicios que generan el XML).
 */
export const SEO_INDEXING_SITEMAP_TIMEOUT_MS = 10_000

/**
 * Prioridad que recibe una URL publicada por la IA o el panel.
 * Se envía ANTES que el histórico del sitemap (prioridad 0), que se envía por
 * tandas hasta vaciarse.
 */
export const INDEXING_PUBLICATION_PRIORITY = 100

/**
 * Rutas estáticas que también entran al sitemap y, por tanto, se auditan.
 * Se usan como respaldo cuando no se puede leer el sitemap publicado.
 */
export const INDEXING_STATIC_PAGE_PATHS = ['/', '/catalogo', '/guias'] as const

/**
 * Minutos tras los cuales un lote marcado 'enviando' se considera abandonado
 * (request caída/timeout) y se devuelve a 'pendiente' para reintentarlo.
 */
export const INDEXING_STALE_BATCH_MINUTES = 15

/** Endpoint de IndexNow (protocolo compartido por Bing, Yandex, Seznam y Naver). */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'

/** Endpoint de la Indexing API de Google (solo JobPosting/BroadcastEvent). */
export const GOOGLE_INDEXING_API_ENDPOINT = 'https://indexing.googleapis.com/v3/urlNotifications'

/** Endpoint de la URL Inspection API de Search Console (SOLO lectura). */
export const GOOGLE_URL_INSPECTION_ENDPOINT =
  'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'

/** Endpoint de la API de sitemaps de Search Console (re-envío del sitemap). */
export const GOOGLE_SEARCH_CONSOLE_SITEMAPS_ENDPOINT = 'https://searchconsole.googleapis.com/webmasters/v3/sites'

/** Endpoint OAuth2 de Google para canjear el JWT de la cuenta de servicio. */
export const GOOGLE_OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/** Alcances (scopes) que solicita la cuenta de servicio de indexación. */
export const GOOGLE_INDEXING_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/indexing',
  'https://www.googleapis.com/auth/webmasters',
] as const

/** Validez en segundos del token OAuth2 cacheado en memoria (Google da 1 hora). */
export const GOOGLE_OAUTH_TOKEN_TTL_SECONDS = 3300

/** Validez en segundos de la caché del token: se renueva 5 min antes por seguridad. */
export const GOOGLE_OAUTH_TOKEN_REFRESH_MARGIN_SECONDS = 300

/** Ruta pública del sitemap (fuente de verdad de las URLs que "deben" indexarse). */
export const SITEMAP_PATH = '/sitemap.xml'

/**
 * Etiquetas legibles de los tipos de contenido indexable.
 * Se usan en el panel y en los registros para no quemar literales en la UI.
 */
export const INDEXING_CONTENT_TYPE_LABELS = {
  producto: 'Producto',
  categoria: 'Categoría',
  guia: 'Guía o comparativa',
  pagina: 'Página',
  job_posting: 'Oferta de empleo',
  broadcast_event: 'Emisión en directo',
} as const

/** Etiquetas legibles de los estados de la cola de indexación. */
export const INDEXING_STATUS_LABELS = {
  pendiente: 'Pendiente',
  enviado: 'Enviado',
  indexado: 'Indexado',
  no_indexado: 'Sin indexar',
  excluido: 'Excluido (noindex)',
  error: 'Error',
} as const

