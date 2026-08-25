'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Search, SearchX } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Definición de columna para la tabla. */
export type TableColumn<T> = {
  /** Clave única de la columna. */
  key: string
  /** Título visible en el encabezado. */
  header: string
  /** Render del valor de la celda. */
  render: (item: T) => ReactNode
  /** Clases extra para el encabezado. */
  headerClassName?: string
  /** Clases extra para la celda. */
  cellClassName?: string
  /** Habilita ordenamiento por esta columna. */
  sortable?: boolean
  /** Accesor para ordenar. Por defecto usa item[key]. */
  sortValue?: (item: T) => string | number
  /** Oculta la columna en móvil. */
  hiddenMobile?: boolean
}

type DataTableProps<T> = {
  /** Datos a mostrar. */
  data: T[]
  /** Columnas de la tabla. */
  columns: TableColumn<T>[]
  /** Clave única de cada fila. */
  rowKey: (item: T) => string
  /** Placeholder del buscador. */
  searchPlaceholder?: string
  /** Función de búsqueda. Filtra por las propiedades indicadas. */
  searchKeys?: (item: T) => string
  /** Texto cuando no hay resultados. */
  emptyMessage?: string
  /** Texto cuando la lista está vacía sin filtros. */
  noDataMessage?: string
  /** Estado de carga. */
  loading?: boolean
  /** Número de filas por página. Por defecto 8. */
  pageSize?: number
  /** Acciones adicionales en la barra de herramientas (filtros, etc). */
  toolbar?: ReactNode
  /** Callback al hacer click en una fila. */
  onRowClick?: (item: T) => void
  /** Notifica los datos filtrados actuales (después de búsqueda/orden). Útil para exportar solo lo visible. */
  onFilteredChange?: (items: T[]) => void
}

/**
 * DataTable premium reutilizable con:
 * - Búsqueda instantánea
 * - Ordenamiento por columnas
 * - Paginación
 * - Scroll vertical interno
 * - Estados de carga (skeleton) y vacío
 * - Responsive con scroll horizontal en móviles
 */
export function DataTable<T>({
  data,
  columns,
  rowKey,
  searchPlaceholder = 'Buscar…',
  searchKeys,
  emptyMessage = 'No se encontraron resultados',
  noDataMessage = 'Aún no hay registros',
  loading = false,
  pageSize = 8,
  toolbar,
  onRowClick,
  onFilteredChange,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)

  // Mantiene la última referencia del callback para no re-disparar el efecto
  // cuando el padre pasa una función distinta en cada render.
  const onFilteredChangeRef = useRef(onFilteredChange)
  onFilteredChangeRef.current = onFilteredChange

  // Filtrar por búsqueda
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return data
    if (!searchKeys) return data
    return data.filter((item) => searchKeys(item).toLowerCase().includes(term))
  }, [data, search, searchKeys])

  /** Notifica al padre los datos que quedan visibles tras aplicar búsqueda y orden. */
  useEffect(() => {
    onFilteredChangeRef.current?.(filtered)
  }, [filtered])

  // Ordenar
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const column = columns.find((c) => c.key === sortKey)
    if (!column) return filtered

    return [...filtered].sort((a, b) => {
      const av = column.sortValue ? column.sortValue(a) : String((a as Record<string, unknown>)[sortKey] ?? '')
      const bv = column.sortValue ? column.sortValue(b) : String((b as Record<string, unknown>)[sortKey] ?? '')
      const result = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? result : -result
    })
  }, [filtered, sortKey, sortDir, columns])

  // Paginar
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages - 1)
  const paged = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  /** Alterna el orden al hacer click en una columna ordenable. */
  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(0)
  }

  /** Muestra el ícono de orden de una columna. */
  function sortIcon(key: string) {
    if (sortKey !== key) return <ChevronsUpDown size={13} className="ml-1 text-muted-foreground/50" />
    return sortDir === 'asc' ? <ChevronUp size={13} className="ml-1" /> : <ChevronDown size={13} className="ml-1" />
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Barra de herramientas: búsqueda + acciones */}
      {(searchKeys || toolbar) && (
        <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          {searchKeys && (
            <div className="relative w-full sm:max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(0)
                }}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {/* Tabla con scroll */}
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border/70 text-xs uppercase tracking-wider text-muted-foreground">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn('px-4 py-3 font-medium', col.hiddenMobile && 'hidden md:table-cell', col.headerClassName)}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center transition-colors hover:text-foreground"
                    >
                      {col.header}
                      {sortIcon(col.key)}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Skeleton de carga */}
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-border/50">
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-4', col.hiddenMobile && 'hidden md:table-cell')}>
                      <div className="h-4 animate-pulse rounded-lg bg-muted" style={{ width: `${60 + ((i * 13) % 35)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}

            {/* Estado vacío */}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length}>
                  <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                    <div className="grid size-14 place-items-center rounded-2xl bg-muted">
                      {search ? <SearchX size={24} className="text-muted-foreground" /> : <Search size={24} className="text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="font-medium">{search ? emptyMessage : noDataMessage}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {search ? 'Prueba con otro término de búsqueda.' : 'Los nuevos registros aparecerán aquí.'}
                      </p>
                    </div>
                  </div>
                </td>
              </tr>
            )}

            {/* Filas de datos */}
            {!loading &&
              paged.map((item) => (
                <tr
                  key={rowKey(item)}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    'border-b border-border/50 transition-colors last:border-0',
                    onRowClick && 'cursor-pointer hover:bg-muted/50',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3.5', col.hiddenMobile && 'hidden md:table-cell', col.cellClassName)}>
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between border-t border-border/70 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Mostrando <span className="font-medium text-foreground">{safePage * pageSize + 1}</span>–
            <span className="font-medium text-foreground">{Math.min((safePage + 1) * pageSize, sorted.length)}</span> de{' '}
            <span className="font-medium text-foreground">{sorted.length}</span>
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Página anterior"
              className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-16 text-center text-xs font-medium">
              {safePage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              aria-label="Página siguiente"
              className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}