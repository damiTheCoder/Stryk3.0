import { useAccount } from 'wagmi'
import { Loader2, RefreshCw, Inbox } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import InvoiceCard, { type InvoiceData } from './InvoiceCard'
import { api } from '@/lib/api'

interface Props {
  mode: 'vendor' | 'client' | 'all'
  onOpenHunt?: (id: bigint) => void
  onTokenize?: (invoice: InvoiceData) => void
}

interface ApiInvoiceItem {
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
  payment_tx_hash?: string
}

export default function InvoiceList({ mode, onOpenHunt, onTokenize }: Props) {
  const { address } = useAccount()
  const [invoices, setInvoices] = useState<InvoiceData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const fetchInvoices = useCallback(async () => {
    setIsLoading(true)
    try {
      let url = api('/api/invoices')
      if (mode === 'vendor' && address) {
        url = api(`/api/invoices?creator=${address.toLowerCase()}`)
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = (await res.json()) as ApiInvoiceItem[]
        const mapped: InvoiceData[] = data
          .filter(d => {
            if (mode === 'vendor' && address) {
              return d.creator.toLowerCase() === address.toLowerCase()
            }
            if (mode === 'client' && address) {
              return d.client_address && d.client_address.toLowerCase() === address.toLowerCase()
            }
            return true
          })
          .map(d => ({
            id: d.id,
            numericId: d.numeric_id,
            onchainId: d.onchain_id,
            creator: d.creator,
            vendor: d.creator,
            client: d.client_address,
            clientEmail: d.client_email,
            debtorRef: d.debtor_ref,
            amount: BigInt(d.amount),
            taggedAmount: d.tagged_amount ? BigInt(d.tagged_amount) : undefined,
            description: d.description,
            metadataURI: d.metadata_uri,
            dueDate: BigInt(d.due_date),
            status: d.status,
            stablecoin: d.stablecoin,
            paymentTxHash: d.payment_tx_hash,
          }))
        setInvoices(mapped)
      } else {
        setInvoices([])
      }
    } catch (err) {
      console.error('Failed to fetch invoices:', err)
      setInvoices([])
    } finally {
      setIsLoading(false)
    }
  }, [address, mode])

  useEffect(() => {
    void fetchInvoices()
  }, [fetchInvoices])

  const handleRefresh = () => {
    setRefreshing(true)
    void Promise.resolve(fetchInvoices())
    setTimeout(() => setRefreshing(false), 600)
  }

  const handleReportPayment = async (id: string) => {
    try {
      const res = await fetch(api(`/api/invoices/${id}/report-payment`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        toast.success(`Invoice ${id} marked as paid.`)
        void fetchInvoices()
      } else {
        toast.error('Failed to update invoice.')
      }
    } catch {
      toast.error('Failed to report payment.')
    }
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
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
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

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="size-5 animate-spin" style={{ color: 'var(--subtle)' }} />
          <span className="text-sm" style={{ color: 'var(--muted)' }}>Loading invoices...</span>
        </div>
      )}

      {!isLoading && invoices.length === 0 && (
        <div className="rounded-2xl p-8 flex flex-col items-center gap-3 bg-[var(--surface)] border-0">
          <Inbox className="size-8" style={{ color: 'var(--subtle)' }} />
          <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>No invoices found.</p>
        </div>
      )}

      {!isLoading && invoices.length > 0 && (
        <div className="space-y-3">
          {invoices.map(inv => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              connectedAddress={address}
              onTokenize={onTokenize}
              onViewAsset={onOpenHunt}
              onReportPayment={handleReportPayment}
            />
          ))}
        </div>
      )}
    </div>
  )
}
