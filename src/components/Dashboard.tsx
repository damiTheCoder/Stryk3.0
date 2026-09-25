import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import {
  ArrowUpRight,
  BarChart3,
  TrendingUp,
  Wallet,
  FileText,
  FilePlus,
  Layers,
  Sparkles,
} from 'lucide-react'
import { INVOICE_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'

function useVendorStats(address?: `0x${string}`) {
  const { data: vendorIds } = useReadContract({
    address: INVOICE_CONTRACT.address,
    abi: INVOICE_CONTRACT.abi,
    functionName: 'getVendorInvoices',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address, refetchInterval: 10000 },
  })
  return (vendorIds as bigint[] | undefined) ?? []
}

function useClientStats(address?: `0x${string}`) {
  const { data: clientIds } = useReadContract({
    address: INVOICE_CONTRACT.address,
    abi: INVOICE_CONTRACT.abi,
    functionName: 'getClientInvoices',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address, refetchInterval: 10000 },
  })
  return (clientIds as bigint[] | undefined) ?? []
}

interface Props {
  onNavigate: (tab: string) => void
}

export default function Dashboard({ onNavigate }: Props) {
  const { address, isConnected } = useAccount()
  const vendorIds = useVendorStats(address)
  const clientIds = useClientStats(address)

  // Interactive funnel selection (default Thursday active)
  const [activeDayIndex, setActiveDayIndex] = useState<number>(3) // index 3 = Thu
  const [funnelPeriod, setFunnelPeriod] = useState<'Monthly' | 'Weekly'>('Monthly')
  const [channelsPeriod, setChannelsPeriod] = useState<'Monthly' | 'Weekly'>('Monthly')

  const funnelDays = [
    { day: 'Mon', height: 52, val: '$142K' },
    { day: 'Tue', height: 44, val: '$118K' },
    { day: 'Wed', height: 38, val: '$95K' },
    { day: 'Thu', height: 92, val: '$243K' }, // peak blue bar
    { day: 'Fri', height: 36, val: '$86K' },
    { day: 'Sat', height: 48, val: '$124K' },
  ]

  // Receivables settlement channels
  const settlementChannels = [
    {
      name: 'Direct Invoices',
      tiles: ['light', 'light', 'blue', 'light'],
    },
    {
      name: 'Escrow Holds',
      tiles: ['light', 'blue', 'black', 'black'],
    },
    {
      name: 'Grid Hunt NFTs',
      tiles: ['blue', 'blue', 'mid', 'mid'],
    },
    {
      name: 'Instant Buyouts',
      tiles: ['light', 'light', 'light', 'black'],
    },
  ]

  return (
    <div className="space-y-2.5 sm:space-y-3 w-full pb-6 font-sans select-none">
      {/* ── Top Row: 3 Bento KPI Cards (Compact & Non-wrapping) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Card 1: Inverted Black Hero Card */}
        <div
          onClick={() => onNavigate('vendor')}
          className="rounded-[20px] sm:rounded-[24px] bg-black text-white p-2.5 sm:p-3.5 md:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px] shadow-sm cursor-pointer transition-transform active:scale-[0.99] group"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Wallet className="size-3.5 text-neutral-300 shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-neutral-300 whitespace-nowrap truncate">
                Available to payout
              </span>
            </div>
            <div className="size-6 sm:size-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs group-hover:scale-110 transition-transform">
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </div>
          </div>

          <div className="my-1">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight whitespace-nowrap">
              {vendorIds.length > 0 ? `$${(vendorIds.length * 3.2).toFixed(1)}K` : '$16.4K'}
            </span>
          </div>

          <div className="whitespace-nowrap truncate text-[11px] font-medium text-neutral-400">
            Payout <span className="opacity-70">•</span> $6.1K available soon
          </div>
        </div>

        {/* Card 2: Light Surface Card */}
        <div
          onClick={() => onNavigate('create')}
          className="rounded-[20px] sm:rounded-[24px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 md:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px] cursor-pointer transition-transform active:scale-[0.99] group border-0 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <TrendingUp className="size-3.5 text-[var(--muted)] shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-[var(--muted)] whitespace-nowrap truncate">
                Total invoiced volume
              </span>
            </div>
            <div className="size-6 sm:size-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shrink-0 group-hover:scale-110 transition-transform">
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </div>
          </div>

          <div className="my-1">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--ink)] whitespace-nowrap">
              {vendorIds.length > 0 ? `$${(vendorIds.length * 6.4).toFixed(1)}K` : '$34.5K'}
            </span>
          </div>

          <div className="whitespace-nowrap truncate text-[11px] font-medium text-[var(--muted)]">
            Settlement <span className="opacity-70">•</span> 92.4% on-time rate
          </div>
        </div>

        {/* Card 3: Light Surface Card */}
        <div
          onClick={() => onNavigate('marketplace')}
          className="rounded-[20px] sm:rounded-[24px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 md:p-4 flex flex-col justify-between min-h-[110px] sm:min-h-[120px] cursor-pointer transition-transform active:scale-[0.99] group border-0 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Layers className="size-3.5 text-[var(--muted)] shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-[var(--muted)] whitespace-nowrap truncate">
                Total receivables
              </span>
            </div>
            <div className="size-6 sm:size-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shrink-0 group-hover:scale-110 transition-transform">
              <ArrowUpRight className="size-3.5" strokeWidth={2.5} />
            </div>
          </div>

          <div className="my-1">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--ink)] whitespace-nowrap">
              {vendorIds.length + clientIds.length > 0 ? (vendorIds.length + clientIds.length) : '400'}
            </span>
          </div>

          <div className="whitespace-nowrap truncate text-[11px] font-medium text-[var(--muted)]">
            Receivables <span className="opacity-70">•</span> 50 active in hunts
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Invoicing Volume Bar Chart & Settlement Channels Matrix ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-3">
        {/* Card 4: Invoicing Volume Bar Chart */}
        <div className="rounded-[20px] sm:rounded-[24px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 md:p-4 flex flex-col justify-between min-h-[220px] sm:min-h-[250px] border-0 shadow-xs">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-[var(--ink)]">Invoicing Volume</h3>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">USDC settlements per month</p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFunnelPeriod(p => (p === 'Monthly' ? 'Weekly' : 'Monthly'))}
                className="px-3 py-1 rounded-full bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer"
              >
                {funnelPeriod}
              </button>
              <button
                type="button"
                className="size-6 sm:size-7 rounded-full bg-[#2563EB] text-xs font-bold text-white flex items-center justify-center hover:bg-[#1D4ED8] transition-colors cursor-pointer"
              >
                <BarChart3 className="size-3.5 text-white" />
              </button>
            </div>
          </div>

          {/* Bar Chart Area with Wide Pill Capsule Bars */}
          <div className="flex-1 flex flex-col justify-end pt-3 pb-1">
            <div className="h-28 sm:h-34 w-full flex items-end justify-between gap-2 sm:gap-3 px-1 sm:px-2">
              {funnelDays.map((item, idx) => {
                const isSelected = activeDayIndex === idx

                return (
                  <div
                    key={item.day}
                    onClick={() => setActiveDayIndex(idx)}
                    className="flex-1 h-full flex flex-col items-center justify-end cursor-pointer group"
                  >
                    {/* Floating Pill Badge over Peak/Selected Bar */}
                    <div className="h-5 mb-1 flex items-center justify-center">
                      {isSelected && (
                        <div className="px-2 py-0.5 rounded-full bg-black text-white dark:bg-white dark:text-black text-[9px] sm:text-[10px] font-extrabold tracking-wide shadow-xs animate-in fade-in duration-200">
                          {item.val}
                        </div>
                      )}
                    </div>

                    {/* Wide Pill Capsule Bar */}
                    <div
                      className={`w-full max-w-[44px] rounded-[16px] sm:rounded-[18px] transition-all duration-300 ${
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
              {funnelDays.map((item, idx) => {
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

        {/* Card 5: Settlement Channels Activity Matrix */}
        <div className="rounded-[20px] sm:rounded-[24px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 md:p-4 flex flex-col justify-between min-h-[220px] sm:min-h-[250px] border-0 shadow-xs">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-base sm:text-lg font-bold tracking-tight text-[var(--ink)]">Settlement Channels</h3>
              <p className="text-[11px] text-[var(--muted)] mt-0.5">Receivables recovery flow</p>
            </div>

            <button
              type="button"
              onClick={() => setChannelsPeriod(p => (p === 'Monthly' ? 'Weekly' : 'Monthly'))}
              className="px-3 py-1 rounded-full bg-[#2563EB] text-xs font-semibold text-white hover:bg-[#1D4ED8] transition-colors cursor-pointer"
            >
              {channelsPeriod}
            </button>
          </div>

          {/* Matrix Grid */}
          <div className="flex-1 flex flex-col justify-center space-y-2 sm:space-y-2.5 py-1">
            {settlementChannels.map(channel => (
              <div key={channel.name} className="flex items-center gap-2 sm:gap-2.5">
                {/* Channel Label */}
                <div className="w-22 sm:w-26 shrink-0 text-xs font-medium text-[var(--ink)] truncate">
                  {channel.name}
                </div>

                {/* 4 Capsule Rounded Tiles */}
                <div className="flex-1 grid grid-cols-4 gap-1.5 sm:gap-2">
                  {channel.tiles.map((type, tIdx) => {
                    let tileColor = 'bg-[var(--surface-strong)]'

                    if (type === 'blue') {
                      tileColor = 'bg-[#2563EB]' // vibrant blue
                    } else if (type === 'black') {
                      tileColor = 'bg-black dark:bg-white' // solid black
                    } else if (type === 'mid') {
                      tileColor = 'bg-neutral-400 dark:bg-neutral-600' // medium grey
                    }

                    return (
                      <div
                        key={tIdx}
                        className={`h-7 sm:h-8 rounded-[10px] sm:rounded-[12px] transition-transform hover:scale-[1.03] cursor-pointer ${tileColor}`}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick Workflows Section ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
        <div
          onClick={() => onNavigate('create')}
          className="rounded-[18px] sm:rounded-[22px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 space-y-1 cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99] group border-0 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FilePlus className="size-4 text-[#2563EB]" />
              <h4 className="text-xs sm:text-sm font-bold text-[var(--ink)]">Create Invoice</h4>
            </div>
            <div className="size-5 sm:size-6 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-bold group-hover:scale-110 transition-transform">
              <ArrowUpRight className="size-3" strokeWidth={2.5} />
            </div>
          </div>
          <p className="text-[11px] text-[var(--muted)] leading-relaxed">
            Issue cryptographic USDC invoices directly to any client address with custom due dates.
          </p>
        </div>

        <div
          onClick={() => onNavigate('vendor')}
          className="rounded-[18px] sm:rounded-[22px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 space-y-1 cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99] group border-0 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText className="size-4 text-[#2563EB]" />
              <h4 className="text-xs sm:text-sm font-bold text-[var(--ink)]">Issued Invoices</h4>
            </div>
            <div className="size-5 sm:size-6 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-bold group-hover:scale-110 transition-transform">
              <ArrowUpRight className="size-3" strokeWidth={2.5} />
            </div>
          </div>
          <p className="text-[11px] text-[var(--muted)] leading-relaxed">
            Track payments, inspect client status, and tokenize overdue receivables into liquid tokens.
          </p>
        </div>

        <div
          onClick={() => onNavigate('marketplace')}
          className="rounded-[18px] sm:rounded-[22px] bg-[var(--surface)] text-[var(--ink)] p-3 sm:p-3.5 space-y-1 cursor-pointer transition-transform hover:scale-[1.01] active:scale-[0.99] group border-0 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-[#2563EB]" />
              <h4 className="text-xs sm:text-sm font-bold text-[var(--ink)]">Grid Hunt Market</h4>
            </div>
            <div className="size-5 sm:size-6 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-bold group-hover:scale-110 transition-transform">
              <ArrowUpRight className="size-3" strokeWidth={2.5} />
            </div>
          </div>
          <p className="text-[11px] text-[var(--muted)] leading-relaxed">
            Participate in 10×10 NFT grid hunts to claim tokenized receivable payouts at a discount.
          </p>
        </div>
      </div>

      {/* ── Wallet / Connect Fallback (if disconnected) ── */}
      {!isConnected && (
        <div className="rounded-[24px] bg-[var(--surface)] text-[var(--ink)] p-5 text-center space-y-2 mt-3">
          <p className="text-xs text-[var(--muted)]">Connect your wallet to manage your on-chain USDC invoices on Arc Testnet</p>
          <div className="inline-block">
            <ConnectKitButton />
          </div>
        </div>
      )}
    </div>
  )
}
