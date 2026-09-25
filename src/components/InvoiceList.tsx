import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { Loader2, RefreshCw, Inbox } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import InvoiceCard, { type InvoiceData } from './InvoiceCard'
import { INVOICE_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'
import { getUsdc } from '@/onchain-facts'


const usdcFact = getUsdc(ARC_TESTNET_ID)!

interface Props {
  mode: 'vendor' | 'client' | 'all'
}

function useInvoiceIds(mode: 'vendor' | 'client' | 'all', address?: `0x${string}`) {
  const vendorResult = useReadContract({
    address: INVOICE_CONTRACT.address,
    abi: INVOICE_CONTRACT.abi,
    functionName: 'getVendorInvoices',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && mode !== 'client', refetchInterval: 8000 },
  })
  const clientResult = useReadContract({
    address: INVOICE_CONTRACT.address,
    abi: INVOICE_CONTRACT.abi,
    functionName: 'getClientInvoices',
    args: [address ?? '0x0000000000000000000000000000000000000000'],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && mode !== 'vendor', refetchInterval: 8000 },
  })

  if (mode === 'vendor') return { ids: (vendorResult.data as bigint[] | undefined) ?? [], isLoading: vendorResult.isLoading, refetch: vendorResult.refetch }
  if (mode === 'client') return { ids: (clientResult.data as bigint[] | undefined) ?? [], isLoading: clientResult.isLoading, refetch: clientResult.refetch }

  const vIds = (vendorResult.data as bigint[] | undefined) ?? []
  const cIds = (clientResult.data as bigint[] | undefined) ?? []
  const combined = [...new Set([...vIds.map(String), ...cIds.map(String)])].map(BigInt)
  return { ids: combined, isLoading: vendorResult.isLoading || clientResult.isLoading, refetch: () => { void vendorResult.refetch(); void clientResult.refetch() } }
}

function SingleInvoice({ id, connectedAddress, onAction }: { id: bigint; connectedAddress?: string; onAction: () => void }) {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = chainId !== ARC_TESTNET_ID

  const { data, isLoading } = useReadContract({
    address: INVOICE_CONTRACT.address,
    abi: INVOICE_CONTRACT.abi,
    functionName: 'getInvoice',
    args: [id],
    chainId: ARC_TESTNET_ID,
    query: { refetchInterval: 8000 },
  })

  const invoice = data as InvoiceData | undefined

  // Allowance check for pay
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcFact.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [connectedAddress as `0x${string}`, INVOICE_CONTRACT.address],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!connectedAddress && !!invoice && (invoice.status === 0 || invoice.status === 2) },
  })

  const { writeContract: approve, data: approveHash, isPending: isApproving, reset: resetApprove } = useWriteContract()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  const { writeContract: doAction, data: actionHash, isPending: actionPending, reset: resetAction } = useWriteContract()
  const { isLoading: actionConfirming, isSuccess: actionSuccess } = useWaitForTransactionReceipt({ hash: actionHash })

  if (approveSuccess) { void refetchAllowance(); resetApprove() }
  if (actionSuccess) { toast.success('Transaction confirmed!'); resetAction(); onAction() }

  const needsApproval = invoice && (invoice.status === 0 || invoice.status === 2)
    ? (allowance ?? 0n) < invoice.amount
    : false

  const handlePay = (invoiceId: bigint) => {
    if (!invoice) return
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }

    if (needsApproval) {
      approve({
        address: usdcFact.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'approve',
        args: [INVOICE_CONTRACT.address, invoice.amount],
        chainId: ARC_TESTNET_ID,
      })
    } else {
      doAction({
        address: INVOICE_CONTRACT.address,
        abi: INVOICE_CONTRACT.abi,
        functionName: 'payInvoice',
        args: [invoiceId],
        chainId: ARC_TESTNET_ID,
      })
    }
  }

  const handleTokenize = (invoiceId: bigint) => {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    doAction({
      address: INVOICE_CONTRACT.address,
      abi: INVOICE_CONTRACT.abi,
      functionName: 'tokenizeInvoice',
      args: [invoiceId],
      chainId: ARC_TESTNET_ID,
    })
  }

  const handleCancel = (invoiceId: bigint) => {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    doAction({
      address: INVOICE_CONTRACT.address,
      abi: INVOICE_CONTRACT.abi,
      functionName: 'cancelInvoice',
      args: [invoiceId],
      chainId: ARC_TESTNET_ID,
    })
  }

  if (isLoading) {
    return (
      <div className="rounded-2xl p-4 flex items-center gap-2 bg-[var(--surface)] border-0 shadow-xs">
        <Loader2 className="size-4 animate-spin" style={{ color: 'var(--subtle)' }} />
        <span className="text-sm" style={{ color: 'var(--muted)' }}>Loading invoice #{id.toString()}...</span>
      </div>
    )
  }

  if (!invoice || invoice.id === 0n) return null

  const isBusy = isApproving || approveConfirming || actionPending || actionConfirming

  return (
    <div className="relative">
      {isBusy && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(4px)' }}>
          <Loader2 className="size-5 animate-spin" style={{ color: 'var(--accent)' }} />
          <span className="ml-2 text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {isApproving || approveConfirming ? 'Approving USDC...' : 'Processing...'}
          </span>
        </div>
      )}
      {needsApproval && (invoice.status === 0 || invoice.status === 2) && (
        <div className="mb-2 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(196,123,0,0.08)', color: 'var(--warning)' }}>
          Approve USDC spending first, then pay the invoice.
        </div>
      )}
      <InvoiceCard
        invoice={invoice}
        connectedAddress={connectedAddress}
        onPay={handlePay}
        onTokenize={handleTokenize}
        onCancel={handleCancel}
      />
    </div>
  )
}

export default function InvoiceList({ mode }: Props) {
  const { address } = useAccount()
  const { ids, isLoading, refetch } = useInvoiceIds(mode, address)
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = () => {
    setRefreshing(true)
    void Promise.resolve(refetch())
    setTimeout(() => setRefreshing(false), 600)
  }

  const titleMap = {
    vendor: 'Invoices I Issued',
    client: 'Invoices for Me',
    all: 'All My Invoices',
  }

  return (
    <div className="space-y-4 w-full pb-6 font-sans">
      <div className="flex items-center justify-between">
        <div>
          <p className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>{titleMap[mode]}</p>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            {ids.length} invoice{ids.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all hover:scale-[1.01] bg-[#2563EB] text-white hover:bg-[#1D4ED8] cursor-pointer"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {!address && (
        <div className="rounded-2xl p-6 text-center bg-[var(--surface)] border-0 shadow-xs">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to view invoices.</p>
        </div>
      )}

      {address && isLoading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="size-5 animate-spin" style={{ color: 'var(--subtle)' }} />
          <span className="text-sm" style={{ color: 'var(--muted)' }}>Loading invoices...</span>
        </div>
      )}

      {address && !isLoading && ids.length === 0 && (
        <div className="rounded-2xl p-8 flex flex-col items-center gap-3 bg-[var(--surface)] border-0 shadow-xs">
          <Inbox className="size-8" style={{ color: 'var(--subtle)' }} />
          <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>No invoices yet.</p>
        </div>
      )}

      {address && ids.length > 0 && (
        <div className="space-y-3">
          {[...ids].reverse().map(id => (
            <SingleInvoice
              key={id.toString()}
              id={id}
              connectedAddress={address}
              onAction={handleRefresh}
            />
          ))}
        </div>
      )}
    </div>
  )
}
