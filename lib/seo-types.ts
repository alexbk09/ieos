/**
 * Tipos compartidos del módulo SEO.
 * ------------------------------------------------------------------
 * Se aíslan aquí para romper dependencias circulares entre la capa de
 * servicios (catalog / seo-content / seo-hub) sin duplicar la forma
 * del dato. Todo el frontend consume esta misma forma serializable.
 */

/** Pregunta/respuesta frecuente generada por la IA (alimenta FAQPage JSON-LD). */
export type SeoFaqItem = {
  pregunta: string
  respuesta: string
}
