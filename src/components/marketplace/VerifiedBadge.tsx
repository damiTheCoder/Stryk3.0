interface VerifiedBadgeProps {
  className?: string
}

/**
 * Scalloped verified seal with a white checkmark.
 * Rendered as pure SVG so it stays crisp at any size.
 */
export function VerifiedBadge({ className }: VerifiedBadgeProps) {
  const spikes = 16
  const cx = 50
  const cy = 50
  const rOuter = 44
  const rInner = 36
  const pts: string[] = []
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner
    const a = (Math.PI * i) / spikes - Math.PI / 2
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`)
  }

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <polygon
        points={pts.join(' ')}
        fill="#2563EB"
        stroke="#2563EB"
        strokeWidth="10"
        strokeLinejoin="round"
      />
      <polyline
        points="32,51 45,64 69,38"
        fill="none"
        stroke="#fff"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
