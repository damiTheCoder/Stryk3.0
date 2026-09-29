interface GradientBlockProps {
  seed: number | bigint // invoice ID — used to vary the gradient angle
  className?: string
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

const DARK_RAINBOW: [string, string][] = [
  ['#2a0a0a', '#7f1d1d'], // red
  ['#2a1503', '#9a3412'], // orange
  ['#292003', '#a16207'], // yellow
  ['#052e16', '#15803d'], // green
  ['#0a1633', '#1e40af'], // blue
  ['#1e1b4b', '#4338ca'], // indigo
  ['#2e1065', '#6d28d9'], // violet
]

export function GradientBlock({ seed, className, rounded = 'lg' }: GradientBlockProps) {
  const n = Number(seed)
  const angle = (n * 37) % 360
  const [from, to] = DARK_RAINBOW[Math.abs(n) % DARK_RAINBOW.length]
  const radiusClass =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'xl'
        ? 'rounded-xl'
        : rounded === 'lg'
          ? 'rounded-lg'
          : rounded === 'md'
            ? 'rounded-md'
            : rounded === 'sm'
              ? 'rounded-sm'
              : ''

  return (
    <div
      className={`${radiusClass} ${className ?? ''}`}
      style={{
        background: `linear-gradient(${angle}deg, ${from}, ${to})`,
      }}
    />
  )
}
