import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useWriteContract, useAccount, useSwitchChain, usePublicClient } from 'wagmi'
import { erc20Abi } from 'viem'
import { ArrowRight, CheckCircle, Loader2, ExternalLink, ArrowLeft, Tag, ShieldCheck, AlertCircle } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import StrykLogo from './StrykLogo'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { ARC_TESTNET_ID } from '../contractConfig'
import { getUsdc, buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'
import { InvoiceDownloadButton } from './InvoiceDownloadButton'
import type { InvoicePdfData } from '@/lib/invoicePdf'

const USDC_ADDRESS = getUsdc(ARC_TESTNET_ID)!.address as `0x${string}`

interface ApiInvoice {
  id: string
  numeric_id?: number
  onchain_id?: number
  creator: string
  client_address?: string
  client_email?: string
  description?: string
  amount: string
  amount_usdc: number
  tagged_amount?: string
  tagged_amount_usdc?: number
  stablecoin: string
  due_date: number
  debtor_ref?: string
  metadata_uri?: string
  status: number
  status_label: string
  is_overdue: boolean
  payment_tx_hash?: string
  paid_at?: number
}

function shortAddr(a: string) {
  if (!a) return ''
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Created',
  1: 'Pending',
  2: 'Tokenized',
  3: 'Active',
  4: 'Paid',
  5: 'Defaulted',
  6: 'Cancelled',
}

const STATUS_COLORS: Record<number, string> = {
  0: 'var(--warning)',
  1: 'var(--warning)',
  2: '#1061a6',
  3: '#1061a6',
  4: 'var(--success)',
  5: 'var(--danger)',
  6: 'var(--danger)',
}

export default function PaymentPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient()
  const wrongChain = chainId !== ARC_TESTNET_ID

  const [inv, setInv] = useState<ApiInvoice | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPaying, setIsPaying] = useState(false)
  const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null)
  const [isPollingStatus, setIsPollingStatus] = useState(false)
  const [pollTimeoutReached, setPollTimeoutReached] = useState(false)

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollCountRef = useRef(0)

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) return
    try {
      const res = await fetch(api(`/api/invoices/${invoiceId}`))
      if (res.ok) {
        const data = await res.json() as ApiInvoice
        setInv(data)
        if (data.status === 4 && data.payment_tx_hash && !paymentTxHash) {
          setPaymentTxHash(data.payment_tx_hash)
        }
      } else {
        setInv(null)
      }
    } catch (err) {
      console.error('Failed to fetch invoice:', err)
      setInv(null)
    } finally {
      setIsLoading(false)
    }
  }, [invoiceId, paymentTxHash])

  useEffect(() => {
    void fetchInvoice()
  }, [fetchInvoice])

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [])

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollCountRef.current = 0
    setIsPollingStatus(true)
    setPollTimeoutReached(false)

    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current += 1
      if (!invoiceId) return

      try {
        const res = await fetch(api(`/api/invoices/${invoiceId}`))
        if (res.ok) {
          const data = await res.json() as ApiInvoice
          setInv(data)
          if (data.status === 4) {
            // Settled! Stop polling
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            setIsPollingStatus(false)
            toast.success('Payment settled and confirmed!')
            return
          }
        }
      } catch (e) {
        console.error('Polling error:', e)
      }

      // Max 12 polls (2 minutes at 10s intervals)
      if (pollCountRef.current >= 12) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        setIsPollingStatus(false)
        setPollTimeoutReached(true)
      }
    }, 10000)
  }, [invoiceId])

  const { writeContractAsync } = useWriteContract()

  const handleDirectPayment = async () => {
    if (!inv) return
    if (wrongChain) {
      switchChain({ chainId: ARC_TESTNET_ID })
      return
    }

    setIsPaying(true)
    try {
      const recipient = inv.creator as `0x${string}`
      const amountToTransfer = BigInt(inv.tagged_amount || inv.amount)

      toast.info('Please confirm direct USDC payment in your wallet...')
      const txHash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipient, amountToTransfer],
        chainId: ARC_TESTNET_ID,
      })

      setPaymentTxHash(txHash)
      toast.info('Payment broadcasted! Waiting for block confirmation...')

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (receipt.status === 'reverted') {
          toast.error('Transaction reverted on-chain.')
          setIsPaying(false)
          return
        }
      }

      // Report payment to backend for instant update
      try {
        await fetch(api(`/api/invoices/${inv.id}/report-payment`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tx_hash: txHash }),
        })
      } catch (err) {
        console.error('Failed to report payment to backend:', err)
      }

      toast.success('USDC transfer confirmed on-chain!')
      void fetchInvoice()
      startPolling()

    } catch (err) {
      console.error('Payment failed:', err)
      toast.error('Payment failed: ' + ((err as Error)?.message ?? String(err)))
    } finally {
      setIsPaying(false)
    }
  }

  if (!invoiceId) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
        <p style={{ color: 'var(--muted)' }}>Invalid invoice link.</p>
      </div>
    )
  }

  const pdfData: InvoicePdfData | null = inv ? {
    invoiceId: inv.id,
    creator: inv.creator,
    client: inv.client_address || '—',
    clientEmail: inv.client_email || undefined,
    amount: inv.amount,
    amountFormatted: `${inv.amount_usdc.toFixed(2)} USDC`,
    description: inv.description || '',
    dueDate: inv.due_date,
    paymentAddress: inv.creator,
  } : null

  const isPaid = inv?.status === 4 || !!paymentTxHash

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 px-4 py-3 flex items-center justify-between"
        style={{
          background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <Link
          to="/"
          className="flex items-center gap-2 text-sm font-medium"
          style={{ color: 'var(--muted)' }}
        >
          <ArrowLeft className="size-4" />
          Back to app
        </Link>
        <div className="flex items-center gap-2">
          <StrykLogo size={24} />
          <span className="display text-base font-bold tracking-tight" style={{ color: 'var(--ink)' }}>Veo</span>
        </div>
        <div className="flex justify-end">
          <ConnectKitButton
            customTheme={{
              '--ck-font-family': "'Glacial Indifference', sans-serif",
              '--ck-primary-button-background': '#f5f5f5',
              '--ck-primary-button-hover-background': '#ffffff',
              '--ck-body-background': '#111111',
              '--ck-body-color': '#f5f5f5',
            }}
          />
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : !inv ? (
          <div className="rounded-2xl p-8 text-center bg-[var(--surface)] border-0">
            <p style={{ color: 'var(--muted)' }}>Invoice {invoiceId} not found.</p>
          </div>
        ) : (
          <>
            {/* Summary card */}
            <div className="rounded-2xl p-6 flex flex-col gap-4 bg-[var(--surface)] border-0">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs mono font-bold mb-1" style={{ color: 'var(--subtle)' }}>
                    INVOICE {inv.id}
                  </p>
                  <p className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                    {inv.amount_usdc.toFixed(2)}
                    <span className="text-base font-normal ml-1" style={{ color: 'var(--subtle)' }}>USDC</span>
                  </p>
                </div>
                <span
                  className="text-xs font-bold px-3 py-1 rounded-full"
                  style={{
                    background: `${STATUS_COLORS[inv.status] || '#1061a6'}18`,
                    color: STATUS_COLORS[inv.status] || '#1061a6',
                  }}
                >
                  {STATUS_LABELS[inv.status] ?? 'Pending'}
                </span>
              </div>

              {inv.description && (
                <p className="text-sm text-pretty" style={{ color: 'var(--ink-2)' }}>{inv.description}</p>
              )}

              {/* Tagged Amount Breakdown */}
              <div className="rounded-xl p-3 bg-[var(--surface-strong)] flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-medium" style={{ color: 'var(--muted)' }}>
                    <Tag className="size-3.5 text-blue-500" />
                    Direct Payment Amount:
                  </span>
                  <span className="mono font-bold" style={{ color: 'var(--ink)' }}>
                    {inv.tagged_amount_usdc ? inv.tagged_amount_usdc.toFixed(6) : inv.amount_usdc.toFixed(6)} USDC
                  </span>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>
                  Includes unique +{(inv.numeric_id ? inv.numeric_id / 1_000_000 : 0.000001).toFixed(6)} USDC micro-tag for automatic reconciliation.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl px-3 py-2.5 bg-[var(--surface-strong)] border-0">
                  <p className="mb-0.5" style={{ color: 'var(--subtle)' }}>Recipient (Vendor)</p>
                  <a
                    href={buildAddressExplorerUrl(ARC_TESTNET_ID, inv.creator)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono font-semibold flex items-center gap-1"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {shortAddr(inv.creator)}
                    <ExternalLink className="size-3" style={{ color: 'var(--subtle)' }} />
                  </a>
                </div>
                <div className="rounded-xl px-3 py-2.5 bg-[var(--surface-strong)] border-0">
                  <p className="mb-0.5" style={{ color: 'var(--subtle)' }}>Due Date</p>
                  <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>
                    {new Date(inv.due_date * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {pdfData && (
                <div className="pt-1">
                  <InvoiceDownloadButton data={pdfData} />
                </div>
              )}
            </div>

            {/* Paid confirmation */}
            {isPaid ? (
              <div className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center bg-[var(--surface)] border-0">
                <CheckCircle className="size-12" style={{ color: 'var(--success)' }} />
                <div>
                  <p className="display text-lg font-bold" style={{ color: 'var(--success)' }}>
                    Invoice Paid & Settled
                  </p>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                    Payment of {(inv.tagged_amount_usdc ?? inv.amount_usdc).toFixed(6)} USDC received directly by vendor.
                  </p>
                </div>
                {paymentTxHash && (
                  <a
                    href={buildTxExplorerUrl(ARC_TESTNET_ID, paymentTxHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-mono font-medium px-3 py-1.5 rounded-xl bg-[var(--surface-strong)]"
                    style={{ color: 'var(--accent)' }}
                  >
                    Tx: {shortAddr(paymentTxHash)} <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            ) : inv.status === 6 ? (
              <div className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center bg-[var(--surface)] border-0">
                <p className="display text-lg font-bold" style={{ color: 'var(--danger)' }}>Invoice Cancelled</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>This invoice was cancelled by the vendor.</p>
              </div>
            ) : (
              /* Pay Action Box */
              <div className="rounded-2xl p-6 flex flex-col gap-4 bg-[var(--surface)] border-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-blue-600" />
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    Direct ERC-20 USDC Transfer
                  </p>
                </div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  One single transfer from your wallet directly to the vendor. No extra approvals or escrow contracts required.
                </p>

                {!address ? (
                  <div className="flex flex-col items-center gap-3 py-3">
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>Connect wallet on Arc Testnet to pay</p>
                    <ConnectKitButton />
                  </div>
                ) : (
                  <button
                    onClick={handleDirectPayment}
                    disabled={isPaying}
                    className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer bg-[#2563EB] hover:bg-[#1D4ED8]"
                  >
                    {wrongChain ? (
                      'Switch to Arc Testnet'
                    ) : isPaying ? (
                      <><Loader2 className="size-4 animate-spin" /> Confirming Payment...</>
                    ) : (
                      <><ArrowRight className="size-4" /> Pay {(inv.tagged_amount_usdc ?? inv.amount_usdc).toFixed(6)} USDC Direct</>
                    )}
                  </button>
                )}

                {isPollingStatus && (
                  <div className="flex items-center justify-center gap-2 text-xs py-1" style={{ color: 'var(--muted)' }}>
                    <Loader2 className="size-3.5 animate-spin text-blue-600" />
                    <span>Verifying settlement on-chain...</span>
                  </div>
                )}

                {pollTimeoutReached && (
                  <div className="rounded-xl p-3 flex items-start gap-2 bg-yellow-500/10 text-yellow-600 text-xs">
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Payment Broadcasted</p>
                      <p>Transaction received on-chain. Status will update within a few minutes.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
