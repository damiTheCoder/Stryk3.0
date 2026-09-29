import { ChevronRight } from 'lucide-react'
import BoardSeedPreview from './BoardSeedPreview'
import { type MarketplaceItem } from './MarketplaceCard'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARC_TESTNET_ID } from '../../contractConfig'

export interface MarketplaceTableProps {
  items: MarketplaceItem[]
  onSelect: (invoiceId: bigint) => void
}

function shortAddr(addr: string) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

const GRID_COLS_STYLE = {
  gridTemplateColumns:
    'minmax(56px, 56px) minmax(220px, 260px) minmax(120px, 140px) minmax(100px, 120px) minmax(120px, 140px) minmax(120px, 140px) minmax(40px, 40px)',
}

export default function MarketplaceTable({ items, onSelect }: MarketplaceTableProps) {
  return (
    <div className="w-full rounded-2xl bg-[var(--surface)] overflow-x-auto">
      <div style={{ minWidth: 900 }}>
        {/* ── Table Header (Rendered ONCE) ── */}
        <div
          style={GRID_COLS_STYLE}
          className="grid items-center h-10 px-4 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/[0.06] dark:border-white/[0.08] text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider gap-3 select-none"
        >
          <div />
          <div className="whitespace-nowrap overflow-hidden text-ellipsis">
            Receivable Asset
          </div>
          <div className="text-right whitespace-nowrap overflow-hidden text-ellipsis">
            Face Value
          </div>
          <div className="text-center whitespace-nowrap overflow-hidden text-ellipsis">
            Claimed
          </div>
          <div className="text-right whitespace-nowrap overflow-hidden text-ellipsis">
            Per Claim
          </div>
          <div className="text-right whitespace-nowrap overflow-hidden text-ellipsis">
            Settlement
          </div>
          <div />
        </div>

        {/* ── Table Rows ── */}
        <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {items.map((item) => {
            const invoiceIdBigInt = BigInt(Number(item.invoice_id) || 0)
            const amountBigInt = BigInt(item.amount || '0')
            const formattedAmount = Amount.fromRaw(
              amountBigInt,
              usdcDecimalsFor(ARC_TESTNET_ID)
            ).toFixed(2)

            const perUnitPayout = Amount.fromRaw(
              amountBigInt / 100n,
              usdcDecimalsFor(ARC_TESTNET_ID)
            ).toFixed(2)

            const isOverdue =
              !item.completed && Math.floor(Date.now() / 1000) > item.due_date
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
                key={item.invoice_id}
                tabIndex={0}
                role="button"
                onKeyDown={handleKeyDown}
                onClick={() => onSelect(invoiceIdBigInt)}
                style={GRID_COLS_STYLE}
                className="group grid items-center h-[56px] min-h-[56px] px-4 gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:outline-hidden"
              >
                {/* 1. Preview (56px) */}
                <div className="flex items-center justify-center shrink-0">
                  <BoardSeedPreview
                    invoiceId={item.invoice_id}
                    unitsClaimed={item.units_claimed}
                    completed={item.completed}
                    size="sm"
                  />
                </div>

                {/* 2. Receivable Asset (3 lines strictly) */}
                <div className="min-w-0 pr-2 flex flex-col justify-center overflow-hidden">
                  {/* Line 1: Invoice #0004 */}
                  <div className="text-[14px] font-medium text-[var(--ink)] tracking-tight leading-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    Invoice #{String(item.invoice_id).padStart(4, '0')}
                  </div>
                  {/* Line 2: Creator address */}
                  <div className="text-[12px] mono text-[var(--muted)] leading-tight whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
                    {shortAddr(item.creator)}
                  </div>
                  {/* Line 3: • Live / • Settled */}
                  <div className="flex items-center gap-1.5 text-[12px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis mt-0.5">
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${
                        item.completed
                          ? 'bg-emerald-500'
                          : 'bg-[#2563EB] animate-pulse'
                      }`}
                    />
                    <span
                      className={
                        item.completed
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'text-[#2563EB] dark:text-[#60A5FA] font-medium'
                      }
                    >
                      {item.completed ? 'Settled' : 'Live'}
                    </span>
                  </div>
                </div>

                {/* 3. Face Value */}
                <div className="text-right whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="text-[14px] font-semibold text-[var(--ink)] tabular-nums mono">
                    ${formattedAmount}
                  </span>
                </div>

                {/* 4. Claimed ("45/100" no spaces) */}
                <div className="text-center whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="text-[14px] font-semibold text-[var(--ink)] tabular-nums">
                    {item.units_claimed}/100
                  </span>
                </div>

                {/* 5. Per Claim */}
                <div className="text-right whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="text-[14px] font-semibold text-[var(--ink)] tabular-nums mono">
                    ${perUnitPayout}
                  </span>
                </div>

                {/* 6. Settlement */}
                <div className="text-right whitespace-nowrap overflow-hidden text-ellipsis">
                  <span
                    className={`text-[13px] tabular-nums ${
                      isOverdue
                        ? 'text-red-500 font-semibold'
                        : 'text-[var(--muted)]'
                    }`}
                  >
                    {isOverdue ? 'Overdue' : dueDateStr}
                  </span>
                </div>

                {/* 7. Chevron (40px) */}
                <div className="flex items-center justify-end text-[var(--muted)] group-hover:text-[var(--ink)] transition-colors">
                  <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
