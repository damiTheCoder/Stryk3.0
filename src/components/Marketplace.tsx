import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import NxLogo from '../images/NE.png'
import MarketplaceCard, { type MarketplaceItem } from './marketplace/MarketplaceCard'
import MarketplaceTable from './marketplace/MarketplaceTable'
import MarketplaceFilters from './marketplace/MarketplaceFilters'
import MarketplaceSkeleton from './marketplace/MarketplaceSkeleton'
import BoardSeedPreview from './marketplace/BoardSeedPreview'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARC_TESTNET_ID } from '../contractConfig'

interface Props {
  onSelectGrid: (gridId: bigint) => void
}

function mapApiToItem(api: any): MarketplaceItem {
  const onchainId =
    api.onchain_id ??
    api.invoice_id ??
    (typeof api.id === 'number'
      ? api.id
      : Number(api.id) || api.numeric_id || 0)

  return {
    invoice_id: Number(onchainId),
    creator: api.creator,
    amount: String(api.amount),
    units_claimed: Number(api.units_claimed ?? 0),
    completed: Boolean(api.completed),
    due_date: Number(api.due_date),
    stablecoin: api.stablecoin,
    metadata_uri: api.metadata_uri ?? '',
  }
}

export default function Marketplace({ onSelectGrid }: Props) {
  const [search, setSearch] = useState('')
  const [activeMainTab, setActiveMainTab] = useState('All Hunts')
  const [sortBy, setSortBy] = useState('highest_value')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'grid'
  )

  const { data = [], isLoading, error } = useQuery<MarketplaceItem[]>({
    queryKey: ['marketplace'],
    queryFn: async () => {
      const res = await fetch('/api/marketplace')
      if (!res.ok) throw new Error(`Marketplace fetch failed: ${res.status}`)
      const json = await res.json()
      return Array.isArray(json) ? json.map(mapApiToItem) : []
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  })

  // Aggregate stats calculations
  const totalCollateralRaw = useMemo(() => {
    return data.reduce((acc, curr) => acc + BigInt(curr.amount || '0'), 0n)
  }, [data])

  const totalCollateralFormatted = Amount.fromRaw(
    totalCollateralRaw,
    usdcDecimalsFor(ARC_TESTNET_ID)
  ).toFixed(0)

  const activeBoardsCount = useMemo(() => {
    return data.filter((item) => !item.completed).length
  }, [data])

  const totalUnitsClaimed = useMemo(() => {
    return data.reduce((acc, curr) => acc + curr.units_claimed, 0)
  }, [data])

  const totalPossibleUnits = data.length * 100
  const percentClaimed =
    totalPossibleUnits > 0
      ? Math.round((totalUnitsClaimed / totalPossibleUnits) * 100)
      : 0

  const avgCollateralPerUnitFormatted = useMemo(() => {
    if (!totalPossibleUnits) return '0.00'
    const avg = totalCollateralRaw / BigInt(totalPossibleUnits)
    return Amount.fromRaw(avg, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
  }, [totalCollateralRaw, totalPossibleUnits])

  // Filter and sort listings
  const filteredListings = useMemo(() => {
    let list = data.filter((item) => {
      // 1. Main Tab Filter
      if (activeMainTab === 'Live Now' && item.completed) return false
      if (activeMainTab === 'Almost Full' && (item.completed || item.units_claimed < 80)) return false
      if (activeMainTab === 'Settled' && !item.completed) return false

      // 2. Search Query
      const searchLower = search.toLowerCase().trim()
      const matchesSearch =
        searchLower === '' ||
        item.invoice_id.toString().includes(searchLower.replace(/\D/g, '')) ||
        item.creator.toLowerCase().includes(searchLower) ||
        item.metadata_uri.toLowerCase().includes(searchLower)

      if (!matchesSearch) return false

      return true
    })

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'highest_value') {
        return Number(BigInt(b.amount) - BigInt(a.amount))
      }
      if (sortBy === 'fewest_left') {
        return (100 - a.units_claimed) - (100 - b.units_claimed)
      }
      if (sortBy === 'ending_soon') {
        return a.due_date - b.due_date
      }
      if (sortBy === 'newest') {
        return b.invoice_id - a.invoice_id
      }
      return 0
    })

    return list
  }, [data, search, activeMainTab, sortBy])

  return (
    <div className="space-y-6 w-full pb-12 font-sans max-w-6xl mx-auto">
      {/* ── NE logo (top left, above stats) ── */}
      <div className="flex items-center justify-start">
        <img
          src={NxLogo}
          alt="NE"
          className="h-7 w-auto rounded-lg object-contain"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      </div>
      {/* ── 1. Inline Compact Stats Band ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 sm:gap-y-0 pt-0 pb-4 sm:py-4 items-center">
        {/* Stat 1: Collateral Locked */}
        <div className="pr-4 sm:pr-6 relative text-left">
          <div className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-[0.05em] whitespace-nowrap overflow-hidden text-ellipsis">
            COLLATERAL LOCKED
          </div>
          <div className="text-[22px] font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums leading-[1.1] whitespace-nowrap mt-1">
            ${Number(totalCollateralFormatted).toLocaleString()}
          </div>
          <div className="text-[12px] text-[var(--muted)] whitespace-nowrap overflow-hidden text-ellipsis mt-1">
            USDC · {data.length} boards
          </div>
        </div>

        {/* Stat 2: Active Hunts */}
        <div className="pl-4 sm:px-6 relative text-center sm:text-left">
          <div className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-[0.05em] whitespace-nowrap overflow-hidden text-ellipsis">
            ACTIVE HUNTS
          </div>
          <div className="text-[22px] font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums leading-[1.1] whitespace-nowrap mt-1">
            {activeBoardsCount}
          </div>
          <div className="text-[12px] text-[var(--muted)] whitespace-nowrap overflow-hidden text-ellipsis mt-1">
            open for discovery
          </div>
        </div>

        {/* Stat 3: Units Claimed */}
        <div className="pr-4 sm:px-6 relative text-left">
          <div className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-[0.05em] whitespace-nowrap overflow-hidden text-ellipsis">
            UNITS CLAIMED
          </div>
          <div className="text-[22px] font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums leading-[1.1] whitespace-nowrap mt-1">
            {totalUnitsClaimed} / {totalPossibleUnits}
          </div>
          <div className="text-[12px] text-[var(--muted)] whitespace-nowrap overflow-hidden text-ellipsis mt-1">
            {percentClaimed}% of all units
          </div>
        </div>

        {/* Stat 4: Avg Per Unit */}
        <div className="pl-4 sm:pl-6 relative text-center sm:text-left">
          <div className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-[0.05em] whitespace-nowrap overflow-hidden text-ellipsis">
            AVG PER UNIT
          </div>
          <div className="text-[22px] font-semibold text-[#2563EB] dark:text-[#60A5FA] tabular-nums leading-[1.1] whitespace-nowrap mt-1">
            ${avgCollateralPerUnitFormatted}
          </div>
          <div className="text-[12px] text-[var(--muted)] whitespace-nowrap overflow-hidden text-ellipsis mt-1">
            grows with CoinTags
          </div>
        </div>
      </div>

      {/* ── 2. Tab Navigation + Filters Row ── */}
      <MarketplaceFilters
        search={search}
        onSearchChange={setSearch}
        activeMainTab={activeMainTab}
        onMainTabChange={setActiveMainTab}
        sortBy={sortBy}
        onSortChange={setSortBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalCount={filteredListings.length}
      />

      {/* ── 3. Listings Section ── */}
      {isLoading ? (
        <MarketplaceSkeleton count={6} viewMode={viewMode} />
      ) : error ? (
        /* Error State */
        <div className="py-20 flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <div className="size-10 mb-3 opacity-40">
            <BoardSeedPreview
              invoiceId={0}
              unitsClaimed={0}
              completed={false}
              size="sm"
            />
          </div>
          <p className="text-[20px] font-medium text-[var(--ink)] tracking-tight">
            Could not load marketplace
          </p>
          <p className="text-[14px] text-[var(--muted)] mt-1 max-w-sm">
            {(error)?.message || 'Failed to fetch active hunts from backend.'}
          </p>
        </div>
      ) : filteredListings.length === 0 ? (
        /* Empty State */
        <div className="py-20 flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <div className="size-10 mb-3 opacity-40">
            <BoardSeedPreview
              invoiceId={0}
              unitsClaimed={0}
              completed={false}
              size="sm"
            />
          </div>
          <p className="text-[20px] font-medium text-[var(--ink)] tracking-tight">
            No live hunts right now
          </p>
          <p className="text-[14px] text-[var(--muted)] mt-1 max-w-sm">
            Tokenized receivables will appear here the moment a creator puts one on the board.
          </p>
          <button
            onClick={() => {
              setSearch('')
              setActiveMainTab('All Hunts')
            }}
            className="mt-6 h-10 px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-semibold transition-colors cursor-pointer"
          >
            Issue your first invoice
          </button>
        </div>
      ) : viewMode === 'list' ? (
        /* Dense Table (List View) with Horizontal Scroll */
        <MarketplaceTable
          items={filteredListings}
          onSelect={onSelectGrid}
        />
      ) : (
        /* Flat Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredListings.map((item) => (
            <MarketplaceCard
              key={item.invoice_id}
              item={item}
              onSelect={onSelectGrid}
            />
          ))}
        </div>
      )}
    </div>
  )
}
