// ============================================================
// Generador de Schema.org Product (JSON-LD) para la página de
// producto /productos/[slug].
//
// POR QUÉ existe este módulo:
//  - Mantiene el marcado estructurado AISLADO y TESTEABLE.
//  - Convierte (en servidor) los metadatos reales de la tabla
//    products en el formato que exige Google, evitando
//    penalizaciones por contenido automatizado (los datos son
//    frescos, visibles y consistentes con la UI).
//  - Limpia el HTML de la descripción ANTES de emitirla.
//  - Mapea metadatos físicos (peso/dimensiones) en
//    additionalProperty (PropertyValue), como pide pSEO.
//
// NOTA DE ADAPTACIÓN (discrepancia de nomenclatura):
// En esta base de datos la tabla se llama `products` (no
// `productos_afiliados`) y la galería vive en `product_images`
// (relación normalizada con color_name), NO en una columna
// JSONB. Este helper es agnóstico: solo recibe un producto plano.
// ============================================================

import {
  STORE_COUNTRY_CODE,
  AFFILIATE_SHIPPING_MIN_DAYS,
  AFFILIATE_SHIPPING_MAX_DAYS,
  MERCHANT_RETURN_DAYS,
} from '@/lib/constants'

// ---------- Tipos del producto mínimo para el schema ----------
export type SchemaProduct = {
  id: string
  name: string
  slug: string
  description: string | null
  price_usd: number
  /** Precio original/referencia en USD (precio tachado). */
  precio_original?: number | null
  stock: number
  /** Umbral desde el que el stock se considera "disponibilidad limitada". */
  low_stock_threshold?: number | null
  pricing_type?: 'unit' | 'weight'
  /** Inventario en gramos (solo si pricing_type = 'weight'). */
  stock_grams?: number | null
  image_url: string | null
  url_afiliado_ali?: string | null
  url_afiliado_amazon?: string | null
  url_afiliado_store?: string | null
  specifications?: Record<string, string>
  /** Peso del producto en texto libre (ej: "0.8 kg"). */
  peso?: string | null
  /** Tamaño / dimensiones en texto libre (ej: "50 x 50 cm"). */
  tamaño?: string | null
  /** Peso neto en gramos (numérico, más preciso para Google). */
  weight_grams?: number | null
  categories?: { id: string; name: string; slug?: string | null }[]
  /** Marca resuelta por la relación FK. */
  marca?: { id: string; nombre: string } | null
  images?: {
    id?: string
    url: string
    alt_text?: string | null
    sort_order?: number
    color_name?: string | null
  }[]
  sku?: string | null
  /**
   * Disponibilidad verificada en el marketplace de afiliado (migración 0058).
   * 'unavailable' → se emite `OutOfStock` aunque exista stock local placeholder,
   * porque el producto ya no es comprable en AliExpress (evita el "content
   * mismatch" que Google penaliza).
   */
  ali_status?: 'ok' | 'unavailable' | null
  /**
   * Valoración media real en escala 0-5 (migración 0052). Solo se emite
   * AggregateRating cuando este dato Y el nº de valoraciones son reales.
   */
  rating_average?: number | null
  /** Número de valoraciones reales reportadas por el marketplace. */
  rating_count?: number | null
}

/** Datos de la organización que opera la tienda. */
export type SchemaOrganization = { name?: string | null; url?: string | null }

// ---------- Constantes de vocabulario (nada mágico) ----------
const SCHEMA_URL = {
  InStock: 'https://schema.org/InStock',
  LimitedAvailability: 'https://schema.org/LimitedAvailability',
  OutOfStock: 'https://schema.org/OutOfStock',
  NewCondition: 'https://schema.org/NewCondition',
} as const

const OFFER_VALIDITY_DAYS = 30 as const

// ---------- Helpers puros ----------

/**
 * Convierte HTML arbitrario a texto plano legible.
 * Pensado para correr en Server Components (sin acceso a DOM).
 * Elimina etiquetas, normaliza entidades HTML y espacios.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

/**
 * Convierte secuencias de entidad HTML a su carácter literal.
 * Soporta entidades nombradas comunes y referencias numéricas
 * decimales/hexadecimales. Cualquier otra secuencia se conserva
 * tal cual (escrita de forma segura para Server Components).
 */
function decodeHtmlEntities(value: string): string {
  const AMP = String.fromCharCode(38) // '&'

  const namedEnt: Record<string, string> = {
    amp: String.fromCharCode(38), // '&'
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    copy: '©',
    reg: '®',
    trade: '™',
  }

  let result = ''
  let index = 0
  while (index < value.length) {
    const start = value.indexOf(AMP, index)
    if (start === -1) {
      result += value.slice(index)
      break
    }

    result += value.slice(index, start)

    const semi = value.indexOf(';', start + 1)
    if (semi === -1 || semi - start > 16) {
      // Sin cierre de entidad o token demasiado largo: se conserva el carácter.
      result += AMP
      index = start + 1
      continue
    }

    const token = value.slice(start + 1, semi)
    let replacement: string | null = null

    if (token.startsWith('#x') || token.startsWith('#X')) {
      const code = parseInt(token.slice(2), 16)
      if (Number.isFinite(code)) replacement = String.fromCodePoint(code)
    } else if (token.startsWith('#')) {
      const code = parseInt(token.slice(1), 10)
      if (Number.isFinite(code)) replacement = String.fromCodePoint(code)
    } else if (Object.prototype.hasOwnProperty.call(namedEnt, token.toLowerCase())) {
      replacement = namedEnt[token.toLowerCase()]
    }

    if (replacement !== null) {
      result += replacement
      index = semi + 1
    } else {
      // Entidad desconocida: se conserva literal y se avanza un carácter.
      result += AMP
      index = start + 1
    }
  }
  return result
}

/** Recorta un texto sin cortar palabras (limita longitud del meta description). */
export function clampText(text: string, maxLength = 300): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxLength) return clean
  const cut = clean.slice(0, maxLength + 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength)}…`
}

/**
 * Convierte una ruta de imagen (relativa o absoluta) a URL absoluta.
 * Google exige URLs absolutas en el marcado JSON-LD.
 */
export function toAbsoluteUrl(value: string | null | undefined, origin: string): string {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  const cleanOrigin = origin.replace(/\/+$/, '')
  const cleanPath = value.startsWith('/') ? value : `/${value}`
  return `${cleanOrigin}${cleanPath}`
}

/**
 * Resuelve la URL de afiliado preferida. Como es una página de
 * AliExpress (petición original), el orden es AliExpress → Amazon
 * → tienda oficial, replicando la lógica de lib/affiliate.ts
 * sin importar de la capa de React.
 */
export function resolveAffiliateUrl(product: SchemaProduct): string | null {
  return product.url_afiliado_ali ?? product.url_afiliado_amazon ?? product.url_afiliado_store ?? null
}

/** Nombre legible del marketplace que se muestra como seller del Offer. */
export function marketplaceLabel(url: string | null): string {
  if (!url) return 'Tienda oficial'
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('aliexpress')) return 'AliExpress'
    if (host.includes('amazon')) return 'Amazon'
  } catch {
    // URL inválida: se usa el nombre genérico.
  }
  return 'Tienda oficial'
}

/**
 * Resuelve la disponibilidad del schema según stock/gramos.
 * - product weight: gramos disponibles.
 * - product unit: unidades disponibles.
 */
export function resolveAvailability(product: SchemaProduct): string {
  // Producto caído en el marketplace de afiliado (migración 0058): la ficha se
  // degrada y se declara OutOfStock ANTES de mirar el stock local, que en los
  // productos importados es un placeholder de conveniencia, no inventario real.
  if (product.ali_status === 'unavailable') return SCHEMA_URL.OutOfStock

  const isWeight = product.pricing_type === 'weight'
  const available = isWeight ? Number(product.stock_grams ?? 0) > 0 : Number(product.stock) > 0
  if (!available) return SCHEMA_URL.OutOfStock

  const threshold = Number(product.low_stock_threshold ?? 10)
  const stock = isWeight ? Number(product.stock_grams ?? 0) : Number(product.stock)
  if (stock <= threshold) return SCHEMA_URL.LimitedAvailability
  return SCHEMA_URL.InStock
}

/**
 * Construye las `additionalProperty` del Schema.org Product:
 * mapea los metadatos físicos (peso y dimensiones) en pares
 * clave-valor dinámicos, tal como pide Google con PropertyValue.
 * Cuando hay peso numérico exacto se usa QuantitativeValue
 * (mejor semántica para peso), evitando duplicar el texto libre.
 */
export function buildPhysicalProperties(product: SchemaProduct): Record<string, unknown>[] {
  const props: Record<string, unknown>[] = []

  // Peso numérico real (más fiable que el campo de texto libre).
  const grams = Number(product.weight_grams)
  if (Number.isFinite(grams) && grams > 0) {
    props.push({
      '@type': 'PropertyValue',
      name: 'Peso neto',
      value: {
        '@type': 'QuantitativeValue',
        value: grams,
        unitCode: 'GRM',
        unitText: 'g',
      },
    })
  } else if (product.peso?.trim()) {
    // Fallback: peso descrito por el admin (ej: "0.8 kg").
    props.push({ '@type': 'PropertyValue', name: 'Peso', value: product.peso.trim() })
  }

  // Dimensiones / tamaño (ej: "50 x 50 cm").
  if (product.tamaño?.trim()) {
    props.push({ '@type': 'PropertyValue', name: 'Dimensiones', value: product.tamaño.trim() })
  }

  // specifications JSONB: se mapea dinámicamente en pares clave-valor.
  const specs = product.specifications ?? {}
  for (const [key, value] of Object.entries(specs)) {
    const name = key.trim()
    const cleanValue = value?.trim()
    if (!name || !cleanValue) continue
    props.push({ '@type': 'PropertyValue', name, value: cleanValue })
  }

  return props
}

/**
 * Construye el bloque `offers`:
 * - Un solo Offer canónico con el precio base REAL (price_usd).
 * - Si existe precio original mayor (precio tachado), se usa
 *   AggregateOffer con lowPrice = precio base y highPrice =
 *   precio original para que Google entienda el descuento.
 * La URL apunta SIEMPRE al enlace de afiliado externo (AliExpress).
 */
export function buildOffersNode(
  product: SchemaProduct,
  affiliateUrl: string | null,
  sellerName: string,
  priceValidUntil: string,
): Record<string, unknown> {
  const basePrice = Number(product.price_usd) || 0
  const originalPrice = Number(product.precio_original ?? 0)

  const shared = {
    priceCurrency: 'USD',
    url: affiliateUrl && affiliateUrl.trim().length > 0 ? affiliateUrl.trim() : undefined,
    availability: resolveAvailability(product),
    itemCondition: SCHEMA_URL.NewCondition,
    seller: { '@type': 'Organization', name: sellerName || 'AliExpress' },
    priceValidUntil,
    // Merchant / Rich Results: envío estimado y política de devolución.
    // Se declaran datos REALES de operación (no se inventan precios de envío).
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: STORE_COUNTRY_CODE },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
        transitTime: {
          '@type': 'QuantitativeValue',
          minValue: AFFILIATE_SHIPPING_MIN_DAYS,
          maxValue: AFFILIATE_SHIPPING_MAX_DAYS,
          unitCode: 'DAY',
        },
      },
    },
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: STORE_COUNTRY_CODE,
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: MERCHANT_RETURN_DAYS,
    },
  }

  if (originalPrice > basePrice) {
    return {
      '@type': 'AggregateOffer',
      ...shared,
      lowPrice: basePrice.toFixed(2),
      highPrice: originalPrice.toFixed(2),
      offerCount: 1,
    }
  }

  return { '@type': 'Offer', ...shared, price: basePrice.toFixed(2) }
}

/**
 * Recolecta las imágenes que se publicarán en el schema.
 * Prioriza las imágenes generales y añade (hasta 8) una imagen
 * por color con su URL absoluta. Des-duplica URLs.
 */
export function buildImageList(product: SchemaProduct, origin: string): string[] {
  const urls: string[] = []

  // Imágenes generales primero (sin color)…
  const general = (product.images ?? [])
    .filter((img) => !img.color_name)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // …y después una representación por color.
  const seenColor = new Set<string>()
  const colored: typeof general = []
  for (const img of product.images ?? []) {
    if (img.color_name && !seenColor.has(img.color_name)) {
      seenColor.add(img.color_name)
      colored.push(img)
    }
  }

  const ordered = [...general, ...colored]
  if (ordered.length === 0 && product.image_url) {
    ordered.push({ url: product.image_url })
  }

  for (const img of ordered.slice(0, 8)) {
    const absolute = toAbsoluteUrl(img.url, origin)
    if (absolute && !urls.includes(absolute)) urls.push(absolute)
  }
  return urls
}

/**
 * Genera la descripción ideal para el schema: texto limpio mínimo
 * de 50 caracteres (Google descarta descripciones demasiado cortas).
 */
function ensureDescription(product: SchemaProduct): string {
  const clean = clampText(htmlToPlainText(product.description), 1000)
  if (clean.length >= 50) return clean
  const category = product.categories?.[0]?.name
  const suffix = category ? ` disponible en la categoría ${category}.` : ''
  return clean.length > 0
    ? `${clean}${suffix}`
    : `${product.name}: producto disponible${suffix}`.trim()
}

/**
 * Construye el bloque `aggregateRating` del schema.
 * Devuelve null (y por tanto NO se emite) cuando faltan datos reales, para
 * cumplir la política de Google: nunca inventar reseñas ni valoraciones.
 * Requiere AMBOS: media válida (0-5) y nº de valoraciones > 0.
 */
export function buildAggregateRating(product: SchemaProduct): Record<string, unknown> | null {
  const rating = Number(product.rating_average)
  const count = Number(product.rating_count)
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return null
  if (!Number.isFinite(count) || count <= 0) return null
  return {
    '@type': 'AggregateRating',
    ratingValue: rating.toFixed(1),
    reviewCount: Math.round(count),
    bestRating: 5,
    worstRating: 1,
  }
}

/**
 * Construye el objeto JSON-LD completo de Schema.org Product.
 * @param product Metadatos REALES del producto (desde Supabase).
 * @param origin Origin absoluto del deploy (para canonical/robots).
 * @param organization Nombre/URL de la organización propietaria.
 * @param referenceDate Fecha de generación (para priceValidUntil).
 */
export function buildProductSchema(input: {
  product: SchemaProduct
  origin: string
  organization?: SchemaOrganization
  referenceDate?: Date
}): Record<string, unknown> {
  const { product, origin, organization } = input
  const referenceDate = input.referenceDate ?? new Date()
  const affiliateUrl = resolveAffiliateUrl(product)

  // Fecha límite del precio (30 días desde la generación del HTML).
  const validUntil = new Date(referenceDate.getTime())
  validUntil.setDate(validUntil.getDate() + OFFER_VALIDITY_DAYS)

  // Canonical en el propio sitio (la URL que ve el usuario).
  const productUrl = `${origin.replace(/\/+$/, '')}/productos/${product.slug}`

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': productUrl,
    name: product.name,
    description: ensureDescription(product),
    url: productUrl,
    image: buildImageList(product, origin),
  }

  // Marca (única si el admin la resolvió; nunca se inventa).
  if (product.marca?.nombre?.trim()) {
    schema.brand = { '@type': 'Brand', name: product.marca.nombre.trim() }
  }

  // SKU opcional del producto (identificador interno del catálogo).
  if (product.sku?.trim()) {
    schema.sku = product.sku.trim()
  }

  // Oferta: si el producto está visible es porque hay un precio base.
  schema.offers = buildOffersNode(
    product,
    affiliateUrl,
    marketplaceLabel(affiliateUrl),
    validUntil.toISOString().slice(0, 10),
  )

  // Propiedades físicas clave-valor (peso, dimensiones y specs).
  const physical = buildPhysicalProperties(product)
  if (physical.length > 0) {
    schema.additionalProperty = physical
  }

  // AggregateRating: SOLO con datos REALES y visibles de valoraciones
  // (nunca se inventan reseñas → se evita el riesgo de penalización pSEO).
  const aggregateRating = buildAggregateRating(product)
  if (aggregateRating) {
    schema.aggregateRating = aggregateRating
  }

  // Proveedor de la tienda (organización dueña del catálogo).
  if (organization?.name) {
    schema.provider = { '@type': 'Organization', name: organization.name }
  }

  return schema
}

// ---------- Breadcrumb y FAQ (Rich Results extra) ----------
// La construcción pura vive en lib/seo-rules.mjs (testeable con node --test).
// Se re-exporta aquí para que las páginas importen todo el schema desde un
// único módulo (@/lib/schema/product-schema).

/** Un nivel de la miga de pan estructurada. */
export type BreadcrumbItem = { name: string; url: string }

export { buildBreadcrumbSchema, buildFaqSchema } from '@/lib/seo-rules'