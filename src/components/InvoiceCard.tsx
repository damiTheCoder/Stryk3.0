import { CheckCircle2, Clock, Coins, XCircle, ExternalLink, Target, Tag, Layers, ArrowUpRight } from 'lucide-react'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { ARC_TESTNET_ID } from '../contractConfig'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { InvoiceDownloadButton } from './InvoiceDownloadButton'
import type { InvoicePdfData } from '@/lib/invoicePdf'

export interface InvoiceData {
  id: string
  numericId?: number
  onchainId?: number
  creator: string
  vendor?: string
  client?: string
  clientEmail?: string
  debtorRef?: string
  amount: bigint
  taggedAmount?: bigint
  description?: string
  metadataURI?: string
  dueDate: bigint
  status: number // 0=CREATED, 1=PENDING, 2=TOKENIZED, 3=ACTIVE, 4=PAID, 5=DEFAULTED, 6=CANCELLED
  stablecoin?: string
  paymentTxHash?: string
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Issued (Off-Chain)',
  1: 'Pending',
  2: 'Tokenized',
  3: 'Active Board',
  4: 'Paid & Settled',
  5: 'Defaulted',
  6: 'Cancelled',
}

const STATUS_STYLES: Record<number, { bg: string; color: string; icon: React.ReactNode }> = {
  0: {
    bg: 'rgba(59, 130, 246, 0.10)',
    color: '#2563EB',
    icon: <Clock className="size-3.5" />,
  },
  1: {
    bg: 'rgba(196, 123, 0, 0.10)',
    color: 'var(--warning)',
    icon: <Clock className="size-3.5" />,
  },
  2: {
    bg: 'rgba(16, 97, 166, 0.12)',
    color: 'var(--accent-hover)',
    icon: <Coins className="size-3.5" />,
  },
  3: {
    bg: 'rgba(16, 97, 166, 0.12)',
    color: 'var(--accent-hover)',
    icon: <Coins className="size-3.5" />,
  },
  4: {
    bg: 'rgba(37, 99, 235, 0.10)',
    color: 'var(--success)',
    icon: <CheckCircle2 className="size-3.5" />,
  },
  5: {
    bg: 'rgba(186, 43, 76, 0.10)',
    color: 'var(--danger)',
    icon: <XCircle className="size-3.5" />,
  },
  6: {
    bg: 'rgba(186, 43, 76, 0.10)',
    color: 'var(--danger)',
    icon: <XCircle className="size-3.5" />,
  },
}

interface Props {
  invoice: InvoiceData
  connectedAddress?: string
  onPay?: (id: string) => void
  onTokenize?: (invoice: InvoiceData) => void
  onCancel?: (id: string) => void
  onViewAsset?: (id: bigint) => void
  onReportPayment?: (id: string) => void
  explorerTxHash?: string
}

function formatAddress(addr: string) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function parseMetadata(uri?: string) {
  if (!uri) return { description: '', client: '' }
  try {
    if (uri.startsWith('data:application/json;base64,')) {
      const jsonStr = atob(uri.replace('data:application/json;base64,', ''))
      return JSON.parse(jsonStr) as { description?: string; client?: string; clientEmail?: string }
    }
    if (uri.startsWith('{')) {
      return JSON.parse(uri) as { description?: string; client?: string; clientEmail?: string }
    }
  } catch {
    // raw or unparseable
  }
  return { description: uri, client: '' }
}

export default function InvoiceCard({
  invoice,
  connectedAddress,
  onPay,
  onTokenize,
  onViewAsset,
  onReportPayment,
  explorerTxHash,
}: Props) {
  const style = STATUS_STYLES[invoice.status] ?? STATUS_STYLES[0]
  const nowSec = BigInt(Math.floor(new Date().getTime() / 1000))
  const creatorAddr = invoice.creator || invoice.vendor || ''
  const isVendor = !!connectedAddress && connectedAddress.toLowerCase() === creatorAddr.toLowerCase()
  const isOverdue = (invoice.status === 0 || invoice.status === 1) && nowSec > invoice.dueDate
  const dueDateStr = new Date(Number(invoice.dueDate) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const meta = parseMetadata(invoice.metadataURI)
  const displayDescription = invoice.description || meta.description || ''
  const displayClient = invoice.client || meta.client || (invoice.debtorRef ? formatAddress(invoice.debtorRef) : '')

  const formattedAmount = Amount.fromRaw(invoice.amount, usdcDecimalsFor(ARC_TESTNET_ID)).toFixed(2)
  const taggedFormatted = invoice.taggedAmount
    ? (Number(invoice.taggedAmount) / 1_000_000).toFixed(6)
    : undefined

  const pdfData: InvoicePdfData = {
    invoiceId: invoice.id,
    creator: creatorAddr,
    client: displayClient || '—',
    clientEmail: invoice.clientEmail || meta.clientEmail || undefined,
    amount: invoice.amount.toString(),
    amountFormatted: `${formattedAmount} USDC`,
    description: displayDescription || '',
    dueDate: Number(invoice.dueDate),
    paymentAddress: creatorAddr,
  }

  const isTokenized = invoice.status === 2 || invoice.status === 3 || !!invoice.onchainId
  const isPaid = invoice.status === 4

  return (
    <div className="rounded-2xl p-4 space-y-3 bg-[var(--surface)] border-0">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide tabular-nums" style={{ color: 'var(--muted)' }}>
              Invoice {invoice.id}
            </p>
            {invoice.onchainId && (
              <span className="text-[10px] mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-bold">
                Onchain #{invoice.onchainId}
              </span>
            )}
          </div>
          <p className="display text-xl font-bold tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>
            ${formattedAmount} <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </p>
        </div>
        <span
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: style.bg, color: style.color }}
        >
          {style.icon}
          {STATUS_LABELS[invoice.status] ?? 'Unknown'}
          {isOverdue && ' · Overdue'}
        </span>
      </div>

      {/* Tagged reconciliation notice if not paid */}
      {!isPaid && taggedFormatted && (
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl bg-[var(--surface-strong)]">
          <Tag className="size-3 text-blue-600" />
          <span style={{ color: 'var(--muted)' }}>Payment amount:</span>
          <span className="mono font-semibold" style={{ color: 'var(--ink)' }}>{taggedFormatted} USDC</span>
        </div>
      )}

      {/* Description */}
      {displayDescription && (
        <p className="text-sm text-pretty" style={{ color: 'var(--ink-2)' }}>
          {displayDescription}
        </p>
      )}

      {/* Meta rows */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--muted)' }}>Vendor</span>
          <span className="mono font-medium" style={{ color: 'var(--ink-2)' }}>{formatAddress(creatorAddr)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--muted)' }}>Client</span>
          <span className="mono font-medium" style={{ color: 'var(--ink-2)' }}>
            {displayClient.startsWith('0x') ? formatAddress(displayClient) : displayClient}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: 'var(--muted)' }}>Due</span>
          <span className="font-medium" style={{ color: isOverdue ? 'var(--danger)' : 'var(--ink-2)' }}>{dueDateStr}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {/* Payment link button */}
        {!isPaid && (
          <a
            href={`/pay/${invoice.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-xl py-2 px-3 text-xs font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] bg-[#2563EB] hover:bg-[#1D4ED8] cursor-pointer flex items-center justify-center gap-1"
          >
            <span>Pay / View Link</span>
            <ArrowUpRight className="size-3.5" />
          </a>
        )}

        {/* Tokenize Button for un-tokenized invoices */}
        {isVendor && !isTokenized && !isPaid && onTokenize && (
          <button
            onClick={() => onTokenize(invoice)}
            className="flex-1 rounded-xl py-2 px-3 text-xs font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] bg-[#4F46E5] hover:bg-[#4338CA] cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Layers className="size-3.5" />
            <span>Tokenize On-Chain</span>
          </button>
        )}

        {/* Hunt Asset button if tokenized */}
        {isTokenized && onViewAsset && (
          <button
            onClick={() => onViewAsset(BigInt(invoice.onchainId || (typeof invoice.id === 'number' ? invoice.id : 1)))}
            className="flex-1 rounded-xl py-2 px-3 text-xs font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] bg-[#10B981] hover:bg-[#059669] cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Target className="size-3.5" />
            <span>Hunt Asset Details</span>
          </button>
        )}

        {/* Mark paid / report payment for vendor */}
        {isVendor && !isPaid && onReportPayment && (
          <button
            onClick={() => onReportPayment(invoice.id)}
            className="rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer bg-[var(--surface-strong)] text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Mark Paid
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

      {/* Download Receipt — always visible */}
      <div className="flex pt-1">
        <InvoiceDownloadButton data={pdfData} />
      </div>
    </div>
  )
}
