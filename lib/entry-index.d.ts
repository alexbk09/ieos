/**
 * Declaración de tipos para lib/entry-index.mjs.
 * Lógica pura del ÍNDICE de guías (/guias): búsqueda tolerante a acentos,
 * filtros por tipo/nicho, orden y paginación con huecos.
 */

/** Forma mínima que necesita el índice (el servicio entrega mucho más). */
export type EntryIndexLike = {
  titulo: string
  resumen?: string | null
  /** Gancho editorial ("para pisos pequeños", "regalo original"). */
  angulo?: string | null
  /** Tipo de entrada (ver ENTRY_TYPES). */
  tipo?: string | null
  /** Palabras clave long-tail de la entrada. */
  keywords?: string[] | null
  lecturaMinutos?: number | null
  /** Fecha de publicación ISO. */
  publicadoEn?: string | null
  categorias?: { id: string; name: string }[] | null
}

/** Filtros activos del índice (arrays vacíos = sin filtro). */
export type EntryIndexFiltros = {
  consulta?: string
  tipos?: string[]
  nichos?: string[]
}

/** Resultado paginado con la metadata que pinta el paginador. */
export type EntryIndexPage<T> = {
  items: T[]
  pagina: number
  totalPaginas: number
  total: number
  /** Posición 1-based del primer elemento visible (0 si no hay resultados). */
  desde: number
  /** Posición 1-based del último elemento visible. */
  hasta: number
}

/** Normaliza un texto para comparar búsquedas (acentos, mayúsculas y signos). */
export function normalizarBusquedaTexto(valor: unknown): string

/** Texto buscable de una entrada (título + resumen + ángulo + keywords + nichos). */
export function textoBuscableEntrada(item: EntryIndexLike): string

/** Filtra por consulta libre (AND por términos), tipos y nichos. */
export function filtrarEntradas<T extends EntryIndexLike>(
  items: T[],
  filtros?: EntryIndexFiltros,
): T[]

/** Ordena sin mutar ('az' | 'reading' | cualquier otro = más recientes). */
export function ordenarEntradas<T extends EntryIndexLike>(
  items: T[],
  orden?: string,
  locale?: string,
): T[]

/** Pagina la lista y acota la página pedida al rango válido. */
export function paginar<T>(items: T[], pagina?: number, tamanoPagina?: number): EntryIndexPage<T>

/** Números de página a pintar (null = elipsis), conservando primera y última. */
export function numerosDePagina(
  pagina: number,
  totalPaginas: number,
  maxVisibles?: number,
): (number | null)[]
