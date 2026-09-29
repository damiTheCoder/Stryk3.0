import { useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'
import { Loader2, FileText, Calendar, DollarSign, User, AlignLeft, Mail, Copy, Check, ExternalLink, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { parseUsdc } from '@/onchain-money'
import { InvoiceDownloadButton } from './InvoiceDownloadButton'
import type { InvoicePdfData } from '@/lib/invoicePdf'

interface Props {
  onCreated: () => void
}

export default function CreateInvoice({ onCreated }: Props) {
  const { address } = useAccount()
  const defaultDueDate = () => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().split('T')[0]
  }

  const [creatorInput, setCreatorInput] = useState('')
  const [clientAddr, setClientAddr] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueDate)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdInvoice, setCreatedInvoice] = useState<{
    id: string
    numericId?: number
    amount: string
    taggedAmount?: string
    taggedAmountUsdc?: number
    creator: string
    client?: string
    description?: string
    dueDate: number
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const effectiveCreator = address || (isAddress(creatorInput) ? creatorInput : '')
  const isValidClientAddr = !clientAddr || isAddress(clientAddr)
  const isValidEmail = clientEmail === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)
  const amountNum = parseFloat(amount)
  const isValidAmount = !isNaN(amountNum) && amountNum > 0
  const isValidDate = !dueDate || (() => {
    const d = new Date(dueDate + 'T23:59:59')
    return !isNaN(d.getTime()) && d.getTime() >= new Date().setHours(0, 0, 0, 0)
  })()
  const isValidDesc = description.trim().length > 0
  const ready = !!effectiveCreator && isValidClientAddr && isValidEmail && isValidAmount && isValidDate && isValidDesc && !isSubmitting

  const paymentLink = createdInvoice
    ? `${window.location.origin}/pay/${createdInvoice.id}`
    : null

  const handleCopy = useCallback(() => {
    if (!paymentLink) return
    navigator.clipboard.writeText(paymentLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => toast.error('Could not copy to clipboard'))
  }, [paymentLink])

  const handleSubmit = async () => {
    if (!effectiveCreator) {
      toast.error('Please connect your wallet or enter a payout address.')
      return
    }
    if (!isValidAmount) {
      toast.error('Please enter a valid USDC amount (greater than 0).')
      return
    }
    if (!isValidDesc) {
      toast.error('Please enter an invoice description.')
      return
    }
    if (!isValidDate) {
      toast.error('Due date cannot be in the past.')
      return
    }
    if (!isValidClientAddr) {
      toast.error('Client address is invalid.')
      return
    }
    if (!isValidEmail) {
      toast.error('Client email is invalid.')
      return
    }
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      const dueDateTs = dueDate
        ? Math.floor(new Date(dueDate + 'T23:59:59').getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 86400 * 30
      const parsedAmt = parseUsdc(amount)

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator: effectiveCreator.toLowerCase(),
          client_address: clientAddr ? clientAddr.trim().toLowerCase() : null,
          client_email: clientEmail ? clientEmail.trim() : null,
          description: description.trim(),
          amount: parsedAmt.toString(),
          due_date: dueDateTs,
          debtor_ref: clientAddr ? clientAddr.trim().toLowerCase() : null,
          metadata_uri: null,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || 'Failed to create invoice')
      }

      const data = await res.json()
      setCreatedInvoice({
        id: data.id,
        numericId: data.numeric_id,
        amount: data.amount,
        taggedAmount: data.tagged_amount,
        taggedAmountUsdc: data.tagged_amount_usdc,
        creator: effectiveCreator,
        client: clientAddr || undefined,
        description: description.trim(),
        dueDate: dueDateTs,
      })

      toast.success(`Invoice ${data.id} created instantly!`)
      onCreated()

      // Reset form
      setClientAddr('')
      setClientEmail('')
      setAmount('')
      setDescription('')
      setDueDate(defaultDueDate())
    } catch (err) {
      console.error('Invoice creation error:', err)
      toast.error('Creation failed: ' + ((err as Error)?.message ?? String(err)))
    } finally {
      setIsSubmitting(false)
    }
  }

  const pdfData: InvoicePdfData | null = createdInvoice ? {
    invoiceId: createdInvoice.id,
    creator: createdInvoice.creator,
    client: createdInvoice.client || '—',
    clientEmail: clientEmail || undefined,
    amount: createdInvoice.amount,
    amountFormatted: `${(parseInt(createdInvoice.amount) / 1_000_000).toFixed(2)} USDC`,
    description: createdInvoice.description || '',
    dueDate: createdInvoice.dueDate,
    paymentAddress: createdInvoice.creator,
  } : null

  return (
    <div className="space-y-4 w-full pb-6 font-sans">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
            New Invoice
          </p>
          <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
            <Zap className="size-3" /> Off-chain & Free
          </span>
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Create and send a USDC invoice in seconds. Zero gas, no wallet prompt needed.
        </p>
      </div>

      {/* Shareable link banner */}
      {createdInvoice && paymentLink && (
        <div
          className="rounded-2xl p-5 flex flex-col gap-3 bg-[var(--surface)] border-0"
        >
          <div className="flex items-center gap-2">
            <Check className="size-4" style={{ color: 'var(--success)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
              Invoice {createdInvoice.id} Created! Share this payment link:
            </p>
          </div>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 bg-[var(--surface-strong)]"
          >
            <p className="flex-1 text-xs mono truncate" style={{ color: 'var(--ink-2)' }}>
              {paymentLink}
            </p>
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              style={{
                background: copied ? 'rgba(37,99,235,0.12)' : 'rgba(18,45,69,0.08)',
                color: copied ? 'var(--success)' : 'var(--accent)',
              }}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <a
              href={paymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 p-1.5 rounded-lg hover:bg-black/5 transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Tagged payment: <span className="mono font-semibold" style={{ color: 'var(--ink)' }}>{createdInvoice.taggedAmountUsdc?.toFixed(6) ?? '—'} USDC</span> (auto-reconciled)
            </p>
            {pdfData && <InvoiceDownloadButton data={pdfData} />}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {/* Creator address if not connected */}
        {!address && (
          <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
            <label className="flex items-center gap-2 mb-2">
              <User className="size-3.5" style={{ color: 'var(--subtle)' }} />
              <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Your Payout Address (Vendor)</span>
            </label>
            <input
              value={creatorInput}
              onChange={e => setCreatorInput(e.target.value.trim())}
              placeholder="0x..."
              className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              style={{ color: 'var(--ink)' }}
            />
            {creatorInput && !isAddress(creatorInput) && (
              <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>Invalid address</p>
            )}
          </div>
        )}

        {/* Client address */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-2">
            <User className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Client Address</span>
            <span className="ml-auto text-xs" style={{ color: 'var(--subtle)' }}>optional</span>
          </label>
          <input
            value={clientAddr}
            onChange={e => setClientAddr(e.target.value.trim())}
            placeholder="0x..."
            className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            style={{ color: 'var(--ink)' }}
          />
          {clientAddr && !isValidClientAddr && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>Invalid address</p>
          )}
        </div>

        {/* Client email */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-2">
            <Mail className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Client Email</span>
            <span className="ml-auto text-xs" style={{ color: 'var(--subtle)' }}>optional</span>
          </label>
          <input
            type="email"
            value={clientEmail}
            onChange={e => setClientEmail(e.target.value.trim())}
            placeholder="client@company.com"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            style={{ color: 'var(--ink)' }}
          />
          {clientEmail && !isValidEmail && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>Invalid email address</p>
          )}
        </div>

        {/* Amount */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-2">
            <DollarSign className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Amount (USDC)</span>
          </label>
          <div className="flex items-baseline gap-2">
            <input
              inputMode="decimal"
              value={amount}
              onChange={e => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
              }}
              placeholder="0.00"
              className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-300"
              style={{ color: 'var(--ink)' }}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        </div>

        {/* Description */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-2">
            <AlignLeft className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Description</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Services rendered, product delivered..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 resize-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>

        {/* Due date */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-2">
            <Calendar className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Due Date</span>
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>
      </div>

      <button
        disabled={isSubmitting}
        onClick={handleSubmit}
        className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer bg-[#2563EB] hover:bg-[#1D4ED8]"
      >
        {isSubmitting ? (
          <><Loader2 className="size-4 animate-spin" /> Generating Invoice...</>
        ) : (
          <><FileText className="size-4" /> Create Invoice Free</>
        )}
      </button>
    </div>
  )
}
