import { useState, useCallback, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { isAddress, decodeEventLog } from 'viem'
import { Loader2, FileText, Calendar, DollarSign, User, AlignLeft, Mail, Copy, Check, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { INVOICE_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'
import { parseAmount } from '@/onchain-money'

interface Props {
  onCreated: () => void
}

export default function CreateInvoice({ onCreated }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const [clientAddr, setClientAddr] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')

  const [copied, setCopied] = useState(false)

  const wrongChain = chainId !== ARC_TESTNET_ID

  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  const isValidAddress = isAddress(clientAddr)
  const isValidEmail = clientEmail === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)
  const amountNum = parseFloat(amount)
  const isValidAmount = !isNaN(amountNum) && amountNum > 0
  const isValidDate = !!dueDate && new Date(dueDate).getTime() > new Date().getTime()
  const isValidDesc = description.trim().length > 0
  const ready = !!address && isValidAddress && isValidEmail && isValidAmount && isValidDate && isValidDesc && !isPending && !isConfirming

  // Derive created invoice ID from receipt logs (no setState needed during render)
  const derivedId: string | null = (() => {
    if (!isSuccess || !receipt) return null
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: INVOICE_CONTRACT.abi,
          data: log.data,
          topics: log.topics,
          eventName: 'InvoiceCreated',
        })
        if (decoded?.args) {
          const args = decoded.args as unknown as { id?: bigint | number | string }
          if (args.id !== undefined) return String(args.id)
        }
      } catch {
        // not this log
      }
    }
    return null
  })()

  useEffect(() => {
    if (!isSuccess) return
    toast.success('Invoice created!')
    onCreated()
    // Defer form resets to avoid synchronous setState-in-effect
    const t = setTimeout(() => {
      reset()
      setClientAddr('')
      setClientEmail('')
      setAmount('')
      setDescription('')
      setDueDate('')
    }, 0)
    return () => clearTimeout(t)
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const paymentLink = derivedId
    ? `${window.location.origin}/pay/${derivedId}`
    : null

  const handleCopy = useCallback(() => {
    if (!paymentLink) return
    navigator.clipboard.writeText(paymentLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => toast.error('Could not copy to clipboard'))
  }, [paymentLink])

  const handleSubmit = () => {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    const dueDateTs = BigInt(Math.floor(new Date(dueDate).getTime() / 1000))
    const parsedAmt = parseAmount(ARC_TESTNET_ID, amount)
    writeContract({
      address: INVOICE_CONTRACT.address,
      abi: INVOICE_CONTRACT.abi,
      functionName: 'createInvoice',
      args: [clientAddr as `0x${string}`, parsedAmt.raw, description.trim(), dueDateTs],
      chainId: ARC_TESTNET_ID,
    })
  }

  return (
    <div className="space-y-4 w-full pb-6 font-sans px-1 sm:px-0">
      <div>
        <p className="display text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>
          New Invoice
        </p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Issue a USDC invoice to your client. A shareable payment link is generated on creation.
        </p>
      </div>

      {/* Shareable link banner */}
      {paymentLink && (
        <div
          className="rounded-2xl p-4 flex flex-col gap-3"
          style={{
            background: 'rgba(26,128,71,0.07)',

          }}
        >
          <div className="flex items-center gap-2">
            <Check className="size-4" style={{ color: 'var(--success)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
              Invoice #{derivedId} created! Share this payment link:
            </p>
          </div>
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'rgba(255,255,255,0.7)' }}
          >
            <p className="flex-1 text-xs mono truncate" style={{ color: 'var(--ink-2)' }}>
              {paymentLink}
            </p>
            <button
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all"
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
              className="shrink-0 p-1 rounded-lg"
              style={{ color: 'var(--accent)' }}
            >
              <ExternalLink className="size-3.5" />
            </a>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Send this link to your client. They can pay by card (via MoonPay) or with USDC directly.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {/* Client address */}
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
          <label className="flex items-center gap-2 mb-2">
            <User className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Client Address</span>
          </label>
          <input
            value={clientAddr}
            onChange={e => setClientAddr(e.target.value.trim())}
            placeholder="0x..."
            className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            style={{ color: 'var(--ink)' }}
          />
          {clientAddr && !isValidAddress && (
            <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>Invalid address</p>
          )}
        </div>

        {/* Client email */}
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
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
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
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
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
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
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
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
        disabled={!ready && !wrongChain}
        onClick={handleSubmit}
        className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer bg-[#2563EB] hover:bg-[#1D4ED8]"
      >
        {wrongChain
          ? 'Switch to Arc Testnet'
          : isPending
          ? <><Loader2 className="size-4 animate-spin" /> Confirm in wallet...</>
          : isConfirming
          ? <><Loader2 className="size-4 animate-spin" /> Creating invoice...</>
          : <><FileText className="size-4" /> Create Invoice</>
        }
      </button>
    </div>
  )
}
