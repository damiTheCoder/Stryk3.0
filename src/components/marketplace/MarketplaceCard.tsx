import { ChevronRight } from 'lucide-react'
import { GradientBlock } from './GradientBlock'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARC_TESTNET_ID } from '../../contractConfig'

export interface MarketplaceItem {
  invoice_id: number
  creator: string
  amount: string // uint256 string (6-decimal USDC)
  units_claimed: number // 0..100
  completed: boolean
  due_date: number // unix seconds
  stablecoin: string
  metadata_uri: string
}

export interface MarketplaceCardProps {
  item: MarketplaceItem
  onSelect: (invoiceId: bigint) => void
}

export function parseMetadataDescription(uri: string): string {
  if (!uri) return '—'
  try {
    if (uri.startsWith('data:application/json;base64,')) {
      const b64 = uri.slice('data:application/json;base64,'.length)
      const json = atob(b64)
      const parsed = JSON.parse(json)
      return parsed.description || '—'
    }
    if (uri.startsWith('data:application/json,')) {
      const json = decodeURIComponent(uri.slice('data:application/json,'.length))
      const parsed = JSON.parse(json)
      return parsed.description || '—'
    }
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return uri
    }
    if (uri.startsWith('ipfs://')) {
      return uri
    }
    return '—'
  } catch {
    return '—'
  }
}

function shortAddr(addr: string) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function MarketplaceCard({
  item,
  onSelect,
}: MarketplaceCardProps) {
  const invoiceIdBigInt = BigInt(Number(item.invoice_id) || 0)
  const amountBigInt = BigInt(item.amount || '0')
  const formattedAmount = Amount.fromRaw(
    amountBigInt,
    usdcDecimalsFor(ARC_TESTNET_ID)
  ).toFixed(2)

  // Calculate per-unit payout (face value / 100 units)
  const perUnitPayout = Amount.fromRaw(
    amountBigInt / 100n,
    usdcDecimalsFor(ARC_TESTNET_ID)
  ).toFixed(2)

  const dueDateStr = item.due_date
    ? new Date(item.due_date * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—'

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(invoiceIdBigInt)
    }
  }

  return (
    <div
      tabIndex={0}
      role="button"
      onKeyDown={handleKeyDown}
      onClick={() => onSelect(invoiceIdBigInt)}
      className="group relative rounded-2xl p-3.5 bg-[var(--surface)] hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-all cursor-pointer flex flex-col justify-between gap-3 focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-hidden"
    >
      {/* Top 40%: Board Preview */}
      <div className="relative w-full h-[120px] rounded-xl overflow-hidden">
        <GradientBlock
          seed={item.invoice_id}
          rounded="xl"
          className="w-full h-[120px]"
        />
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 text-[11px] font-medium bg-[var(--surface)]/80 backdrop-blur-xs px-2 py-0.5 rounded-md">
          {item.completed ? (
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

      {/* Title & Face Value */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span className="font-medium mono">
            #{String(item.invoice_id).padStart(4, '0')}
          </span>
          <span className="mono">{shortAddr(item.creator)}</span>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-bold text-[var(--ink)] tabular-nums mono tracking-tight">
            ${formattedAmount}
          </span>
          <span className="text-xs text-[var(--muted)] uppercase tracking-wider">
            USDC
          </span>
        </div>
      </div>

      {/* Sub-metrics Mini Grid */}
      <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
        <div>
          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
            Claimed
          </div>
          <div className="font-semibold text-[var(--ink)] tabular-nums">
            {item.units_claimed} / 100
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
            Per Claim
          </div>
          <div className="font-semibold text-[var(--ink)] tabular-nums mono">
            ${perUnitPayout}
          </div>
        </div>
      </div>

      {/* Footer link hint on hover */}
      <div className="flex items-center justify-between pt-1 text-xs text-[var(--muted)] group-hover:text-[var(--ink)] transition-colors">
        <span className="text-[11px]">{dueDateStr}</span>
        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </div>
  )
}
