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

// ─────────────────────────────────────────────────────────────────────────────
// LineChart Component (shadcn UI compatible)
// ─────────────────────────────────────────────────────────────────────────────

export interface LineChartPoint {
  label: string
  value: number
  meta?: string
}

export interface LineChartProps {
  data: LineChartPoint[]
  height?: number
  valuePrefix?: string
  valueSuffix?: string
  strokeColor?: string
  fillGradient?: boolean
  showGridLines?: boolean
  showDots?: boolean
  className?: string
  formatVal?: (v: number) => string
}

export function LineChart({
  data,
  height = 240,
  valuePrefix = '$',
  valueSuffix = '',
  strokeColor = '#2563EB',
  fillGradient = true,
  showGridLines = true,
  showDots = true,
  className,
  formatVal,
}: LineChartProps) {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null)

  const defaultFormat = (v: number) => {
    if (v < 0.01) return `${valuePrefix}${v.toFixed(6)}${valueSuffix}`
    if (v >= 1_000_000) return `${valuePrefix}${(v / 1_000_000).toFixed(2)}M${valueSuffix}`
    if (v >= 1_000) return `${valuePrefix}${(v / 1_000).toFixed(2)}k${valueSuffix}`
    return `${valuePrefix}${v.toLocaleString()}${valueSuffix}`
  }

  const formatter = formatVal ?? defaultFormat

  const { minVal, maxVal } = React.useMemo(() => {
    if (!data.length) return { minVal: 0, maxVal: 100 }
    let min = Infinity
    let max = -Infinity
    data.forEach((d) => {
      if (d.value < min) min = d.value
      if (d.value > max) max = d.value
    })
    const range = max - min || 1
    return {
      minVal: Math.max(0, min - range * 0.1),
      maxVal: max + range * 0.1,
    }
  }, [data])

  const svgWidth = 800
  const svgHeight = height
  const paddingX = 24
  const paddingY = 24

  const points = React.useMemo(() => {
    if (!data.length) return []
    return data.map((d, i) => {
      const x = paddingX + (i / Math.max(data.length - 1, 1)) * (svgWidth - paddingX * 2)
      const y =
        svgHeight -
        paddingY -
        ((d.value - minVal) / Math.max(maxVal - minVal, 0.00001)) * (svgHeight - paddingY * 2)
      return { x, y, ...d }
    })
  }, [data, minVal, maxVal, svgHeight])

  const pathD = React.useMemo(() => {
    if (points.length <= 1) return ''
    return points.reduce((acc, curr, idx, arr) => {
      if (idx === 0) return `M ${curr.x} ${curr.y}`
      const prev = arr[idx - 1]
      const cx1 = prev.x + (curr.x - prev.x) / 2
      const cy1 = prev.y
      const cx2 = prev.x + (curr.x - prev.x) / 2
      const cy2 = curr.y
      return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${curr.x} ${curr.y}`
    }, '')
  }, [points])

  const areaD = React.useMemo(() => {
    if (!points.length || !pathD) return ''
    const last = points[points.length - 1]
    const first = points[0]
    return `${pathD} L ${last.x} ${svgHeight} L ${first.x} ${svgHeight} Z`
  }, [points, pathD, svgHeight])

  const gridLevels = [0.8, 0.5, 0.2]

  return (
    <div className={cn('relative w-full flex flex-col font-sans select-none', className)}>
      <div className="relative w-full overflow-hidden" style={{ height }}>
        {/* Subtle Horizontal Grid lines */}
        {showGridLines && (
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-4">
            {gridLevels.map((lvl) => (
              <div key={lvl} className="w-full flex items-center gap-2">
                <div className="w-full border-b border-dashed border-black/10 dark:border-white/10" />
              </div>
            ))}
          </div>
        )}

        {/* SVG Drawing */}
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="lineChartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
              <stop offset="70%" stopColor={strokeColor} stopOpacity="0.05" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          {fillGradient && areaD && <path d={areaD} fill="url(#lineChartGradient)" />}

          {/* Stroke line */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke={strokeColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Hover Crosshair */}
          {hoveredIndex !== null && points[hoveredIndex] && (
            <line
              x1={points[hoveredIndex].x}
              y1={0}
              x2={points[hoveredIndex].x}
              y2={svgHeight}
              stroke={strokeColor}
              strokeWidth="1.5"
              strokeDasharray="3 3"
              opacity="0.6"
            />
          )}

          {/* Data Points / Dots */}
          {showDots &&
            points.map((pt, idx) => {
              const isHovered = hoveredIndex === idx
              return (
                <circle
                  key={idx}
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 3.5}
                  fill="#fff"
                  stroke={strokeColor}
                  strokeWidth="2.5"
                  className="transition-all cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              )
            })}
        </svg>

        {/* Floating Tooltip */}
        {hoveredIndex !== null && points[hoveredIndex] && (
          <div
            className="absolute z-30 pointer-events-none transform -translate-x-1/2 -translate-y-full min-w-[110px] rounded-xl p-2.5 shadow-xl border border-black/10 dark:border-white/10 bg-[var(--surface-strong)] backdrop-blur-md transition-all duration-150 animate-in fade-in zoom-in-95"
            style={{
              left: `${(points[hoveredIndex].x / svgWidth) * 100}%`,
              top: `${Math.max(12, (points[hoveredIndex].y / svgHeight) * 100 - 8)}%`,
            }}
          >
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--ink)] mb-1 pb-0.5 border-b border-black/5 dark:border-white/5">
              <span>{points[hoveredIndex].label}</span>
              {points[hoveredIndex].meta && (
                <span className="text-[10px] text-[var(--muted)] font-normal">
                  {points[hoveredIndex].meta}
                </span>
              )}
            </div>
            <div className="text-xs font-bold text-[var(--ink)] tabular-nums">
              {formatter(points[hoveredIndex].value)}
            </div>
          </div>
        )}
      </div>

      {/* X-Axis Labels */}
      <div className="w-full flex justify-between gap-1 pt-1.5 px-2">
        {data.map((item, idx) => {
          const isHovered = hoveredIndex === idx
          return (
            <div
              key={idx}
              className={cn(
                'flex-1 text-center text-[10px] sm:text-[11px] font-medium transition-colors truncate cursor-pointer',
                isHovered ? 'text-[var(--ink)] font-bold' : 'text-[var(--muted)]'
              )}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {item.label}
            </div>
          )
        })}
      </div>
    </div>
  )
}
