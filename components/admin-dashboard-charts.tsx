/**
 * Gráficos SVG puros para el dashboard admin.
 * Sin dependencias externas: ligeros, rápidos y responsive.
 */

/** Colores por estado de solicitud (ciclo de vida). */
export const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#06b6d4',
  shipped: '#6366f1',
  completed: '#10b981',
  cancelled: '#ef4444',
}

/** Gráfico de barras verticales para ventas. */
export function SalesBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex h-48 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="group flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground opacity-0 transition group-hover:opacity-100">${Math.round(d.value)}</span>
          <div
            className="w-full rounded-t-lg bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all group-hover:from-cyan-500 group-hover:to-cyan-300"
            style={{ height: `${Math.max((d.value / max) * 100, 4)}%` }}
            title={`${d.label}: $${d.value.toFixed(2)}`}
          />
          <span className="text-[10px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Gráfico de dona con leyenda para distribución de estados. */
export function StatusDonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Sin solicitudes todavía</p>
  }

  let acc = 0
  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const start = (acc / total) * 360
      acc += d.value
      const end = (acc / total) * 360
      return { ...d, start, end }
    })

  /** Calcula el path del arco de la dona. */
  function arcPath(start: number, end: number) {
    const r = 70
    const cx = 80
    const cy = 80
    const a1 = ((start - 90) * Math.PI) / 180
    const a2 = ((end - 90) * Math.PI) / 180
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2)
    const y2 = cy + r * Math.sin(a2)
    const large = end - start > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
      <svg viewBox="0 0 160 160" className="size-40 shrink-0 -rotate-90">
        <circle cx="80" cy="80" r="70" fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="14" />
        {segments.map((s) => (
          <path key={s.label} d={arcPath(s.start, s.end)} fill="none" stroke={s.color} strokeWidth="14" strokeLinecap="round" />
        ))}
        <text x="80" y="80" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-foreground text-2xl font-semibold" transform="translate(0 0)">
          {total}
        </text>
      </svg>
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}