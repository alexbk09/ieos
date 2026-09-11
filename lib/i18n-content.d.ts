/**
 * Declaración de tipos para lib/i18n-content.mjs.
 * Resolución de contenido traducido (columnas *_i18n JSONB) con fallback.
 */

/** Opciones de resolución de traducciones (fuente: lib/constants.ts). */
export type LocalizedResolveOptions = {
  /** Idioma raíz / puente (nunca visible salvo como último fallback). */
  sourceLocale?: string
  /** Idioma por defecto del sitio. */
  defaultLocale?: string
}

/** Opciones de generación de slug localizado (incluye las de resolución + slugify). */
export type LocalizedSlugOptions = LocalizedResolveOptions & {
  fallbackPrefix?: string
  stamp?: number
}

/** Resuelve un texto traducido con cadena de fallback (pedido → default → raíz). */
export function resolveLocalizedValue(
  i18n: Record<string, string> | null | undefined,
  locale: string,
  options?: LocalizedResolveOptions,
): string

/** Resuelve una lista traducida con la misma cadena de fallback. */
export function resolveLocalizedList<T = unknown>(
  i18n: Record<string, T[]> | null | undefined,
  locale: string,
  options?: LocalizedResolveOptions,
): T[]

/**
 * Resuelve los campos traducibles de un producto (name/titulo_seo/description y
 * seo_faq) inyectando el dato base como idioma raíz para que el fallback no
 * caiga en otro idioma.
 */
export function resolveProductTranslations(
  translations:
    | Record<
        string,
        { name?: string; titulo_seo?: string; description?: string; seo_faq?: { pregunta: string; respuesta: string }[] }
      >
    | null
    | undefined,
  base: {
    name?: string | null
    titulo_seo?: string | null
    description?: string | null
    seo_faq?: { pregunta: string; respuesta: string }[] | null
  },
  locale: string,
  options?: LocalizedResolveOptions,
): {
  name: string
  titulo_seo: string
  description: string
  seo_faq: { pregunta: string; respuesta: string }[]
}

/** Genera el slug localizado a partir del nombre traducido del idioma pedido. */
export function buildLocalizedSlug(
  namesI18n: Record<string, string> | null | undefined,
  locale: string,
  options?: LocalizedSlugOptions,
): string
