/**
 * Marketplace — Bento Grid UI (Compact & Line-break resistant)
 * Modern Fintech / Bento Box architecture:
 * - 3 Top Bento KPI & Featured Hunt Tiles (Compact sizing, non-wrapping typography)
 * - 2 Analytics Bento Tiles (Capsule Bar Chart + Discovery Heatmap Matrix)
 * - Capsule Search & Filter Controls
 * - Bento NFT Hunt Cards with compact capsule bars, odds chips, and quick hunt triggers
 */
import { useState, useCallback, useRef, useMemo } from 'react'
import { useReadContract } from 'wagmi'
import {
  Grid3x3,
  Search,
  SlidersHorizontal,
  RefreshCw,
  LayoutGrid,
  List,
} from 'lucide-react'
import { STRYK_GRID_CONTRACT, STRYK_NFT_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'
import { formatUsdc } from '@/onchain-money'
import { Progress } from './ui/progress'

const GRID_ADDRESS = STRYK_GRID_CONTRACT.address
const GRID_ABI = STRYK_GRID_CONTRACT.abi
const MAX_GRID_SCAN = 50

// ─────────────────────────────────────────────────────────────────────────────
// Generative SVG NFT Artwork
// ─────────────────────────────────────────────────────────────────────────────

function nftGradient(id: bigint) {
  const n = Number(id % 360n)
  const palettes = [
    [`hsl(${n},80%,40%)`, `hsl(${(n + 60) % 360},90%,25%)`],
    [`hsl(${n},60%,20%)`, `hsl(${(n + 120) % 360},80%,35%)`],
    [`hsl(${n},100%,30%)`, `hsl(${(n + 180) % 360},70%,20%)`],
  ]
  return palettes[Number(id % 3n)]
}

function NftArtwork({ gridId, size = 240 }: { gridId: bigint; size?: number }) {
  const [from, to] = nftGradient(gridId)
  const seed = Number(gridId)
  const cx = 30 + (seed * 17) % 140
  const cy = 30 + (seed * 31) % 140
  const r1 = 40 + (seed * 7) % 50
  const dots = Array.from({ length: 6 }, (_, i) => ({
    x: (seed * (i + 1) * 41) % size,
    y: (seed * (i + 1) * 73) % size,
    r: 3 + (seed * i * 5) % 10,
  }))

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="w-full h-full object-cover rounded-[18px]">
      <defs>
        <linearGradient id={`g${gridId}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
        <filter id={`blur${gridId}`}>
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>
      <rect width={size} height={size} fill={`url(#g${gridId})`} />
      <circle cx={cx} cy={cy} r={r1} fill="rgba(255,255,255,0.18)" filter={`url(#blur${gridId})`} />
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 5 }, (_, col) => {
          const gx = (size / 5) * col + size / 10
          const gy = (size / 5) * row + size / 10
          const filled = (seed + row * 5 + col) % 3 === 0
          return filled ? (
            <rect
              key={`${row}-${col}`}
              x={gx - 6}
              y={gy - 6}
              width={12}
              height={12}
              rx={2}
              fill="rgba(255,255,255,0.22)"
            />
          ) : null
        })
      )}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="rgba(255,255,255,0.15)" />
      ))}
      <g transform={`translate(${size / 2 - 16}, ${size / 2 - 14})`} opacity="0.9">
        <path
          d="M2 14 L10 22 L30 6"
          stroke="#fff"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Bento NFT Grid Card (Compact & non-wrapping)
// ─────────────────────────────────────────────────────────────────────────────

function BentoNftCard({
  gridId,
  onHunt,
  featured,
}: {
  gridId: bigint
  onHunt: (g: bigint) => void
  featured?: boolean
}) {
  const { data: grid } = useReadContract({
    address: GRID_ADDRESS,
    abi: GRID_ABI,
    functionName: 'getGrid',
    args: [gridId],
    chainId: ARC_TESTNET_ID,
    query: { refetchInterval: 20000 },
  })

  const { data: nft } = useReadContract({
    address: STRYK_NFT_CONTRACT.address,
    abi: STRYK_NFT_CONTRACT.abi,
    functionName: 'getInvoiceNFT',
    args: [grid ? ((grid as readonly unknown[])[3] as bigint) : 0n],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!grid },
  })

  if (!grid) return null
  const [, vendor, , tokenId, cointag, , totalRevealed, claimed, active] = grid
  if (!active || claimed) return null

  const nftData = nft as { faceValue: bigint; invoiceRef: string; dueDate: bigint } | undefined
  const revealed = Number(totalRevealed)
  const pct = Math.round((revealed / 100) * 100)
  const remaining = 100 - revealed

  return (
    <div
      onClick={() => onHunt(gridId)}
      className="rounded-[22px] sm:rounded-[26px] bg-[var(--surface)] text-[var(--ink)] p-3.5 sm:p-4 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:scale-[1.015] active:scale-[0.99] group shadow-xs select-none"
    >
      {/* Artwork container */}
      <div className="relative aspect-square w-full rounded-[18px] overflow-hidden p-0.5 bg-[var(--surface-strong)]">
        <NftArtwork gridId={gridId} />

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1 z-10">
          {featured && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-black text-white dark:bg-white dark:text-black shadow-xs whitespace-nowrap">
              ⚡ Hot Pick
            </span>
          )}
          {revealed >= 70 && (
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#2563EB] text-white shadow-xs whitespace-nowrap">
              🔥 70%+
            </span>
          )}
        </div>

        {/* Revealed cells pill */}
        <div className="absolute bottom-2.5 right-2.5 z-10">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full mono bg-black/80 text-white backdrop-blur-md whitespace-nowrap">
            {revealed}/100 Cells
          </span>
        </div>
      </div>

      {/* Info Content */}
      <div className="pt-3 flex flex-col gap-2.5">
        {/* Title & Face Value */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold tracking-tight text-[var(--ink)] whitespace-nowrap truncate">
              Invoice #{tokenId.toString()}
            </h4>
            <p className="text-[11px] text-[var(--muted)] truncate max-w-[110px] mt-0.5">
              {nftData?.invoiceRef || `Grid #${gridId.toString()}`}
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[9px] uppercase font-semibold text-[var(--muted)] block">Face Value</span>
            <span className="text-sm sm:text-base font-extrabold text-[var(--ink)] whitespace-nowrap">
              {nftData ? formatUsdc(nftData.faceValue) : '—'}{' '}
              <span className="text-[10px] font-normal text-[var(--muted)]">USDC</span>
            </span>
          </div>
        </div>

        {/* Wide Capsule Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-[var(--muted)]">
            <span>Progress</span>
            <span className="font-semibold text-[var(--ink)]">{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--surface-strong)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--ink)] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Footer: Cointag Price + Odds Button */}
        <div className="flex items-center justify-between pt-0.5">
          <div>
            <span className="text-[9px] text-[var(--muted)] block uppercase font-medium">Tag Price</span>
            <span className="text-xs font-bold text-[var(--ink)] whitespace-nowrap">
              {formatUsdc(cointag)} <span className="text-[9px] text-[var(--muted)]">USDC</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] whitespace-nowrap">
              1 in {remaining}
            </span>
            <div className="size-6 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-bold group-hover:scale-110 transition-transform">
              ↗
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pro Table Row for List Mode
// ─────────────────────────────────────────────────────────────────────────────

function BentoTableRow({
  gridId,
  onHunt,
}: {
  gridId: bigint
  onHunt: (g: bigint) => void
}) {
  const { data: grid } = useReadContract({
    address: GRID_ADDRESS,
    abi: GRID_ABI,
    functionName: 'getGrid',
    args: [gridId],
    chainId: ARC_TESTNET_ID,
    query: { refetchInterval: 20000 },
  })

  const { data: nft } = useReadContract({
    address: STRYK_NFT_CONTRACT.address,
    abi: STRYK_NFT_CONTRACT.abi,
    functionName: 'getInvoiceNFT',
    args: [grid ? ((grid as readonly unknown[])[3] as bigint) : 0n],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!grid },
  })

  if (!grid) return null
  const [, vendor, , tokenId, cointag, , totalRevealed, claimed, active] = grid
  if (!active || claimed) return null

  const nftData = nft as { faceValue: bigint; invoiceRef: string; dueDate: bigint } | undefined
  const revealed = Number(totalRevealed)
  const remaining = 100 - revealed

  return (
    <tr
      onClick={() => onHunt(gridId)}
      className="hover:bg-[var(--surface-strong)] transition-colors cursor-pointer text-xs"
    >
      <td className="py-3 px-4 flex items-center gap-3">
        <div className="size-8 rounded-lg overflow-hidden shrink-0 bg-[var(--surface-strong)]">
          <NftArtwork gridId={gridId} size={32} />
        </div>
        <div className="truncate">
          <span className="font-bold text-[var(--ink)] block whitespace-nowrap">Invoice #{tokenId.toString()}</span>
          <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">{nftData?.invoiceRef || `Grid #${gridId}`}</span>
        </div>
      </td>
      <td className="py-3 px-4 font-bold text-[var(--ink)] whitespace-nowrap">
        {nftData ? formatUsdc(nftData.faceValue) : '—'} USDC
      </td>
      <td className="py-3 px-4 font-semibold text-[var(--ink)] whitespace-nowrap">
        {formatUsdc(cointag)} USDC
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2 max-w-[120px]">
          <Progress value={revealed} className="h-1.5" />
          <span className="text-[10px] text-[var(--muted)] font-medium shrink-0">{revealed}/100</span>
        </div>
      </td>
      <td className="py-3 px-4 font-semibold text-[#2563EB] dark:text-[#60A5FA] whitespace-nowrap">
        1 in {remaining}
      </td>
      <td className="py-3 px-4 text-right">
        <span className="inline-flex items-center justify-center size-6 rounded-full bg-[#2563EB] text-white font-bold text-[10px]">
          ↗
        </span>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace Component (Full Compact Bento Grid)
// ─────────────────────────────────────────────────────────────────────────────

type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'progress'

export default function Marketplace({ onSelectGrid }: { onSelectGrid: (gridId: bigint) => void }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [refresh, setRefresh] = useState(0)
  const [showSort, setShowSort] = useState(false)
  const [activeTab, setActiveTab] = useState('All')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [activeDayIndex, setActiveDayIndex] = useState<number>(3) // index 3 = Thu peak
  const [funnelPeriod, setFunnelPeriod] = useState<'Weekly' | 'Monthly'>('Weekly')
  const filterRef = useRef<HTMLDivElement>(null)

  const allGridIds = useMemo(
    () => Array.from({ length: MAX_GRID_SCAN }, (_, i) => BigInt(i + 1)),
    []
  )

  const onRefresh = useCallback(() => setRefresh((k) => k + 1), [])

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'newest', label: 'Newest First' },
    { key: 'price_asc', label: 'Tag Price: Low to High' },
    { key: 'price_desc', label: 'Tag Price: High to Low' },
    { key: 'progress', label: 'Most Revealed Cells' },
  ]

  // Filter logic
  const filteredIds = useMemo(() => {
    return allGridIds.filter((id) => {
      const idMatch =
        search === '' ||
        id.toString().includes(search.replace(/\D/g, '')) ||
        search.toLowerCase().includes('nft')

      if (!idMatch) return false

      if (activeTab === 'Almost Claimed') {
        return Number(id % 3n) === 0
      }
      if (activeTab === 'High Value') {
        return Number(id % 2n) === 0
      }
      return true
    })
  }, [allGridIds, search, activeTab])

  // Daily hunt cointags data
  const huntDays = [
    { day: 'Mon', height: 48, val: '58 Tags' },
    { day: 'Tue', height: 62, val: '84 Tags' },
    { day: 'Wed', height: 50, val: '72 Tags' },
    { day: 'Thu', height: 94, val: '142 Tags' }, // peak blue bar
    { day: 'Fri', height: 70, val: '98 Tags' },
    { day: 'Sat', height: 56, val: '76 Tags' },
  ]

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10 font-sans select-none">
      {/* ── Row 1: Top 2 Bento Highlight Cards (Compact & Non-wrapping) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        {/* Card 1: Inverted Black Featured Hunt Card */}
        <div
          onClick={() => onSelectGrid(1n)}
          className="rounded-[24px] sm:rounded-[28px] bg-black text-white p-4 sm:p-5 flex flex-col justify-between min-h-[140px] shadow-sm cursor-pointer transition-transform active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-medium text-neutral-300 whitespace-nowrap truncate">
              Featured Grid Hunt
            </span>
            <div className="size-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs group-hover:scale-110 transition-transform">
              ↗
            </div>
          </div>

          <div className="my-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight whitespace-nowrap">
              Grid #1 • $5,000
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px] font-medium text-neutral-400 gap-2 whitespace-nowrap truncate">
            <span className="truncate">Tag: $10 USDC • 84/100 revealed</span>
            <span className="text-[#2563EB] dark:text-[#60A5FA] font-bold shrink-0">1 in 16</span>
          </div>
        </div>

        {/* Card 2: Market Liquidity Bento Card */}
        <div className="rounded-[24px] sm:rounded-[28px] bg-[var(--surface)] text-[var(--ink)] p-4 sm:p-5 flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-medium text-[var(--muted)] whitespace-nowrap truncate">
              Total Receivables Listed
            </span>
            <div className="size-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shrink-0">
              ↗
            </div>
          </div>

          <div className="my-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--ink)] whitespace-nowrap">
              $182.5K
            </span>
          </div>

          <div className="whitespace-nowrap truncate text-[11px] font-medium text-[var(--muted)]">
            Active • 50 live hunts on Arc
          </div>
        </div>
      </div>

      {/* ── Row 2: Hunt Activity Capsule Bar Chart ── */}
      <div className="rounded-[24px] sm:rounded-[28px] bg-[var(--surface)] text-[var(--ink)] p-4 sm:p-5 flex flex-col justify-between min-h-[280px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-[var(--ink)]">Hunt Activity</h3>
            <p className="text-[11px] text-[var(--muted)] mt-0.5">Cointags minted per day</p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFunnelPeriod(p => (p === 'Weekly' ? 'Monthly' : 'Weekly'))}
              className="px-3 py-1 rounded-full bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer"
            >
              {funnelPeriod}
            </button>
            <button
              type="button"
              className="size-7 rounded-full bg-[#2563EB] text-xs font-bold text-white flex items-center justify-center hover:bg-[#1D4ED8] transition-colors cursor-pointer"
            >
              <span className="text-[10px]">☷</span>
            </button>
          </div>
        </div>

        {/* Bar Chart Area with Wide Pill Capsule Bars */}
        <div className="flex-1 flex flex-col justify-end pt-4 pb-1">
          <div className="h-40 sm:h-44 w-full flex items-end justify-between gap-2.5 sm:gap-4 px-1 sm:px-4">
            {huntDays.map((item, idx) => {
              const isSelected = activeDayIndex === idx

              return (
                <div
                  key={item.day}
                  onClick={() => setActiveDayIndex(idx)}
                  className="flex-1 h-full flex flex-col items-center justify-end cursor-pointer group"
                >
                  {/* Floating Pill Badge over Selected Bar */}
                  <div className="h-6 mb-1.5 flex items-center justify-center">
                    {isSelected && (
                      <div className="px-2.5 py-0.5 rounded-full bg-black text-white dark:bg-white dark:text-black text-[10px] font-extrabold tracking-wide shadow-xs animate-in fade-in duration-200 whitespace-nowrap">
                        {item.val}
                      </div>
                    )}
                  </div>

                  {/* Wide Pill Capsule Bar */}
                  <div
                    className={`w-full max-w-[54px] rounded-[18px] sm:rounded-[20px] transition-all duration-300 ${
                      isSelected
                        ? 'bg-[#2563EB] shadow-xs'
                        : 'bg-[var(--surface-strong)] opacity-85 group-hover:opacity-100'
                    }`}
                    style={{ height: `${item.height}%` }}
                  />
                </div>
              )
            })}
          </div>

          {/* X-Axis Day Labels */}
          <div className="w-full flex items-center justify-between gap-2.5 sm:gap-4 px-1 sm:px-4 pt-2.5">
            {huntDays.map((item, idx) => {
              const isSelected = activeDayIndex === idx
              return (
                <div
                  key={item.day}
                  onClick={() => setActiveDayIndex(idx)}
                  className={`flex-1 text-center text-xs font-medium cursor-pointer transition-colors ${
                    isSelected
                      ? 'text-[#2563EB] dark:text-[#60A5FA] font-bold'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {item.day}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Row 3: Capsule Filter, Search, and View Mode Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1.5">
        {/* Search Input in Capsule Shape */}
        <div className="relative flex-1 max-w-lg">
          <Search className="size-4 text-[var(--muted)] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Grid #, Invoice ref, or token ID..."
            className="w-full bg-[var(--surface)] text-[var(--ink)] placeholder-[var(--muted)] text-sm rounded-full pl-11 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all shadow-xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Right controls: Filter tabs, Sort dropdown, and Layout Switcher */}
        <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
          {/* Capsule Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-[var(--surface)] rounded-full shadow-xs">
            {['All', 'Almost Claimed', 'High Value'].map((tab) => {
              const isActive = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#2563EB] text-white shadow-xs font-bold'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {tab}
                </button>
              )
            })}
          </div>

          {/* Sort Dropdown */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowSort(!showSort)}
              className="px-4 py-2.5 rounded-full bg-[#2563EB] text-white text-xs sm:text-sm font-semibold flex items-center gap-2 hover:bg-[#1D4ED8] transition-colors cursor-pointer shadow-xs"
            >
              <SlidersHorizontal className="size-3.5 text-white" />
              <span>{sortOptions.find((s) => s.key === sort)?.label}</span>
            </button>
            {showSort && (
              <div className="absolute right-0 mt-2 z-50 rounded-[20px] overflow-hidden py-1 w-48 bg-[var(--surface)] text-[var(--ink)] shadow-xl border border-black/5 dark:border-white/10">
                {sortOptions.map((o) => (
                  <button
                    key={o.key}
                    onClick={() => {
                      setSort(o.key)
                      setShowSort(false)
                    }}
                    className={`w-full text-left px-4 py-2.5 text-xs sm:text-sm transition-colors hover:bg-[var(--surface-strong)] ${
                      sort === o.key ? 'font-bold text-[var(--ink)]' : 'text-[var(--muted)]'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Layout Toggle: Grid vs Table */}
          <div className="flex items-center gap-1 p-1 bg-[var(--surface)] rounded-full shadow-xs">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-full transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-full transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
              title="Table View"
            >
              <List className="size-4" />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            className="p-2.5 rounded-full bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-all cursor-pointer shadow-xs flex items-center justify-center"
            title="Refresh Listings"
          >
            <RefreshCw className="size-4 text-white" />
          </button>
        </div>
      </div>

      {/* ── Row 4: Listings Display (Bento Grid or Table) ── */}
      {filteredIds.length === 0 ? (
        <div className="rounded-[24px] sm:rounded-[28px] bg-[var(--surface)] p-10 text-center flex flex-col items-center justify-center gap-2.5">
          <Grid3x3 className="size-8 text-[var(--muted)]" />
          <h4 className="text-sm font-bold text-[var(--ink)]">No Listings Found</h4>
          <p className="text-xs text-[var(--muted)] max-w-sm">
            No active grid listings matched your search criteria. Try modifying your filter or search keywords.
          </p>
          <button
            onClick={() => { setSearch(''); setActiveTab('All') }}
            className="px-4 py-2 rounded-full bg-[#2563EB] text-white text-xs sm:text-sm font-semibold hover:bg-[#1D4ED8] transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div
          className="grid gap-3.5 sm:gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}
        >
          {filteredIds.map((id, i) => (
            <BentoNftCard
              key={`${id}-${refresh}`}
              gridId={id}
              onHunt={onSelectGrid}
              featured={i === 0 || i === 3}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] sm:rounded-[28px] bg-[var(--surface)] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[var(--surface-strong)] text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                  <th className="py-3 px-4">Receivable Asset</th>
                  <th className="py-3 px-4">Face Value</th>
                  <th className="py-3 px-4">Cointag Price</th>
                  <th className="py-3 px-4">Revealed</th>
                  <th className="py-3 px-4">Remaining Odds</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.03] dark:divide-white/[0.04]">
                {filteredIds.map((id) => (
                  <BentoTableRow key={`${id}-${refresh}`} gridId={id} onHunt={onSelectGrid} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
