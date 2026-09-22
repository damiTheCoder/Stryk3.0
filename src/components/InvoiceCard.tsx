import { CheckCircle2, Clock, Coins, XCircle, ExternalLink } from 'lucide-react'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARC_TESTNET_ID } from '../contractConfig'
import { buildTxExplorerUrl } from '@/onchain-facts'

export interface InvoiceData {
  id: bigint
  vendor: string
  client: string
  amount: bigint
  description: string
  dueDate: bigint
  status: number // 0=Pending, 1=Paid, 2=Tokenized, 3=Cancelled
  tokenContract: string
}

const STATUS_LABELS = ['Pending', 'Paid', 'Tokenized', 'Cancelled'] as const

const STATUS_STYLES: Record<number, { bg: string; color: string; icon: React.ReactNode }> = {
  0: {
    bg: 'rgba(196, 123, 0, 0.10)',
    color: 'var(--warning)',
    icon: <Clock className="size-3.5" />,
  },
  1: {
    bg: 'rgba(26, 128, 71, 0.10)',
    color: 'var(--success)',
    icon: <CheckCircle2 className="size-3.5" />,
  },
  2: {
    bg: 'rgba(16, 97, 166, 0.12)',
    color: 'var(--accent-hover)',
    icon: <Coins className="size-3.5" />,
  },
  3: {
    bg: 'rgba(186, 43, 76, 0.10)',
    color: 'var(--danger)',
    icon: <XCircle className="size-3.5" />,
  },
}

interface Props {
  invoice: InvoiceData
  connectedAddress?: string
  onPay?: (id: bigint) => void
  onTokenize?: (id: bigint) => void
  onCancel?: (id: bigint) => void
  explorerTxHash?: string
}

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function InvoiceCard({ invoice, connectedAddress, onPay, onTokenize, onCancel, explorerTxHash }: Props) {
  const style = STATUS_STYLES[invoice.status] ?? STATUS_STYLES[3]
  const nowSec = BigInt(Math.floor(new Date().getTime() / 1000))
  const isVendor = connectedAddress?.toLowerCase() === invoice.vendor.toLowerCase()
  const isOverdue = invoice.status === 0 && nowSec > invoice.dueDate
  const dueDateStr = new Date(Number(invoice.dueDate) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const formattedAmount = Amount.fromRaw(invoice.amount, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: 'var(--surface-strong)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide tabular-nums" style={{ color: 'var(--muted)' }}>
            Invoice #{invoice.id.toString()}
          </p>
          <p className="display text-xl font-bold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>
            ${formattedAmount} <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </p>
        </div>
        <span
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: style.bg, color: style.color }}
        >
          {style.icon}
          {STATUS_LABELS[invoice.status]}
          {isOverdue && invoice.status === 0 && ' · Overdue'}
        </span>
      </div>

      {/* Description */}
      {invoice.description && (
        <p className="text-sm text-pretty" style={{ color: 'var(--ink-2)' }}>
          {invoice.description}
        </p>
      )}

      {/* Meta rows */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--muted)' }}>Vendor</span>
          <span className="mono font-medium" style={{ color: 'var(--ink-2)' }}>{formatAddress(invoice.vendor)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--muted)' }}>Client</span>
          <span className="mono font-medium" style={{ color: 'var(--ink-2)' }}>{formatAddress(invoice.client)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--muted)' }}>Due</span>
          <span className="font-medium" style={{ color: isOverdue ? 'var(--danger)' : 'var(--ink-2)' }}>{dueDateStr}</span>
        </div>
        {invoice.tokenContract && invoice.tokenContract !== '0x0000000000000000000000000000000000000000' && (
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--muted)' }}>Token</span>
            <span className="mono font-medium" style={{ color: 'var(--accent-hover)' }}>{formatAddress(invoice.tokenContract)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {(onPay || onTokenize || onCancel || explorerTxHash) && (
        <div className="flex gap-2 pt-1">
          {invoice.status === 0 && onPay && (
            <button
              onClick={() => onPay(invoice.id)}
              className="flex-1 rounded-xl py-2 text-xs font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: 'var(--accent)' }}
            >
              Pay Invoice
            </button>
          )}
          {invoice.status === 2 && onPay && (
            <button
              onClick={() => onPay(invoice.id)}
              className="flex-1 rounded-xl py-2 text-xs font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: 'var(--accent-hover)' }}
            >
              Pay (Tokenized)
            </button>
          )}
          {isVendor && isOverdue && invoice.status === 0 && onTokenize && (
            <button
              onClick={() => onTokenize(invoice.id)}
              className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: 'rgba(16,97,166,0.1)', color: 'var(--accent-hover)' }}
            >
              Tokenize
            </button>
          )}
          {isVendor && invoice.status === 0 && !isOverdue && onCancel && (
            <button
              onClick={() => onCancel(invoice.id)}
              className="rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
            >
              Cancel
            </button>
          )}
          {explorerTxHash && (
            <a
              href={buildTxExplorerUrl(ARC_TESTNET_ID, explorerTxHash)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold"
              style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
            >
              <ExternalLink className="size-3" />
              Explorer
            </a>
          )}
        </div>
      )}
    </div>
  )
}
