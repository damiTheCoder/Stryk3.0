import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export interface StepAreaPoint {
  label: string
  value: number
}

export interface ChartAreaStepProps {
  data?: StepAreaPoint[]
}

const DEMO_DATA: StepAreaPoint[] = [
  { label: 'January', value: 120 },
  { label: 'February', value: 320 },
  { label: 'March', value: 240 },
  { label: 'April', value: 480 },
  { label: 'May', value: 380 },
  { label: 'June', value: 620 },
]

const BLUE = '#2563EB'
const BLACK = '#111111'

function readIsDark(): boolean {
  if (typeof document === 'undefined') return false
  return (
    document.documentElement.classList.contains('dark') ||
    document.documentElement.dataset.theme === 'dark'
  )
}

// Reactive dark-mode detection: re-renders the chart the moment the
// theme flips, instead of only reading it during a parent re-render.
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(readIsDark)
  useEffect(() => {
    const check = () => setIsDark(readIsDark())
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  return isDark
}

function niceCeil(v: number): number {
  if (!isFinite(v) || v <= 0) return 10
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const n = v / base
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return m * base
}

function StepTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload as
    | { month: string; capitalisation: number }
    | undefined
  if (!point) return null
  return (
    <div className="rounded-xl px-3 py-2 bg-[var(--surface-strong)]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Invoice Capitalisation
      </p>
      <p className="text-[11px] font-semibold text-[var(--ink)]">
        {point.month}:{' '}
        <span className="font-mono">
          ${Number(point.capitalisation).toFixed(2)} USDC
        </span>
      </p>
    </div>
  )
}

export function ChartAreaStep({ data }: ChartAreaStepProps) {
  const isDark = useIsDark()
  const points = data && data.length > 0 ? data : DEMO_DATA
  const chartData = points.map((p) => ({
    month: p.label,
    capitalisation: p.value,
  }))

  const dataMax = Math.max(...chartData.map((p) => p.capitalisation), 0)
  const top = niceCeil(dataMax)
  const darkFill = isDark ? '#2E2E2E' : BLACK

  // Even-numbered price levels: smallest even step covering top/4.
  const EVEN_STEPS = [2, 4, 10, 20, 40, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
  const rawStep = top / 4
  const step =
    EVEN_STEPS.find((s) => s >= rawStep) ?? Math.ceil(rawStep / 1000) * 1000
  const ticks = [0, step, 2 * step, 3 * step, 4 * step]

  return (
    <div className="w-full bg-transparent">
      <div className="w-full" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 12, left: 12, right: 12, bottom: 12 }}
          >
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value: string) => value.slice(0, 3)}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              orientation="right"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={44}
              domain={[0, 4 * step]}
              ticks={ticks}
              tickFormatter={(value: number) =>
                Number.isInteger(value) ? `$${value}` : `$${Number(value).toFixed(2)}`
              }
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
            />
            <Tooltip cursor={false} content={<StepTooltip />} />
            <Bar dataKey="capitalisation" name="Invoice Capitalisation" radius={8}>
              {chartData.map((_, index) => {
                const isBlue = index % 2 === 0
                return (
                  <Cell
                    key={index}
                    fill={isBlue ? BLUE : darkFill}
                    stroke={isBlue ? BLACK : isDark ? '#9CA3AF' : BLACK}
                    strokeWidth={1.5}
                  />
                )
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
