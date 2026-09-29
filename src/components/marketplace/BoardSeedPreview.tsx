import { GradientBlock } from './GradientBlock'

export interface BoardSeedPreviewProps {
  invoiceId: number
  unitsClaimed: number
  completed: boolean
  size?: 'sm' | 'md'
}

/**
 * Plain dark gradient block (replaces the old dotted-grid matrix).
 * Keeps the original props API so existing consumers need no changes.
 */
export default function BoardSeedPreview({
  invoiceId,
  unitsClaimed,
  completed,
  size = 'md',
}: BoardSeedPreviewProps) {
  void unitsClaimed

  if (size === 'sm') {
    // 44px x 44px block for list view rows (fits 56px row height cleanly)
    return (
      <GradientBlock
        seed={invoiceId}
        rounded="lg"
        className="size-11 shrink-0 overflow-hidden"
      />
    )
  }

  // Grid view preview (top of card)
  return (
    <div className="relative w-full h-[120px] rounded-xl overflow-hidden">
      <GradientBlock seed={invoiceId} rounded="xl" className="w-full h-[120px]" />

      {/* Top right status text */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 text-[11px] font-medium bg-[var(--surface)]/80 backdrop-blur-xs px-2 py-0.5 rounded-md">
        {completed ? (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Settled
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[var(--muted)]">
            <span className="size-1.5 rounded-full bg-[#2563EB] animate-pulse" />
            Live
          </span>
        )}
      </div>
    </div>
  )
}
