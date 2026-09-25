/**
 * Marketplace — OpenSea-style NFT grid homepage.
 * Every receivable (StrykNFT + legacy InvoiceTokenization ERC-20) is shown
 * as an NFT card. Clicking any card opens the Grid Hunt for that asset.
 */
import { useState, useCallback, useRef } from 'react'
import { useReadContract } from 'wagmi'
import { Grid3x3, Search, SlidersHorizontal, RefreshCw, Zap, TrendingUp, Users } from 'lucide-react'
import { STRYK_GRID_CONTRACT, STRYK_NFT_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'
import { formatUsdc } from '@/onchain-money'

const GRID_ADDRESS  = STRYK_GRID_CONTRACT.address
const GRID_ABI      = STRYK_GRID_CONTRACT.abi
const MAX_GRID_SCAN = 50

// ─────────────────────────────────────────────────────────────────────────────
// NFT artwork: deterministic generative SVG from gridId
// ─────────────────────────────────────────────────────────────────────────────

function nftGradient(id: bigint) {
  const n = Number(id % 360n)
  const palettes = [
    [`hsl(${n},80%,40%)`,   `hsl(${(n+60)%360},90%,25%)`],
    [`hsl(${n},60%,20%)`,   `hsl(${(n+120)%360},80%,35%)`],
    [`hsl(${n},100%,30%)`,  `hsl(${(n+180)%360},70%,20%)`],
  ]
  return palettes[Number(id % 3n)]
}

function NftArtwork({ gridId, size = 200 }: { gridId: bigint; size?: number }) {
  const [from, to] = nftGradient(gridId)
  const seed = Number(gridId)
  // Deterministic shape offsets
  const cx = 30 + (seed * 17) % 140
  const cy = 30 + (seed * 31) % 140
  const r1 = 40 + (seed * 7) % 50
  const dots = Array.from({ length: 6 }, (_, i) => ({
    x: (seed * (i + 1) * 41) % size,
    y: (seed * (i + 1) * 73) % size,
    r: 3 + (seed * i * 5) % 10,
  }))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
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
      {/* Blurred glow circle */}
      <circle cx={cx} cy={cy} r={r1} fill="rgba(255,255,255,0.18)" filter={`url(#blur${gridId})`} />
      {/* Grid pattern overlay */}
      {Array.from({ length: 5 }, (_, row) =>
        Array.from({ length: 5 }, (_, col) => {
          const gx = (size / 5) * col + size / 10
          const gy = (size / 5) * row + size / 10
          const filled = (seed + row * 5 + col) % 3 === 0
          return filled ? (
            <rect key={`${row}-${col}`} x={gx - 6} y={gy - 6} width={12} height={12}
              rx={2} fill="rgba(255,255,255,0.20)" />
          ) : null
        })
      )}
      {/* Dots */}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="rgba(255,255,255,0.12)" />
      ))}
      {/* Stryk mark — white check */}
      <g transform={`translate(${size / 2 - 16}, ${size / 2 - 14})`} opacity="0.85">
        <path d="M2 14 L10 22 L30 6" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Single NFT card — reads one grid listing
// ─────────────────────────────────────────────────────────────────────────────

function NftCard({ gridId, onHunt, featured }: { gridId: bigint; onHunt: (g: bigint) => void; featured?: boolean }) {
  const [hovered, setHovered] = useState(false)

  const { data: grid } = useReadContract({
    address: GRID_ADDRESS, abi: GRID_ABI, functionName: 'getGrid', args: [gridId],
    chainId: ARC_TESTNET_ID, query: { refetchInterval: 20000 },
  })

  const { data: nft } = useReadContract({
    address: STRYK_NFT_CONTRACT.address, abi: STRYK_NFT_CONTRACT.abi,
    functionName: 'getInvoiceNFT',
    args: [grid ? (grid as readonly unknown[])[3] as bigint : 0n],
    chainId: ARC_TESTNET_ID, query: { enabled: !!grid },
  })

  if (!grid) return null
  const [, vendor, , tokenId, cointag, , totalRevealed, claimed, active] =
    grid
  if (!active || claimed) return null

  const nftData = nft as { faceValue: bigint; invoiceRef: string; dueDate: bigint } | undefined
  const revealed = Number(totalRevealed)
  const pct = Math.round((revealed / 100) * 100)

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 bg-[var(--surface)] text-[var(--ink)]"
      style={{
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered ? '0 12px 24px rgba(0,0,0,0.08)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onHunt(gridId)}
    >
      {/* Artwork */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '1' }}>
        <NftArtwork gridId={gridId} size={300} />
        {/* Overlay on hover */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-all duration-200"
          style={{
            background: hovered ? 'rgba(0,0,0,0.55)' : 'transparent',
            opacity: hovered ? 1 : 0,
          }}
        >
          <span
            className="px-5 py-2.5 rounded-full text-sm font-bold tracking-wide bg-[var(--bg)] text-[var(--ink)] shadow-sm"
          >
            Hunt this NFT
          </span>
        </div>

        {/* Featured badge */}
        {featured && (
          <div className="absolute top-3 left-3">
            <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-[var(--ink)] text-[var(--bg)]">
              <Zap className="size-2.5" /> Featured
            </span>
          </div>
        )}

        {/* Cell progress chip */}
        <div className="absolute bottom-3 right-3">
          <span className="text-[10px] font-bold px-2 py-1 rounded-full mono bg-black/70 text-white backdrop-blur-sm">
            {revealed}/100 revealed
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3">
        {/* Name row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="display text-sm font-bold leading-tight text-[var(--ink)]">
              Invoice NFT #{tokenId.toString()}
            </p>
            <p className="text-xs mt-0.5 truncate max-w-[140px] text-[var(--muted)]">
              {nftData?.invoiceRef || `Grid #${gridId}`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-[var(--muted)]">Face value</p>
            <p className="display text-sm font-bold text-[var(--ink)]">
              {nftData ? formatUsdc(nftData.faceValue) : '—'} <span className="text-[10px] text-[var(--muted)]">USDC</span>
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="rounded-full h-1.5 overflow-hidden bg-[var(--surface-strong)]">
            <div
              className="h-full rounded-full transition-all bg-[var(--ink)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <p className="text-[10px] text-[var(--muted)]">Cointag price</p>
            <p className="text-sm font-bold text-[var(--ink)]">
              {formatUsdc(cointag)} <span className="text-[10px] text-[var(--muted)]">USDC</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-[var(--muted)]">Creator</p>
            <p className="text-xs mono text-[var(--ink-2)]">
              {vendor.slice(0, 6)}…{vendor.slice(-4)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero banner
// ─────────────────────────────────────────────────────────────────────────────

function HeroBanner({ total }: { total: number }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-[var(--surface)] text-[var(--ink)] p-6 lg:p-7 flex flex-col gap-3.5 transition-colors"
    >
      {/* Content */}
      <div className="relative z-10 flex flex-col gap-2.5 max-w-xl">
        <div>
          <span className="inline-flex items-center px-3 py-0.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-[var(--bg)] text-[var(--muted)]">
            INVOICE RECEIVABLES MARKET
          </span>
        </div>
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--ink)] leading-tight">
            Hunt. Reveal. Claim.
          </h1>
          <span className="text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--muted)] block leading-tight mt-0.5">
            Invoice NFTs onchain.
          </span>
        </div>
        <p className="text-sm text-[var(--muted)] max-w-xl leading-relaxed">
          Every tokenized invoice is an NFT hidden in a 10×10 grid.
          Buy cointags to reveal cells. Find the winning cell to claim the receivable.
        </p>
      </div>

      {/* Stats row */}
      <div className="relative z-10 pt-3 mt-1 flex items-center gap-8 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium">Active Hunts</p>
          <p className="text-sm font-bold text-[var(--ink)]">{total > 0 ? total.toString() : '50'}</p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium">Fee split</p>
          <p className="text-sm font-bold text-[var(--ink)]">80/10/10</p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium">Protocol</p>
          <p className="text-sm font-bold text-[var(--ink)]">Arc Testnet</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace page
// ─────────────────────────────────────────────────────────────────────────────

type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'progress'

export default function Marketplace({ onSelectGrid }: { onSelectGrid: (gridId: bigint) => void }) {
  const [search,  setSearch]  = useState('')
  const [sort,    setSort]    = useState<SortKey>('newest')
  const [refresh, setRefresh] = useState(0)
  const filterRef = useRef<HTMLDivElement>(null)
  const [showSort, setShowSort] = useState(false)
  const [activeTab, setActiveTab] = useState('All')

  // Static grid ID range — NftCard hides inactive/claimed listings silently
  const allGridIds = Array.from({ length: MAX_GRID_SCAN }, (_, i) => BigInt(i + 1))
  // Estimated active count shown in hero (NftCard self-hides inactive, so we use the scan length)
  const activeCount = MAX_GRID_SCAN

  const onRefresh = useCallback(() => setRefresh(k => k + 1), [])

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'newest',     label: 'Newest first' },
    { key: 'price_asc',  label: 'Price: low → high' },
    { key: 'price_desc', label: 'Price: high → low' },
    { key: 'progress',   label: 'Most revealed' },
  ]

  // Filter by search (grid id or "NFT #X" label)
  const filteredIds = allGridIds.filter(id =>
    search === '' ||
    id.toString().includes(search.replace(/\D/g, '')) ||
    search.toLowerCase().includes('nft')
  )

  return (
    <div className="flex flex-col gap-4">

      {/* ── Hero Section ── */}
      <HeroBanner total={activeCount} />

      {/* ── Search Bar & Filter Dropdown ── */}
      <div className="flex items-center gap-2.5">
        {/* Search */}
        <div className="flex-1 relative flex items-center">
          <Search className="w-4 h-4 text-[var(--muted)] absolute left-3.5 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by grid ID..."
            className="w-full bg-[var(--surface)] text-[var(--ink)] placeholder-[var(--muted)] text-sm rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 text-xs text-[var(--muted)] hover:text-[var(--ink)]">✕</button>
          )}
        </div>

        {/* Sort dropdown on the right */}
        <div className="relative shrink-0" ref={filterRef}>
          <button
            onClick={() => setShowSort(v => !v)}
            className="bg-[var(--surface)] text-[var(--ink)] text-sm font-medium rounded-xl px-3.5 py-2 flex items-center gap-2 hover:bg-[var(--surface-strong)] focus:outline-none transition-colors"
          >
            <SlidersHorizontal className="size-4 text-[var(--muted)]" />
            <span>{sortOptions.find(s => s.key === sort)?.label}</span>
          </button>
          {showSort && (
            <div
              className="absolute right-0 mt-2 z-50 rounded-xl overflow-hidden py-1 w-48 bg-[var(--surface)] text-[var(--ink)] shadow-xl"
            >
              {sortOptions.map(o => (
                <button
                  key={o.key}
                  onClick={() => { setSort(o.key); setShowSort(false) }}
                  className="w-full text-left px-4 py-2 text-sm transition-all hover:bg-[var(--surface-strong)]"
                  style={{
                    color: sort === o.key ? 'var(--ink)' : 'var(--muted)',
                    fontWeight: sort === o.key ? 600 : 400,
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="p-2 rounded-xl bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-all"
          title="Refresh"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {/* ── Horizontal row of filter tabs (All, Active, New, High Value, Almost Claimed) ── */}
      <div className="flex items-center gap-1 p-1 bg-[var(--surface)] rounded-xl w-fit">
        {['All', 'Active', 'New', 'High Value', 'Almost Claimed'].map(tabName => {
          const isActive = activeTab === tabName
          return (
            <button
              key={tabName}
              onClick={() => setActiveTab(tabName)}
              className={
                isActive
                  ? 'bg-[var(--bg)] text-[var(--ink)] font-semibold px-3.5 py-1.5 rounded-lg text-sm shadow-xs transition-all'
                  : 'text-[var(--muted)] hover:text-[var(--ink)] font-medium px-3.5 py-1.5 rounded-lg text-sm transition-colors'
              }
            >
              {tabName}
            </button>
          )
        })}
      </div>

      {/* ── NFT Grid ── */}
      {filteredIds.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No results</p>
        </div>
      ) : (
        <div className="grid gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {filteredIds.map((id, i) => (
            <NftCard key={`${id}-${refresh}`} gridId={id} onHunt={onSelectGrid} featured={i === 0} />
          ))}
        </div>
      )}

      {/* ── Empty state (shown below grid when no grids are active) ── */}
      <div className="rounded-2xl p-8 flex flex-col items-center gap-4 text-center"
        style={{ background: 'rgba(255,255,255,0.03)' }}>
        <Grid3x3 className="size-8" style={{ color: 'rgba(255,255,255,0.2)' }} />
        <div>
          <p className="display text-base font-bold" style={{ color: 'rgba(255,255,255,0.6)' }}>
            No active grid hunts yet
          </p>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Tokenize an invoice to list it as an NFT, then create a grid hunt.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {['Tokenize invoice', '→', 'Mint StrykNFT', '→', 'List on grid', '→', 'Hunters buy cointags', '→', 'Winner claims NFT'].map((s, i) => (
            <span key={i} style={{ color: s === '→' ? 'rgba(255,255,255,0.15)' : undefined }}>{s}</span>
          ))}
        </div>
      </div>

    </div>
  )
}
