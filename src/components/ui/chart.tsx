import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ChartDataPoint {
  label: string
  value: number
  secondaryValue?: number
  tertiaryValue?: number
  meta?: string
}

export interface BarChartProps {
  data: ChartDataPoint[]
  height?: number
  valuePrefix?: string
  valueSuffix?: string
  primaryLabel?: string
  secondaryLabel?: string
  tertiaryLabel?: string
  className?: string
  showGridLines?: boolean
}

export function BarChart({
  data,
  height = 200,
  valuePrefix = '$',
  valueSuffix = '',
  primaryLabel = 'Issued',
  secondaryLabel = 'Settled',
  className,
  showGridLines = true,
}: BarChartProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null)

  const maxValue = React.useMemo(() => {
    let max = 0
    data.forEach((d) => {
      const total = Math.max(d.value, d.secondaryValue ?? 0)
      if (total > max) max = total
    })
    return max > 0 ? max * 1.15 : 100 // add 15% headroom
  }, [data])

  const formatVal = (v: number) => {
    if (v >= 1_000_000) return `${valuePrefix}${(v / 1_000_000).toFixed(1)}M${valueSuffix}`
    if (v >= 1_000) return `${valuePrefix}${(v / 1_000).toFixed(1)}k${valueSuffix}`
    return `${valuePrefix}${v.toLocaleString()}${valueSuffix}`
  }

  // 4 horizontal grid intervals
  const gridLevels = [1, 0.75, 0.5, 0.25]

  return (
    <div className={cn('relative w-full flex flex-col font-sans select-none', className)}>
      {/* Chart Canvas Area */}
      <div className="relative w-full" style={{ height }}>
        {/* Background Grid Lines */}
        {showGridLines && (
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
            {gridLevels.map((lvl) => (
              <div key={lvl} className="w-full flex items-center gap-2">
                <span className="text-[10px] mono text-[var(--subtle)] w-10 text-right shrink-0 select-none">
                  {formatVal(Math.round(maxValue * lvl))}
                </span>
                <div className="w-full border-b border-dashed border-black/10 dark:border-white/10" />
              </div>
            ))}
            <div className="w-full flex items-center gap-2">
              <span className="text-[10px] mono text-[var(--subtle)] w-10 text-right shrink-0 select-none">
                {formatVal(0)}
              </span>
              <div className="w-full border-b border-black/15 dark:border-white/15" />
            </div>
          </div>
        )}

        {/* Bars Container */}
        <div className="absolute inset-0 pl-12 pb-6 flex items-end justify-between gap-2 sm:gap-4">
          {data.map((item, idx) => {
            const isHovered = hoveredIndex === idx
            const primaryHeight = (item.value / maxValue) * 100
            const secondaryHeight = item.secondaryValue !== undefined ? (item.secondaryValue / maxValue) * 100 : null

            return (
              <div
                key={idx}
                className="relative flex-1 h-full flex items-end justify-center group cursor-pointer"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Floating Tooltip */}
                {isHovered && (
                  <div
                    className="absolute -top-16 z-30 pointer-events-none transform -translate-x-1/2 left-1/2 min-w-[120px] rounded-xl p-2.5 shadow-xl border border-black/10 dark:border-white/10 bg-[var(--surface-strong)] backdrop-blur-md transition-all duration-150 animate-in fade-in zoom-in-95"
                  >
                    <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-[var(--ink)] mb-1 pb-1 border-b border-black/5 dark:border-white/5">
                      <span>{item.label}</span>
                      {item.meta && <span className="text-[10px] text-[var(--muted)] font-normal">{item.meta}</span>}
                    </div>
                    <div className="flex flex-col gap-0.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-[var(--muted)]">
                          <span className="size-2 rounded-full bg-[var(--ink)]" />
                          {primaryLabel}
                        </span>
                        <span className="font-semibold text-[var(--ink)] tabular-nums">
                          {formatVal(item.value)}
                        </span>
                      </div>
                      {item.secondaryValue !== undefined && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-[var(--muted)]">
                            <span className="size-2 rounded-full bg-emerald-500" />
                            {secondaryLabel}
                          </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {formatVal(item.secondaryValue)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Bars Group */}
                <div className="w-full max-w-[42px] flex items-end justify-center gap-1 sm:gap-1.5 h-full">
                  {/* Primary Bar */}
                  <div
                    className={cn(
                      'w-full rounded-t-md transition-all duration-300 relative',
                      isHovered
                        ? 'bg-[var(--ink)] brightness-110 shadow-sm'
                        : hoveredIndex !== null
                        ? 'bg-[var(--ink)] opacity-40'
                        : 'bg-[var(--ink)] opacity-85 hover:opacity-100'
                    )}
                    style={{ height: `${Math.max(primaryHeight, 3)}%` }}
                  />

                  {/* Secondary Bar (if present) */}
                  {secondaryHeight !== null && (
                    <div
                      className={cn(
                        'w-full rounded-t-md transition-all duration-300 relative',
                        isHovered
                          ? 'bg-emerald-500 brightness-110 shadow-sm'
                          : hoveredIndex !== null
                          ? 'bg-emerald-500 opacity-40'
                          : 'bg-emerald-500/80 hover:bg-emerald-500'
                      )}
                      style={{ height: `${Math.max(secondaryHeight, 3)}%` }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* X-Axis Labels */}
      <div className="w-full pl-12 flex justify-between gap-2 sm:gap-4 pt-1">
        {data.map((item, idx) => {
          const isHovered = hoveredIndex === idx
          return (
            <div
              key={idx}
              className={cn(
                'flex-1 text-center text-[11px] font-medium transition-colors truncate',
                isHovered ? 'text-[var(--ink)] font-bold' : 'text-[var(--muted)]'
              )}
            >
              {item.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}
