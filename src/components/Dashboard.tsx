import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { FileText, Coins, CheckCircle2, Clock } from 'lucide-react'
import { INVOICE_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'
import StrykLogo from './StrykLogo'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  accent?: string
}

function StatCard({ label, value, sub, icon, accent = 'var(--accent)' }: StatCardProps) {
  return (
    <div
      className="rounded-2xl p-4 flex items-start gap-3"
      style={{ background: 'var(--surface-strong)', backdropFilter: 'blur(20px)' }}
    >
      <div
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
      >
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</p>
        <p className="display text-2xl font-bold tabular-nums leading-tight mt-0.5" style={{ color: 'var(--ink)' }}>{value}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{sub}</p>}
      </div>
    </div>
  )
}

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

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div
        className="rounded-3xl p-6 relative overflow-hidden"
        style={{
          background: '#0a0a0a',
          boxShadow: '0 0 80px rgba(255,255,255,0.03)',
        }}
      >
        {/* subtle radial glow top-right */}
        <div
          className="absolute -top-16 -right-16 w-64 h-64 rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)' }}
        />
        <div className="flex items-center gap-2.5 mb-4 relative">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.08)' }}
          >
            <StrykLogo size={22} />
          </div>
          <span className="display text-xl font-bold" style={{ color: '#f5f5f5', letterSpacing: '-0.02em' }}>Stryk</span>
        </div>
        <p className="display text-3xl font-bold leading-tight text-balance" style={{ color: '#f5f5f5' }}>
          Stablecoin Invoicing
          <br /><span style={{ color: 'rgba(245,245,245,0.55)' }}>& Receivables</span>
        </p>
        <p className="mt-3 text-sm text-pretty" style={{ color: 'rgba(245,245,245,0.5)' }}>
          Issue USDC invoices, collect payments, and tokenize overdue receivables as tradeable ERC-20 tokens.
        </p>
        {!isConnected && (
          <div className="mt-5">
            <ConnectKitButton
              customTheme={{
                '--ck-font-family': "'Glacial Indifference', sans-serif",
                '--ck-primary-button-background': '#f5f5f5',
                '--ck-primary-button-color': '#0a0a0a',
                '--ck-primary-button-hover-background': '#ffffff',
                '--ck-body-background': '#111111',
                '--ck-body-color': '#f5f5f5',
              }}
            />
          </div>
        )}
      </div>

      {isConnected && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Issued"
              value={vendorIds.length}
              sub="as vendor"
              icon={<FileText className="size-4" />}
              accent="var(--accent)"
            />
            <StatCard
              label="Received"
              value={clientIds.length}
              sub="as client"
              icon={<Clock className="size-4" />}
              accent="var(--warning)"
            />
          </div>

          {/* Quick actions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>Quick Actions</p>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => onNavigate('create')}
                className="flex items-center gap-3 rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: 'var(--surface-strong)' }}
              >
                <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'rgba(18,45,69,0.08)' }}>
                  <FileText className="size-4" style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Create Invoice</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Issue a USDC invoice to a client</p>
                </div>
              </button>

              <button
                onClick={() => onNavigate('vendor')}
                className="flex items-center gap-3 rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: 'var(--surface-strong)' }}
              >
                <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'rgba(26,128,71,0.08)' }}>
                  <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>My Issued Invoices</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Pay, cancel, or tokenize overdue</p>
                </div>
              </button>

              <button
                onClick={() => onNavigate('client')}
                className="flex items-center gap-3 rounded-2xl p-4 text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{ background: 'var(--surface-strong)' }}
              >
                <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'rgba(16,97,166,0.10)' }}>
                  <Coins className="size-4" style={{ color: 'var(--accent-hover)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Invoices for Me</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Pay invoices sent to your address</p>
                </div>
              </button>
            </div>
          </div>

          {/* How it works */}
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ background: 'var(--surface-muted)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)' }}>How Tokenization Works</p>
            <div className="space-y-2 text-sm" style={{ color: 'var(--ink-2)' }}>
              <p>1. Vendor issues a USDC invoice with a due date.</p>
              <p>2. If unpaid after the due date, vendor can <strong>tokenize</strong> it.</p>
              <p>3. Tokenization mints 1 ERC-20 token representing the receivable.</p>
              <p>4. That token can be sold or transferred to any address.</p>
              <p>5. When the invoice is eventually paid, USDC goes to the <em>current</em> token holder.</p>
            </div>
          </div>
        </>
      )}

      {!isConnected && (
        <div className="rounded-2xl p-6 text-center space-y-3" style={{ background: 'var(--surface-muted)' }}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Connect your wallet to start issuing invoices on Arc Testnet.
          </p>
          <ConnectKitButton />
        </div>
      )}
    </div>
  )
}
