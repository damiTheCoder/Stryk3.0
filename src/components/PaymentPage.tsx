import { useState, useCallback, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { erc20Abi } from 'viem'
import { MoonPayBuyWidget } from '@moonpay/moonpay-react'
import { CreditCard, ArrowRight, CheckCircle, Loader2, ExternalLink, ArrowLeft } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import StrykLogo from './StrykLogo'
import { toast } from 'sonner'
import { INVOICE_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'
import { getUsdc, buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'

const CONTRACT_ADDRESS = INVOICE_CONTRACT.address
const CONTRACT_ABI = INVOICE_CONTRACT.abi
const USDC_ADDRESS = getUsdc(ARC_TESTNET_ID)!.address as `0x${string}`

type InvoiceStatus = 0 | 1 | 2 | 3

interface Invoice {
  id: bigint
  vendor: `0x${string}`
  client: `0x${string}`
  amount: bigint
  description: string
  dueDate: bigint
  status: InvoiceStatus
  tokenContract: `0x${string}`
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Pending',
  1: 'Paid',
  2: 'Tokenized',
  3: 'Cancelled',
}
const STATUS_COLORS: Record<number, string> = {
  0: 'var(--warning)',
  1: 'var(--success)',
  2: '#1061a6',
  3: 'var(--danger)',
}

type PayTab = 'card' | 'crypto'

export default function PaymentPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const idBigInt = invoiceId ? BigInt(invoiceId) : 0n
  const { address } = useAccount()
  const [tab, setTab] = useState<PayTab>('card')
  const [moonpayVisible, setMoonpayVisible] = useState(false)

  const { data: inv, isLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getInvoice',
    args: [idBigInt],
    chainId: ARC_TESTNET_ID,
    query: { enabled: idBigInt > 0n },
  }) as { data: Invoice | undefined; isLoading: boolean }

  // ── Crypto pay flow ──
  const { writeContract: approveWrite, data: approveTxHash } = useWriteContract()
  const { writeContract: payWrite, data: payTxHash } = useWriteContract()
  const { isLoading: approveLoading, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash })
  const { isLoading: payLoading, isSuccess: paySuccess, data: payReceipt } =
    useWaitForTransactionReceipt({ hash: payTxHash })

  const handleApprove = useCallback(() => {
    if (!inv) return
    approveWrite({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CONTRACT_ADDRESS, inv.amount],
    })
  }, [approveWrite, inv])

  const handlePay = useCallback(() => {
    if (!inv) return
    payWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'payInvoice',
      args: [inv.id],
    })
  }, [payWrite, inv])

  useEffect(() => {
    if (paySuccess) {
      toast.success('Invoice paid! USDC sent to vendor.')
    }
  }, [paySuccess])

  // ── MoonPay URL signing ──
  const handleUrlSignatureRequested = useCallback(async (url: string): Promise<string> => {
    try {
      const res = await fetch(`/api/sign-moonpay?url=${encodeURIComponent(url)}`)
      if (!res.ok) {
        // No secret key configured — return empty string (widget works without sig in sandbox)
        return ''
      }
      const data = await res.json() as { signature: string }
      return data.signature
    } catch {
      return ''
    }
  }, [])

  if (!invoiceId) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg-gradient)' }}>
        <p style={{ color: 'var(--muted)' }}>Invalid invoice link.</p>
      </div>
    )
  }

  const moonpayApiKey = import.meta.env.VITE_MOONPAY_PUBLIC_KEY as string | undefined

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
          <StrykLogo size={20} />
          <span className="display text-base font-bold tracking-tight" style={{ color: 'var(--ink)' }}>Stryk</span>
        </div>
        <div className="w-24 flex justify-end">
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

      <main className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Invoice summary card */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : !inv ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: 'var(--surface-strong)' }}
          >
            <p style={{ color: 'var(--muted)' }}>Invoice #{invoiceId} not found.</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-4"
              style={{
                background: 'var(--surface-strong)',
                boxShadow: '0 4px 24px rgba(18,45,69,0.07)',
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs mono font-bold mb-1" style={{ color: 'var(--subtle)' }}>
                    INVOICE #{String(inv.id).padStart(4, '0')}
                  </p>
                  <p className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                    {formatUsdc(inv.amount)}
                    <span className="text-base font-normal ml-1" style={{ color: 'var(--subtle)' }}>USDC</span>
                  </p>
                </div>
                <span
                  className="text-xs font-bold px-3 py-1 rounded-full"
                  style={{
                    background: `${STATUS_COLORS[inv.status]}18`,
                    color: STATUS_COLORS[inv.status],
                  }}
                >
                  {STATUS_LABELS[inv.status]}
                </span>
              </div>

              <p className="text-sm" style={{ color: 'var(--muted)' }}>{inv.description}</p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-muted)' }}>
                  <p className="mb-0.5" style={{ color: 'var(--subtle)' }}>From (Vendor)</p>
                  <a
                    href={buildAddressExplorerUrl(ARC_TESTNET_ID, inv.vendor)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mono font-semibold flex items-center gap-1"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {shortAddr(inv.vendor)}
                    <ExternalLink className="size-3" style={{ color: 'var(--subtle)' }} />
                  </a>
                </div>
                <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--surface-muted)' }}>
                  <p className="mb-0.5" style={{ color: 'var(--subtle)' }}>Due</p>
                  <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>
                    {new Date(Number(inv.dueDate) * 1000).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Already paid */}
            {inv.status === 1 && (
              <div
                className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
                style={{ background: 'rgba(26,128,71,0.06)' }}
              >
                <CheckCircle className="size-10" style={{ color: 'var(--success)' }} />
                <p className="display text-lg font-bold" style={{ color: 'var(--success)' }}>Invoice Paid</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>This invoice has already been settled.</p>
              </div>
            )}

            {/* Cancelled */}
            {inv.status === 3 && (
              <div
                className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center"
                style={{ background: 'rgba(186,43,76,0.06)' }}
              >
                <p className="display text-lg font-bold" style={{ color: 'var(--danger)' }}>Invoice Cancelled</p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>This invoice has been cancelled by the vendor.</p>
              </div>
            )}

            {/* Payment options */}
            {(inv.status === 0 || inv.status === 2) && (
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--surface-strong)' }}
              >
                {/* Tabs */}
                <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {[
                    { id: 'card' as PayTab, label: 'Pay with Card', icon: <CreditCard className="size-4" /> },
                    { id: 'crypto' as PayTab, label: 'Pay with Crypto', icon: <StrykLogo size={16} /> },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold transition-all"
                      style={{
                        background: tab === t.id ? 'var(--accent)' : 'transparent',
                        color: tab === t.id ? '#fff' : 'var(--muted)',
                        borderRight: t.id === 'card' ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      }}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Card tab — MoonPay */}
                {tab === 'card' && (
                  <div className="p-6 flex flex-col gap-4">
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      Pay with your debit/credit card. MoonPay converts your payment to USDC and
                      sends it directly to the vendor's wallet on Arc Testnet.
                    </p>
                    <div
                      className="rounded-xl p-3 flex items-start gap-3 text-xs"
                      style={{ background: 'rgba(16,97,166,0.07)' }}
                    >
                      <CreditCard className="size-4 shrink-0 mt-0.5" style={{ color: '#1061a6' }} />
                      <div style={{ color: '#1061a6' }}>
                        <p className="font-semibold mb-0.5">How it works</p>
                        <p>MoonPay charges your card in your local currency, converts to USDC, and sends {formatUsdc(inv.amount)} USDC directly to the vendor's wallet.</p>
                      </div>
                    </div>

                    {!moonpayApiKey || moonpayApiKey === 'pk_test_YOUR_MOONPAY_PUBLIC_KEY' ? (
                      <div
                        className="rounded-xl p-4 text-sm text-center"
                        style={{ background: 'rgba(196,123,0,0.08)', color: 'var(--warning)' }}
                      >
                        <p className="font-semibold mb-1">MoonPay API Key Required</p>
                        <p>Add your MoonPay publishable key to <code className="mono text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(196,123,0,0.12)' }}>.env</code> as <code className="mono text-xs">VITE_MOONPAY_PUBLIC_KEY</code> to enable card payments.</p>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setMoonpayVisible(true)}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
                          style={{ background: 'var(--accent)', color: '#fff' }}
                        >
                          <CreditCard className="size-4" />
                          Pay {formatUsdc(inv.amount)} with Card
                        </button>
                        <MoonPayBuyWidget
                          variant="overlay"
                          visible={moonpayVisible}
                          currencyCode="usdc_eth"
                          quoteCurrencyAmount={String(Number(inv.amount) / 1_000_000)}
                          walletAddress={inv.vendor}
                          lockAmount="true"
                          onUrlSignatureRequested={handleUrlSignatureRequested}
                          onCloseOverlay={() => setMoonpayVisible(false)}
                        />
                      </>
                    )}
                  </div>
                )}

                {/* Crypto tab — wagmi USDC */}
                {tab === 'crypto' && (
                  <div className="p-6 flex flex-col gap-4">
                    <p className="text-sm" style={{ color: 'var(--muted)' }}>
                      Pay directly with USDC from your connected wallet. You'll approve the amount and confirm the payment in two steps.
                    </p>

                    {!address ? (
                      <div className="flex flex-col items-center gap-3 py-4">
                        <p className="text-sm" style={{ color: 'var(--subtle)' }}>Connect your wallet to pay with crypto.</p>
                        <ConnectKitButton
                          customTheme={{
                            '--ck-font-family': "'DM Sans', sans-serif",
                            '--ck-primary-button-background': '#122d45',
                            '--ck-primary-button-hover-background': '#1061a6',
                          }}
                        />
                      </div>
                    ) : paySuccess ? (
                      <div className="flex flex-col items-center gap-3 py-6 text-center">
                        <CheckCircle className="size-12" style={{ color: 'var(--success)' }} />
                        <p className="display text-lg font-bold" style={{ color: 'var(--success)' }}>Payment Sent!</p>
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>
                          {formatUsdc(inv.amount)} USDC sent to vendor.
                        </p>
                        {payReceipt && (
                          <a
                            href={buildTxExplorerUrl(ARC_TESTNET_ID, payReceipt.transactionHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-medium"
                            style={{ color: '#1061a6' }}
                          >
                            View transaction <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    ) : !approveSuccess ? (
                      <button
                        onClick={handleApprove}
                        disabled={approveLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
                        style={{
                          background: 'var(--accent)',
                          color: '#fff',
                          opacity: approveLoading ? 0.6 : 1,
                        }}
                      >
                        {approveLoading
                          ? <><Loader2 className="size-4 animate-spin" /> Approving…</>
                          : <><ArrowRight className="size-4" /> Approve {formatUsdc(inv.amount)} USDC</>}
                      </button>
                    ) : (
                      <button
                        onClick={handlePay}
                        disabled={payLoading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all"
                        style={{
                          background: 'var(--success)',
                          color: '#fff',
                          opacity: payLoading ? 0.6 : 1,
                        }}
                      >
                        {payLoading
                          ? <><Loader2 className="size-4 animate-spin" /> Paying…</>
                          : <><ArrowRight className="size-4" /> Confirm Payment</>}
                      </button>
                    )}
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
