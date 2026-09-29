export interface MarketplaceSkeletonProps {
  count?: number
  viewMode?: 'grid' | 'list'
}

export default function MarketplaceSkeleton({
  count = 6,
  viewMode = 'list',
}: MarketplaceSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i)

  if (viewMode === 'list') {
    return (
      <div className="w-full divide-y divide-black/[0.06] dark:divide-white/[0.08] animate-pulse">
        {items.map((i) => (
          <div
            key={i}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3.5 min-w-0 w-[28%]">
              <div className="size-10 rounded-lg bg-neutral-200/60 dark:bg-neutral-800/60 shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-28 rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
                <div className="h-3 w-20 rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-6 flex-1">
              <div className="w-32 space-y-1">
                <div className="h-4 w-24 ml-auto rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
                <div className="h-2.5 w-16 ml-auto rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
              </div>
              <div className="w-28 space-y-1">
                <div className="h-4 w-16 mx-auto rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
                <div className="h-2.5 w-12 mx-auto rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
              </div>
              <div className="w-28 space-y-1">
                <div className="h-4 w-20 ml-auto rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
                <div className="h-2.5 w-14 ml-auto rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
              </div>
              <div className="hidden lg:block w-28 space-y-1">
                <div className="h-3.5 w-20 ml-auto rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
                <div className="h-2.5 w-14 ml-auto rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
              </div>
              <div className="w-8 h-4 rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full animate-pulse">
      {items.map((i) => (
        <div
          key={i}
          className="rounded-2xl p-3.5 bg-[var(--surface)] flex flex-col justify-between gap-3 h-[240px]"
        >
          <div className="w-full h-[120px] rounded-xl bg-neutral-200/60 dark:bg-neutral-800/60" />
          <div className="space-y-1.5">
            <div className="h-3 w-20 rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
            <div className="h-5 w-32 rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="h-3 w-16 rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
            <div className="h-3 w-16 ml-auto rounded bg-neutral-200/60 dark:bg-neutral-800/60" />
          </div>
        </div>
      ))}
    </div>
  )
}
