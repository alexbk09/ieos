'use client'

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CheckSquare, DollarSign, History, Percent, RefreshCw, TrendingUp, Wallet } from 'lucide-react'
import { DataTable, type TableColumn } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'
import { FormInput } from '@/components/ui/form-field'
import { confirmAction } from '@/components/confirm-dialog'
import { calcularPerdidaPorUnidad, calcularPorcentajeAumentoSugerido, simularAjusteProducto } from '@/lib/margin-adjustment-calculator'
import { formatRate, moneyUsd } from '@/lib/currency'
import type { AdjustmentHistoryEntry, HistoryProduct, ProductForAdjustment } from '@/services/margin-adjustment'

/** Fila de previsualización con valores simulados calculados de forma reactiva. */
type ProductRow = ProductForAdjustment & {
  nuevo_precio_inicial: number
  nuevo_precio_venta: number
}

/**
 * Gestor del módulo "Ajuste de Margen y Control de Pérdidas".
 * Muestra tasas de referencia, permite ingresar nueva tasa oficial y % de incremento,
 * previsualiza cambios en tabla con checkbox por producto, y aplica el ajuste masivo.
 * El cálculo reactivo usa la lógica pura de /lib/margin-adjustment-calculator.
 */
export function MarginAdjustmentManager({
  initialProducts,
  initialHistory,
  initialLastRate,
  officialRate,
  parallelRate,
}: {
  initialProducts: ProductForAdjustment[]
  initialHistory: AdjustmentHistoryEntry[]
  initialLastRate: { tasa_calculada: number; fecha_registro: string } | null
  officialRate: number
  parallelRate: number
}) {
  const [products, setProducts] = useState(initialProducts)
  const [history, setHistory] = useState(initialHistory)
  /** Última tasa usada en un ajuste previo. Base de comparación de la pérdida. Si no hay historial, usa la tasa actual. */
  const [lastRate, setLastRate] = useState(initialLastRate?.tasa_calculada ?? officialRate)
  const [nuevaTasa, setNuevaTasa] = useState(officialRate)
  const [porcentaje, setPorcentaje] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [historyDetail, setHistoryDetail] = useState<AdjustmentHistoryEntry | null>(null)

  // Filas con simulación reactiva (se recalcula al cambiar el porcentaje).
  const rows: ProductRow[] = useMemo(() => {
    return products.map((product) => {
      const { simulado } = simularAjusteProducto(
        { costo_inicial: product.costo_inicial, price_usd: product.price_usd },
        porcentaje,
      )
      return {
        ...product,
        nuevo_precio_inicial: simulado?.nuevo_precio_inicial ?? product.costo_inicial,
        nuevo_precio_venta: simulado?.nuevo_precio_venta ?? product.price_usd,
      }
    })
  }, [products, porcentaje])

  /**
   * Pérdidas estimadas totales por el AUMENTO DE LA MONEDA.
   * Se comparan contra la ÚLTIMA TASA USADA (del historial): solo hay pérdida
   * si la nueva tasa ingresada es mayor. Si aún no hay historial, la base es
   * la tasa oficial actual.
   * Devuelve pérdida en Bs, pérdida en USD y % de pérdida sobre el valor de venta.
   */
  const perdidas = useMemo(() => {
    const nueva = Number(nuevaTasa)
    if (!Number.isFinite(nueva) || nueva <= lastRate) {
      return { perdidaBs: 0, perdidaUsd: 0, porcentaje: 0 }
    }
    let perdidaBsTotal = 0
    let perdidaUsdTotal = 0
    for (const product of products) {
      const { perdidaBs, perdidaUsd } = calcularPerdidaPorUnidad(product.price_usd, lastRate, nueva)
      if (perdidaBs !== null) perdidaBsTotal += perdidaBs
      if (perdidaUsd !== null) perdidaUsdTotal += perdidaUsd
    }
    // % de pérdida = (1 - tasa base / nueva tasa) * 100 (igual para todos los productos)
    const { porcentaje } = calcularPerdidaPorUnidad(1, lastRate, nueva)
    return { perdidaBs: perdidaBsTotal, perdidaUsd: perdidaUsdTotal, porcentaje: porcentaje ?? 0 }
  }, [products, nuevaTasa, lastRate])

  /** Porcentaje de incremento sugerido sobre el precio para recuperar la pérdida. */
  const aumentoSugerido = useMemo(() => {
    const { porcentaje } = calcularPorcentajeAumentoSugerido(lastRate, Number(nuevaTasa))
    return porcentaje ?? 0
  }, [lastRate, nuevaTasa])

  /** Selecciona o deselecciona todos los productos. */
  function toggleSelectAll() {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)))
    }
  }

  /** Alterna la selección de un producto individual. */
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  /** Refresca productos e historial desde el servidor después de aplicar. */
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/admin/margin-adjustment', { cache: 'no-store' })
      if (!response.ok) throw new Error('No se pudo refrescar la información')
      const result = await response.json()
      setProducts(result.products ?? [])
      setHistory(result.history ?? [])
      setLastRate(result.lastRate?.tasa_calculada ?? officialRate)
    } catch {
      toast.error('Error al refrescar', { description: 'Los cambios podrían no reflejarse hasta recargar.' })
    } finally {
      setRefreshing(false)
    }
  }, [])

  /** Aplica el ajuste masivo solo a los productos seleccionados. */
  async function handleApply() {
    if (selectedIds.size === 0) {
      toast.error('Selecciona al menos un producto', { description: 'Usa el checkbox de cada fila para aceptar el cambio.' })
      return
    }
    const pct = Number(porcentaje)
    const tasa = Number(nuevaTasa)
    if (!Number.isFinite(pct) || pct <= 0) {
      toast.error('Porcentaje inválido', { description: 'Ingresa un porcentaje de incremento mayor a 0.' })
      return
    }
    if (!Number.isFinite(tasa) || tasa <= 0) {
      toast.error('Tasa inválida', { description: 'Ingresa una nueva tasa oficial mayor a 0.' })
      return
    }

    // Confirmación antes de modificar los precios de los productos seleccionados.
    const ok = await confirmAction({
      title: `¿Aplicar ajuste a ${selectedIds.size} producto${selectedIds.size !== 1 ? 's' : ''}?`,
      description: `Se actualizarán el precio inicial (+${pct}%) y el precio de venta (+16% IVA) de los productos seleccionados. Esta acción afecta la tienda en vivo.`,
      confirmText: 'Sí, aplicar ajuste',
      confirmClassName: 'bg-cyan-600 text-white hover:bg-cyan-500 dark:bg-cyan-600 dark:text-white dark:hover:bg-cyan-500',
    })
    if (!ok) return

    setApplying(true)
    try {
      const response = await fetch('/api/admin/margin-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: [...selectedIds], porcentaje: pct, tasa }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error ?? 'No se pudo aplicar el ajuste')
      }
      toast.success(`Ajuste aplicado a ${result.result?.total_actualizados ?? selectedIds.size} producto(s)`)
      setSelectedIds(new Set())
      setPorcentaje(0)
      await refresh()
    } catch (error: any) {
      toast.error('No se pudo aplicar el ajuste', { description: error.message })
    } finally {
      setApplying(false)
    }
  }

  /** Columnas de la tabla de previsualización reactiva. */
  const columns: TableColumn<ProductRow>[] = [
    {
      key: 'select',
      header: 'Aceptar',
      render: (product) => (
        <input
          type="checkbox"
          checked={selectedIds.has(product.id)}
          onChange={() => toggleSelect(product.id)}
          aria-label={`Aceptar cambio de precio para ${product.name}`}
          className="size-4 accent-primary"
        />
      ),
    },
    {
      key: 'name',
      header: 'Nombre',
      render: (product) => <span className="font-medium">{product.name}</span>,
      sortable: true,
      sortValue: (product) => product.name,
    },
    {
      key: 'costo_inicial',
      header: 'Precio Inicial Actual',
      render: (product) => moneyUsd(product.costo_inicial),
      sortable: true,
      sortValue: (product) => product.costo_inicial,
      hiddenMobile: true,
    },
    {
      key: 'price_usd',
      header: 'Precio Venta Actual',
      render: (product) => moneyUsd(product.price_usd),
      sortable: true,
      sortValue: (product) => product.price_usd,
    },
    {
      key: 'nuevo_precio_inicial',
      header: 'Nuevo Precio Inicial',
      render: (product) => <span className="font-medium text-cyan-600">{moneyUsd(product.nuevo_precio_inicial)}</span>,
      sortable: true,
      sortValue: (product) => product.nuevo_precio_inicial,
      hiddenMobile: true,
    },
    {
      key: 'nuevo_precio_venta',
      header: 'Nuevo Precio Venta (+16% IVA)',
      render: (product) => <span className="font-medium text-emerald-600">{moneyUsd(product.nuevo_precio_venta)}</span>,
      sortable: true,
      sortValue: (product) => product.nuevo_precio_venta,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Referencias de tasas y pérdida */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-5">
          <Wallet size={18} className="text-cyan-600" />
          <p className="mt-6 text-sm text-muted-foreground">Tasa oficial calculada</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">Bs. {formatRate(officialRate)}</p>
        </div>
        <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5">
          <TrendingUp size={18} className="text-amber-600" />
          <p className="mt-6 text-sm text-muted-foreground">Último estimado (paralelo)</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">Bs. {formatRate(parallelRate)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Diferencia: Bs. {formatRate(Math.max(0, parallelRate - officialRate))}</p>
        </div>
        <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-5">
          <Percent size={18} className="text-red-600" />
          <p className="mt-6 text-sm text-muted-foreground">% Pérdida / Aumento sugerido</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{formatRate(perdidas.porcentaje)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Sugerido para recuperar: {formatRate(aumentoSugerido)}%</p>
        </div>
        <div className="rounded-3xl border border-red-500/30 bg-red-500/5 p-5">
          <DollarSign size={18} className="text-red-600" />
          <p className="mt-6 text-sm text-muted-foreground">Pérdida estimada (USD)</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{moneyUsd(perdidas.perdidaUsd)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Equivale a Bs. {formatRate(perdidas.perdidaBs)}</p>
        </div>
      </div>

      {/* Entradas de simulación */}
      <div className="grid gap-4 rounded-3xl border border-border bg-card p-5 sm:grid-cols-2">
        <FormInput
          label="Nueva Tasa Oficial (Bs)"
          type="number"
          step="0.01"
          min="0"
          value={nuevaTasa}
          onChange={(e) => setNuevaTasa(Number(e.target.value))}
          hint="Tasa con la que se calculará el ajuste (referencia para el historial)."
        />
        <FormInput
          label="Porcentaje de incremento (%)"
          type="number"
          step="0.01"
          min="0"
          value={porcentaje}
          onChange={(e) => setPorcentaje(Number(e.target.value))}
          hint="Se aplica sobre el Precio Inicial (costo base) de cada producto."
        />
        <div className="sm:col-span-2">
          <button
            onClick={handleApply}
            disabled={applying || selectedIds.size === 0}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            {applying && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
            Aplicar y Guardar Ajustes ({selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''})
          </button>
        </div>
      </div>

      {/* Tabla de previsualización */}
      <DataTable
        data={rows}
        columns={columns}
        rowKey={(product) => product.id}
        searchPlaceholder="Buscar producto…"
        searchKeys={(product) => `${product.name}`}
        loading={refreshing}
        pageSize={8}
        toolbar={
          <>
            <button
              onClick={toggleSelectAll}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <CheckSquare size={15} />
              {selectedIds.size === products.length ? 'Quitar todos' : 'Seleccionar todos'}
            </button>
            <button
              onClick={refresh}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              Refrescar
            </button>
          </>
        }
      />

      {/* Historial de ajustes */}
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <History size={18} className="text-cyan-600" />
          <h2 className="font-medium">Historial de ajustes aplicados</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Registro de auditoría con los precios anteriores de cada producto.</p>

        {history.length === 0 ? (
          <p className="mt-6 py-8 text-center text-sm text-muted-foreground">Aún no hay ajustes registrados.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Tasa calculada</th>
                  <th className="px-4 py-3 font-medium">% Aplicado</th>
                  <th className="px-4 py-3 font-medium">Productos</th>
                  <th className="px-4 py-3 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3.5">{new Date(entry.fecha_registro).toLocaleString('es-VE')}</td>
                    <td className="px-4 py-3.5">Bs. {formatRate(entry.tasa_calculada)}</td>
                    <td className="px-4 py-3.5">{formatRate(entry.porcentaje_aplicado)}%</td>
                    <td className="px-4 py-3.5">{entry.productos.length}</td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => setHistoryDetail(entry)} className="text-sm text-cyan-600 hover:underline">
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal de detalle del historial */}
      <Modal
        open={historyDetail !== null}
        onClose={() => setHistoryDetail(null)}
        title="Detalle del ajuste"
        description={historyDetail ? `Bs. ${formatRate(historyDetail.tasa_calculada)} · ${formatRate(historyDetail.porcentaje_aplicado)}% · ${historyDetail.productos.length} producto(s)` : ''}
        icon={<History size={18} />}
        size="lg"
      >
        {historyDetail && (
          <div className="space-y-3">
            {historyDetail.productos.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No hay productos registrados en este ajuste.</p>
            )}
            {historyDetail.productos.map((item: HistoryProduct) => (
              <div key={item.product_id} className="rounded-2xl bg-muted/60 p-4 text-sm">
                <p className="font-medium">{item.nombre}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Costo anterior: <b className="text-foreground">{moneyUsd(Number(item.costo_inicial_anterior))}</b></span>
                  <span>Venta anterior: <b className="text-foreground">{moneyUsd(Number(item.precio_venta_anterior))}</b></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}