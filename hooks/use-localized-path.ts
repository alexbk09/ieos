'use client'

import { useCallback } from 'react'
import { buildLocalizedPath, SUPPORTED_LOCALES } from '@/lib/i18n-config'
import { useLocale } from '@/components/i18n-provider'

/**
 * Hook de enlazado interno multilenguaje (SEO internacional).
 * ------------------------------------------------------------------
 * POR QUÉ existe: TODOS los enlaces internos de una página deben apuntar a la
 * MISMA versión de idioma que se está viendo. Si una página /fr enlaza a
 * `/productos/x` (sin prefijo = español), Google descubre el español desde el
 * francés, se rompe el grafo de idiomas y el hreflang queda inconsistente.
 *
 * La estrategia es "as-needed" (procura): el idioma por defecto NO lleva
 * prefijo, el resto SÍ. Se memoiza para no recrear la función en cada render.
 *
 * Es idempotente y seguro con enlaces externos/anchas o ya prefijados, por lo
 * que puede aplicarse también a los enlaces que configura el admin (nav_links):
 *   - 'https://…', 'mailto:…', '#ancla', '//cdn…' → se devuelven intactos.
 *   - '/fr/catalogo' (ya prefijado) → intacto (nunca '/fr/fr/…').
 *
 * @example const href = useLocalizedPath(); <a href={href(`/productos/${slug}`)} />
 */
export function useLocalizedPath(): (path: string) => string {
  const locale = useLocale()
  return useCallback(
    (path: string) => {
      const value = String(path ?? '')
      // Rutas no internas (externas, anclas, protocolos) no se localizan.
      if (!value.startsWith('/') || value.startsWith('//')) return value
      // Ya trae prefijo de un idioma soportado: se respeta (evita doble prefijo).
      const firstSegment = value.split('/').filter(Boolean)[0]
      if (firstSegment && SUPPORTED_LOCALES.includes(firstSegment)) return value
      return buildLocalizedPath(value, locale, { prefixDefaultLocale: false })
    },
    [locale],
  )
}

