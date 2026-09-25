/**
 * Marketplace — Bento Grid UI (Compact & Line-break resistant)
 * Modern Fintech / Bento Box architecture:
 * - 3 Top Bento KPI & Featured Hunt Tiles (Compact sizing, non-wrapping typography)
 * - 2 Analytics Bento Tiles (Capsule Bar Chart + Discovery Heatmap Matrix)
 * - Capsule Search & Filter Controls
 * - Bento NFT Hunt Cards with compact capsule bars, odds chips, and quick hunt triggers
 */
import { useState, useCallback, useMemo } from 'react'
import { useReadContract } from 'wagmi'
import {
  Grid3x3,
  Search,
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

// ─────────────────────────────────────────────────────────────────────────────
// Grid Listing Item Interface & Curated Initial Listings
// ─────────────────────────────────────────────────────────────────────────────

export interface GridListingItem {
  gridId: bigint
  tokenId: bigint
  invoiceRef: string
  faceValue: bigint
  cointag: bigint
  totalRevealed: number
  claimed: boolean
  active: boolean
}

const DEFAULT_GRIDS: GridListingItem[] = [
  {
    gridId: 1n,
    tokenId: 1n,
    invoiceRef: 'INV-2026-001',
    faceValue: 5000000000n, // $5,000 USDC
    cointag: 10000000n, // $10 USDC
    totalRevealed: 84,
    claimed: false,
    active: true,
  },
  {
    gridId: 2n,
    tokenId: 2n,
    invoiceRef: 'INV-2026-002',
    faceValue: 12500000000n, // $12,500 USDC
    cointag: 25000000n, // $25 USDC
    totalRevealed: 62,
    claimed: false,
    active: true,
  },
  {
    gridId: 3n,
    tokenId: 3n,
    invoiceRef: 'INV-2026-003',
    faceValue: 2800000000n, // $2,800 USDC
    cointag: 5000000n, // $5 USDC
    totalRevealed: 91,
    claimed: false,
    active: true,
  },
  {
    gridId: 4n,
    tokenId: 4n,
    invoiceRef: 'INV-2026-004',
    faceValue: 8400000000n, // $8,400 USDC
    cointag: 15000000n, // $15 USDC
    totalRevealed: 45,
    claimed: false,
    active: true,
  },
  {
    gridId: 5n,
    tokenId: 5n,
    invoiceRef: 'INV-2026-005',
    faceValue: 16000000000n, // $16,000 USDC
    cointag: 30000000n, // $30 USDC
    totalRevealed: 73,
    claimed: false,
    active: true,
  },
  {
    gridId: 6n,
    tokenId: 6n,
    invoiceRef: 'INV-2026-006',
    faceValue: 32000000000n, // $32,000 USDC
    cointag: 50000000n, // $50 USDC
    totalRevealed: 38,
    claimed: false,
    active: true,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Bento NFT Grid Card (Compact & non-wrapping, transparent on mobile)
// ─────────────────────────────────────────────────────────────────────────────

function BentoNftCard({
  item,
  onHunt,
  featured,
}: {
  item: GridListingItem
  onHunt: (g: bigint) => void
  featured?: boolean
}) {
  const revealed = item.totalRevealed
  const pct = Math.round((revealed / 100) * 100)
  const remaining = 100 - revealed

  return (
    <div
      onClick={() => onHunt(item.gridId)}
      className="rounded-[20px] sm:rounded-[24px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:scale-[1.015] active:scale-[0.99] group shadow-xs select-none border-0"
    >
      {/* Artwork container */}
      <div className="relative aspect-square w-full rounded-[16px] sm:rounded-[18px] overflow-hidden p-0.5 bg-[var(--surface-strong)]">
        <NftArtwork gridId={item.gridId} />

        {/* Top Badges */}
        <div className="absolute top-2 left-2 flex items-center gap-1 z-10">
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
        <div className="absolute bottom-2 right-2 z-10">
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full mono bg-black/80 text-white backdrop-blur-md whitespace-nowrap">
            {revealed}/100 Cells
          </span>
        </div>
      </div>

      {/* Info Content */}
      <div className="pt-2.5 flex flex-col gap-2">
        {/* Title & Face Value */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <h4 className="text-xs sm:text-sm font-bold tracking-tight text-[var(--ink)] whitespace-nowrap truncate">
              Invoice #{item.tokenId.toString()}
            </h4>
            <p className="text-[10px] sm:text-[11px] text-[var(--muted)] truncate max-w-[110px] mt-0.5">
              {item.invoiceRef || `Grid #${item.gridId.toString()}`}
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[9px] uppercase font-semibold text-[var(--muted)] block">Face Value</span>
            <span className="text-sm font-extrabold text-[var(--ink)] whitespace-nowrap">
              {formatUsdc(item.faceValue)}{' '}
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
              {formatUsdc(item.cointag)} <span className="text-[9px] text-[var(--muted)]">USDC</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] sm:text-[11px] font-semibold text-[#2563EB] dark:text-[#60A5FA] whitespace-nowrap">
              1 in {remaining}
            </span>
            <div className="size-5 sm:size-6 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-bold group-hover:scale-110 transition-transform">
              ↗
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Pro Table Row for List Mode (Ultra fast, synchronous, responsive)
// ─────────────────────────────────────────────────────────────────────────────

function BentoTableRow({
  item,
  onHunt,
}: {
  item: GridListingItem
  onHunt: (g: bigint) => void
}) {
  const revealed = item.totalRevealed
  const remaining = 100 - revealed
  const [from, to] = nftGradient(item.gridId)

  return (
    <tr
      onClick={() => onHunt(item.gridId)}
      className="hover:bg-[var(--surface-strong)] transition-colors cursor-pointer text-xs"
    >
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div
            className="size-7 sm:size-8 rounded-lg overflow-hidden shrink-0 flex items-center justify-center font-bold text-white text-[10px] shadow-xs"
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
          >
            #{item.gridId.toString()}
          </div>
          <div className="truncate">
            <span className="font-bold text-[var(--ink)] block whitespace-nowrap">Invoice #{item.tokenId.toString()}</span>
            <span className="text-[10px] text-[var(--muted)] whitespace-nowrap">{item.invoiceRef || `Grid #${item.gridId}`}</span>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-3 font-bold text-[var(--ink)] whitespace-nowrap">
        {formatUsdc(item.faceValue)} USDC
      </td>
      <td className="py-2.5 px-3 font-semibold text-[var(--ink)] whitespace-nowrap">
        {formatUsdc(item.cointag)} USDC
      </td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2 max-w-[120px]">
          <div className="h-1.5 flex-1 rounded-full bg-[var(--surface-strong)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--ink)]"
              style={{ width: `${revealed}%` }}
            />
          </div>
          <span className="text-[10px] text-[var(--muted)] font-medium shrink-0">{revealed}/100</span>
        </div>
      </td>
      <td className="py-2.5 px-3 font-semibold text-[#2563EB] dark:text-[#60A5FA] whitespace-nowrap">
        1 in {remaining}
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className="inline-flex items-center justify-center size-5 sm:size-6 rounded-full bg-[#2563EB] text-white font-bold text-[10px]">
          ↗
        </span>
      </td>
    </tr>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace Component (Full Compact Bento Grid)
// ─────────────────────────────────────────────────────────────────────────────

export default function Marketplace({ onSelectGrid }: { onSelectGrid: (gridId: bigint) => void }) {
  const [search, setSearch] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [activeTab, setActiveTab] = useState('All')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [activeDayIndex, setActiveDayIndex] = useState<number>(3) // index 3 = Thu peak
  const [funnelPeriod, setFunnelPeriod] = useState<'Weekly' | 'Monthly'>('Weekly')

  // Fast onchain sync for live grid #1
  const { data: onchainGrid1 } = useReadContract({
    address: GRID_ADDRESS,
    abi: GRID_ABI,
    functionName: 'getGrid',
    args: [1n],
    chainId: ARC_TESTNET_ID,
    query: {
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  })

  const gridListings = useMemo(() => {
    let items = [...DEFAULT_GRIDS]
    if (onchainGrid1 && Array.isArray(onchainGrid1)) {
      const [, , , tokenId, cointag, , totalRevealed, claimed, active] = onchainGrid1
      if (active && !claimed) {
        items[0] = {
          ...items[0],
          tokenId: (tokenId as bigint) || 1n,
          cointag: (cointag as bigint) || 10000000n,
          totalRevealed: Number(totalRevealed) || 84,
          active: true,
          claimed: false,
        }
      }
    }
    return items
  }, [onchainGrid1])

  const onRefresh = useCallback(() => setRefresh((k) => k + 1), [])

  // Filter & sort logic
  const filteredListings = useMemo(() => {
    let list = gridListings.filter((item) => {
      const searchLower = search.toLowerCase().trim()
      const match =
        searchLower === '' ||
        item.gridId.toString().includes(searchLower.replace(/\D/g, '')) ||
        item.tokenId.toString().includes(searchLower.replace(/\D/g, '')) ||
        item.invoiceRef.toLowerCase().includes(searchLower)

      if (!match) return false

      if (activeTab === 'Almost Claimed') {
        return item.totalRevealed >= 70
      }
      if (activeTab === 'High Value') {
        return item.faceValue >= 10000000000n // $10,000+
      }
      return true
    })

    list.sort((a, b) => Number(a.gridId - b.gridId))
    return list
  }, [gridListings, search, activeTab])

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
    <div className="space-y-2.5 sm:space-y-3 w-full pb-6 font-sans select-none">
      {/* ── Row 1: Top 2 Bento Highlight Cards (Compact & Non-wrapping) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
        {/* Card 1: Inverted Black Featured Hunt Card */}
        <div
          onClick={() => onSelectGrid(1n)}
          className="rounded-[20px] sm:rounded-[24px] bg-black text-white p-3 sm:p-3.5 md:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px] shadow-sm cursor-pointer transition-transform active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-medium text-neutral-300 whitespace-nowrap truncate">
              Featured Grid Hunt
            </span>
            <div className="size-6 sm:size-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs group-hover:scale-110 transition-transform">
              ↗
            </div>
          </div>

          <div className="my-1">
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
        <div className="rounded-[20px] sm:rounded-[24px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 md:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px] border-0 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-medium text-[var(--muted)] whitespace-nowrap truncate">
              Total Receivables Listed
            </span>
            <div className="size-6 sm:size-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shrink-0">
              ↗
            </div>
          </div>

          <div className="my-1">
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
      <div className="rounded-[20px] sm:rounded-[24px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 md:p-4 flex flex-col justify-between min-h-[220px] sm:min-h-[250px] border-0 shadow-xs">
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
              className="size-6 sm:size-7 rounded-full bg-[#2563EB] text-xs font-bold text-white flex items-center justify-center hover:bg-[#1D4ED8] transition-colors cursor-pointer"
            >
              <span className="text-[10px]">☷</span>
            </button>
          </div>
        </div>

        {/* Bar Chart Area with Wide Pill Capsule Bars */}
        <div className="flex-1 flex flex-col justify-end pt-3 pb-1">
          <div className="h-28 sm:h-34 w-full flex items-end justify-between gap-2 sm:gap-3 px-1 sm:px-2">
            {huntDays.map((item, idx) => {
              const isSelected = activeDayIndex === idx

              return (
                <div
                  key={item.day}
                  onClick={() => setActiveDayIndex(idx)}
                  className="flex-1 h-full flex flex-col items-center justify-end cursor-pointer group"
                >
                  {/* Floating Pill Badge over Selected Bar */}
                  <div className="h-5 mb-1 flex items-center justify-center">
                    {isSelected && (
                      <div className="px-2 py-0.5 rounded-full bg-black text-white dark:bg-white dark:text-black text-[9px] sm:text-[10px] font-extrabold tracking-wide shadow-xs animate-in fade-in duration-200 whitespace-nowrap">
                        {item.val}
                      </div>
                    )}
                  </div>

                  {/* Wide Pill Capsule Bar */}
                  <div
                    className={`w-full max-w-[48px] rounded-[16px] sm:rounded-[18px] transition-all duration-300 ${
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
          <div className="w-full flex items-center justify-between gap-2 sm:gap-3 px-1 sm:px-2 pt-2">
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

      {/* ── Row 3: Filter, Search, and View Mode Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-1">
        {/* Search Input */}
        <div className="relative flex-1 max-w-lg">
          <Search className="size-4.5 text-[var(--muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Grid #, Invoice ref, or token ID..."
            className="w-full h-11 sm:h-12 bg-[var(--surface)] text-[var(--ink)] placeholder-[var(--muted)] text-sm rounded-xl sm:rounded-2xl pl-11 pr-10 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all shadow-xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Right controls: Filter tabs, and Layout Switcher */}
        <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
          {/* Filter Pills */}
          <div className="flex items-center gap-1 p-1 bg-[var(--surface)] rounded-xl sm:rounded-2xl shadow-xs h-11 sm:h-12">
            {['All', 'Almost Claimed', 'High Value'].map((tab) => {
              const isActive = activeTab === tab
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3.5 sm:px-4 h-full rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center ${
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

          {/* Layout Toggle: Grid vs Table */}
          <div className="flex items-center gap-1 p-1 bg-[var(--surface)] rounded-xl sm:rounded-2xl shadow-xs h-11 sm:h-12">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setViewMode('grid')
              }}
              className={`px-2.5 h-full rounded-lg sm:rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                viewMode === 'grid'
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
              title="Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid className="size-4.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setViewMode('table')
              }}
              className={`px-2.5 h-full rounded-lg sm:rounded-xl transition-all cursor-pointer flex items-center justify-center ${
                viewMode === 'table'
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
              title="Table View"
              aria-label="Table View"
            >
              <List className="size-4.5" />
            </button>
          </div>

          {/* Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            className="size-11 sm:size-12 rounded-xl sm:rounded-2xl bg-[#2563EB] text-white hover:bg-[#1D4ED8] transition-all cursor-pointer shadow-xs flex items-center justify-center shrink-0"
            title="Refresh Listings"
          >
            <RefreshCw className="size-4 text-white" />
          </button>
        </div>
      </div>

      {/* ── Row 4: Listings Display (Bento Grid or Table) ── */}
      {filteredListings.length === 0 ? (
        <div className="rounded-[20px] sm:rounded-[24px] bg-[var(--surface)] p-8 text-center flex flex-col items-center justify-center gap-2 border-0 shadow-xs">
          <Grid3x3 className="size-7 text-[var(--muted)]" />
          <h4 className="text-sm font-bold text-[var(--ink)]">No Listings Found</h4>
          <p className="text-xs text-[var(--muted)] max-w-sm">
            No active grid listings matched your search criteria. Try modifying your filter or search keywords.
          </p>
          <button
            type="button"
            onClick={() => { setSearch(''); setActiveTab('All') }}
            className="px-3.5 py-1.5 rounded-full bg-[#2563EB] text-white text-xs sm:text-sm font-semibold hover:bg-[#1D4ED8] transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div
          className="grid gap-2.5 sm:gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}
        >
          {filteredListings.map((item, i) => (
            <BentoNftCard
              key={`${item.gridId}-${refresh}`}
              item={item}
              onHunt={onSelectGrid}
              featured={i === 0 || i === 3}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[20px] sm:rounded-[24px] bg-[var(--surface)] overflow-hidden shadow-xs border-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left">
              <thead>
                <tr className="bg-[var(--surface-strong)] text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">
                  <th className="py-2.5 px-3">Receivable Asset</th>
                  <th className="py-2.5 px-3">Face Value</th>
                  <th className="py-2.5 px-3">Cointag Price</th>
                  <th className="py-2.5 px-3">Revealed</th>
                  <th className="py-2.5 px-3">Remaining Odds</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.03] dark:divide-white/[0.04]">
                {filteredListings.map((item) => (
                  <BentoTableRow key={`${item.gridId}-${refresh}`} item={item} onHunt={onSelectGrid} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
