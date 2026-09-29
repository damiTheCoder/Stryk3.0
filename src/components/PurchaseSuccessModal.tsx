import { useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { toast } from 'sonner'

export interface PurchaseSuccessModalProps {
  isOpen: boolean
  onClose: () => void
  onBeginHunt: () => void
  invoiceId: bigint | number
  code: string
  isRepeatPurchase?: boolean
}

export default function PurchaseSuccessModal({
  isOpen,
  onClose,
  onBeginHunt,
  invoiceId,
  code,
  isRepeatPurchase = false,
}: PurchaseSuccessModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleCopy = () => {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    toast.success('Access code copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-[420px] rounded-2xl bg-[var(--surface)] text-[var(--ink)] p-6 flex flex-col items-center text-center animate-in zoom-in-95 duration-200 font-sans">
        {/* Close X Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="size-4" />
        </button>

        {/* Green Checkmark Circle Icon */}
        <div className="size-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4 shrink-0">
          <Check className="size-7" strokeWidth={2.5} />
        </div>

        {/* Headline */}
        <h3 className="text-[20px] font-semibold tracking-tight text-[var(--ink)]">
          Purchase Successful
        </h3>

        {/* Subtext */}
        <p className="text-[14px] text-[var(--muted)] mt-1.5 leading-relaxed max-w-[340px]">
          {isRepeatPurchase
            ? 'You already had access to this board. This purchase grows the collateral pool.'
            : `You now have access to Invoice #${invoiceId.toString()}'s board.`}
        </p>

        {/* Code Display Block */}
        <div className="w-full my-5 p-3.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] flex items-center justify-between gap-3">
          <span className="font-mono text-[20px] font-semibold tabular-nums text-[var(--ink)] tracking-wider">
            {code}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-2 rounded-lg bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-[var(--ink)] transition-colors cursor-pointer flex items-center justify-center shrink-0"
            title="Copy Code"
            aria-label="Copy Code"
          >
            {copied ? (
              <Check className="size-5 text-emerald-500" strokeWidth={2.5} />
            ) : (
              <Copy className="size-5 text-[var(--muted)]" />
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full">
          <button
            type="button"
            onClick={onBeginHunt}
            className="w-full h-11 px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-[14px] transition-colors cursor-pointer flex items-center justify-center"
          >
            Begin Hunt →
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 px-5 rounded-xl bg-[#F3F4F6] dark:bg-[#232323] hover:bg-black/5 dark:hover:bg-white/5 text-[var(--ink)] font-semibold text-[14px] transition-colors cursor-pointer flex items-center justify-center"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
