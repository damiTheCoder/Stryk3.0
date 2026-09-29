import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { Ticket, Copy, Check, ArrowRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARC_TESTNET_ID } from '../contractConfig'

export interface CointagCodeItem {
  invoiceId: number
  code: string
  amount: string
  txHash: string
  blockNumber: number | null
  createdAt: number
}

interface Props {
  onOpenHunt: (invoiceId: bigint) => void
  onNavigateMarketplace: () => void
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function CodeStore({ onOpenHunt, onNavigateMarketplace }: Props) {
  const { address, isConnected } = useAccount()
  const [codes, setCodes] = useState<CointagCodeItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const fetchCodes = useCallback(async () => {
    if (!address) {
      setCodes([])
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch(`/api/cointags/${address}`)
      if (res.ok) {
        const data = await res.json()
        setCodes(data.codes || [])
      } else {
        setCodes([])
      }
    } catch {
      setCodes([])
    } finally {
      setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchCodes()
  }, [fetchCodes])

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code)
    setCopiedCode(code)
    toast.success('Code copied to clipboard!')
    setTimeout(() => setCopiedCode(null), 2000)
  }

  return (
    <div className="space-y-6 w-full pb-12 font-sans max-w-6xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between gap-4 pb-5">
        <div>
          <h1 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-[var(--ink)]">
            Code Store
          </h1>
          <p className="text-[13px] text-[var(--muted)] mt-0.5">
            Your CoinTag purchase codes. Each code unlocks one invoice hunt.
          </p>
        </div>

        {isConnected && (
          <button
            type="button"
            onClick={fetchCodes}
            disabled={isLoading}
            className="p-2 rounded-xl bg-[#F3F4F6] dark:bg-[#232323] hover:bg-black/5 dark:hover:bg-white/5 text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh codes"
          >
            <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* ── Content Area ── */}
      {!isConnected ? (
        <div className="py-20 flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <div className="size-12 rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] flex items-center justify-center text-[var(--muted)] mb-3">
            <Ticket className="size-6" />
          </div>
          <p className="text-[18px] font-semibold text-[var(--ink)] tracking-tight">
            Connect wallet to view codes
          </p>
          <p className="text-[13px] text-[var(--muted)] mt-1">
            Connect the wallet you used to purchase CoinTags to see your access codes.
          </p>
        </div>
      ) : isLoading && codes.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <RefreshCw className="size-6 animate-spin text-[#2563EB] mb-2" />
          <p className="text-sm text-[var(--muted)]">Loading your codes…</p>
        </div>
      ) : codes.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center text-center max-w-md mx-auto">
          <div className="size-12 rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] flex items-center justify-center text-[var(--muted)] mb-3">
            <Ticket className="size-6 opacity-40" />
          </div>
          <p className="text-[18px] font-semibold text-[var(--ink)] tracking-tight">
            No codes yet
          </p>
          <p className="text-[13px] text-[var(--muted)] mt-1 max-w-sm">
            Buy a CoinTag on any tokenized invoice to receive an access code and join the coordinate hunt.
          </p>
          <button
            type="button"
            onClick={onNavigateMarketplace}
            className="mt-6 h-10 px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>Browse Marketplace</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="w-full rounded-2xl bg-[var(--surface)] overflow-x-auto">
          <div style={{ minWidth: 700 }}>
            {/* Table Header */}
            <div className="grid grid-cols-[minmax(140px,1.2fr)_minmax(200px,1.8fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(140px,1fr)] items-center h-10 px-5 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/[0.06] dark:border-white/[0.08] text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider gap-4 select-none">
              <div>Invoice</div>
              <div>Access Code</div>
              <div>Amount Paid</div>
              <div>Purchased</div>
              <div className="text-right">Action</div>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
              {codes.map((item) => {
                const amountFormatted = Amount.fromRaw(
                  BigInt(item.amount || '0'),
                  usdcDecimalsFor(ARC_TESTNET_ID)
                ).toFixed(2)

                const isCopied = copiedCode === item.code

                return (
                  <div
                    key={`${item.invoiceId}-${item.code}`}
                    className="grid grid-cols-[minmax(140px,1.2fr)_minmax(200px,1.8fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(140px,1fr)] items-center h-[56px] min-h-[56px] px-5 gap-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
                  >
                    {/* 1. Invoice ID */}
                    <div className="font-semibold text-[14px] text-[var(--ink)] tracking-tight truncate">
                      Invoice #{String(item.invoiceId).padStart(4, '0')}
                    </div>

                    {/* 2. Code + Copy Button */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[14px] font-bold text-[#2563EB] dark:text-[#60A5FA] tracking-wide tabular-nums truncate">
                        {item.code}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.code)}
                        className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                        title="Copy code"
                        aria-label="Copy code"
                      >
                        {isCopied ? (
                          <Check className="size-3.5 text-emerald-500" strokeWidth={2.5} />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </div>

                    {/* 3. Amount Paid */}
                    <div className="font-mono text-[13px] text-[var(--ink)] tabular-nums truncate">
                      ${amountFormatted} <span className="text-[11px] text-[var(--muted)] font-sans">USDC</span>
                    </div>

                    {/* 4. Purchased Time */}
                    <div className="text-[12px] text-[var(--muted)] tabular-nums truncate">
                      {timeAgo(item.createdAt)}
                    </div>

                    {/* 5. Begin Hunt Button */}
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          sessionStorage.setItem('gridhunt_initial_view', 'hunt')
                          sessionStorage.setItem('gridhunt_code', item.code)
                          onOpenHunt(BigInt(item.invoiceId))
                        }}
                        className="h-8 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-semibold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <span>Begin Hunt</span>
                        <ArrowRight className="size-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
