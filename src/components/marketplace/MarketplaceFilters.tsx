import { Search, X, LayoutGrid, List } from 'lucide-react'

export interface MarketplaceFiltersProps {
  search: string
  onSearchChange: (val: string) => void
  activeMainTab: string
  onMainTabChange: (tab: string) => void
  sortBy: string
  onSortChange: (sort: string) => void
  viewMode: 'grid' | 'list'
  onViewModeChange: (mode: 'grid' | 'list') => void
  totalCount: number
}

const MAIN_TABS = ['All Hunts', 'Live Now', 'Almost Full', 'Settled'] as const

export default function MarketplaceFilters({
  search,
  onSearchChange,
  activeMainTab,
  onMainTabChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
}: MarketplaceFiltersProps) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {/* ── 1. Main Tab Navigation ── */}
      <div className="flex items-center gap-8 overflow-x-auto no-scrollbar">
        {MAIN_TABS.map((tab) => {
          const isActive = activeMainTab === tab
          return (
            <button
              key={tab}
              onClick={() => onMainTabChange(tab)}
              className={`h-12 text-[17px] sm:text-[19px] whitespace-nowrap transition-colors cursor-pointer relative font-medium ${
                isActive
                  ? 'text-[var(--ink)] font-bold'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              {tab}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#2563EB] rounded-full" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── 2. Search, Sort & View Toggle Controls ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[var(--subtle)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by invoice ID, creator, or memo"
            className="w-full h-10 pl-9 pr-8 text-xs sm:text-sm rounded-xl bg-[#F3F4F6] dark:bg-[#232323] text-[var(--ink)] placeholder:text-[var(--subtle)] outline-none focus:border-[#2563EB] transition-colors"
          />
          {search && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[var(--subtle)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="h-10 px-3 rounded-xl bg-[#F3F4F6] dark:bg-[#232323] text-xs font-semibold text-[var(--ink)] outline-none cursor-pointer focus:border-[#2563EB] transition-colors"
          >
            <option value="highest_value">Highest Value</option>
            <option value="fewest_left">Fewest Left</option>
            <option value="ending_soon">Ending Soonest</option>
            <option value="newest">Newest</option>
          </select>

          {/* View Toggle (Grid / List) */}
          <div className="flex items-center h-10 bg-[#F3F4F6] dark:bg-[#232323] rounded-xl p-1 shrink-0">
            <button
              onClick={() => onViewModeChange('list')}
              className={`flex items-center justify-center size-7 rounded-lg transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
              title="List View"
              aria-label="List View"
            >
              <List className="size-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('grid')}
              className={`flex items-center justify-center size-7 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
              title="Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
