/**
 * TokenizeExternal — upload an external invoice receipt + lock USDC collateral
 * to mint a StrykNFT receivable.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import {
  Upload, DollarSign, Calendar, FileText, Loader2, CheckCircle,
  Copy, ExternalLink, AlertTriangle,
} from 'lucide-react'
import { STRYK_NFT_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'
import { getUsdc, buildAddressExplorerUrl } from '@/onchain-facts'
import { parseUsdc, formatUsdc } from '@/onchain-money'

const USDC_ADDRESS = getUsdc(ARC_TESTNET_ID)!.address as `0x${string}`
const NFT_ADDRESS = STRYK_NFT_CONTRACT.address
const NFT_ABI = STRYK_NFT_CONTRACT.abi

export default function TokenizeExternal() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const wrongChain = chainId !== ARC_TESTNET_ID

  // Form state
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Derived
  const amountNum = parseFloat(amount)
  const isValidAmount = !isNaN(amountNum) && amountNum > 0
  const isValidDate = !!dueDate && new Date(dueDate).getTime() > new Date().getTime()
  const isValidDesc = description.trim().length > 0
  const ready = !!address && isValidAmount && isValidDate && isValidDesc && !!fileDataUrl

  // Step tracking
  const [step, setStep] = useState<'idle' | 'approving' | 'minting' | 'done'>('idle')
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null)

  // Approve USDC
  const { writeContract: approveWrite, data: approveTx, isPending: approvePending } = useWriteContract()
  const { isSuccess: approveSuccess, isLoading: approveConfirming } = useWaitForTransactionReceipt({ hash: approveTx })

  // Mint NFT
  const { writeContract: mintWrite, data: mintTx, isPending: mintPending } = useWriteContract()
  const { isSuccess: mintSuccess, isLoading: mintConfirming, data: mintReceipt } = useWaitForTransactionReceipt({ hash: mintTx })

  // Step transitions (no setState directly in effects — use setTimeout)
  useEffect(() => {
    if (!approveSuccess) return
    const t = setTimeout(() => {
      setStep('minting')
      toast.success('USDC approved. Now minting NFT…')
      const faceValue = parseUsdc(amount)
      const dueDateTs = BigInt(Math.floor(new Date(dueDate).getTime() / 1000))
      // Use file name + description as the invoice reference; in production use IPFS CID
      const invoiceRef = description.trim() + (fileName ? ` [${fileName}]` : '')
      mintWrite({
        address: NFT_ADDRESS,
        abi: NFT_ABI,
        functionName: 'mintExternal',
        args: [address!, faceValue, dueDateTs, invoiceRef, faceValue],
        chainId: ARC_TESTNET_ID,
      })
    }, 0)
    return () => clearTimeout(t)
  }, [approveSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive minted token ID from receipt logs
  const derivedTokenId: string | null = (() => {
    if (!mintSuccess || !mintReceipt) return null
    for (const log of mintReceipt.logs) {
      try {
        // InvoiceNFTMinted(uint256 indexed tokenId, address indexed vendor, uint256 faceValue, bool fromPlatform)
        // tokenId is in topics[1]
        if (log.topics[1]) {
          return BigInt(log.topics[1]).toString()
        }
      } catch { /* skip */ }
    }
    return null
  })()

  useEffect(() => {
    if (!mintSuccess) return
    const t = setTimeout(() => {
      setStep('done')
      if (derivedTokenId) setMintedTokenId(derivedTokenId)
      toast.success('NFT minted! Your invoice receivable is live onchain.')
    }, 0)
    return () => clearTimeout(t)
  }, [mintSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => setFileDataUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleSubmit = () => {
    if (wrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    if (!ready) return
    const faceValue = parseUsdc(amount)
    setStep('approving')
    approveWrite({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [NFT_ADDRESS, faceValue],
      chainId: ARC_TESTNET_ID,
    })
  }

  const handleCopy = () => {
    if (!mintedTokenId) return
    void navigator.clipboard.writeText(mintedTokenId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isLoading = approvePending || approveConfirming || mintPending || mintConfirming

  // ── Success screen ──────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="display text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Invoice Tokenized</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Your external invoice is now an onchain NFT receivable.</p>
        </div>

        <div
          className="rounded-2xl p-6 flex flex-col gap-4 text-center"
          style={{ background: 'rgba(37,99,235,0.06)' }}
        >
          <CheckCircle className="size-10 mx-auto" style={{ color: '#2563EB' }} />
          <div>
            <p className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
              NFT #{mintedTokenId ?? '—'} Minted
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {formatUsdc(parseUsdc(amount))} USDC locked as collateral
            </p>
          </div>

          {mintedTokenId && (
            <div className="flex items-center gap-2 justify-center">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--ink-2)' }}
              >
                <Copy className="size-3.5" />
                {copied ? 'Copied!' : `Token ID: ${mintedTokenId}`}
              </button>
              <a
                href={buildAddressExplorerUrl(ARC_TESTNET_ID, NFT_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--muted)' }}
              >
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Next steps */}
        <div
          className="rounded-xl p-4 text-sm space-y-1.5"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>What's next</p>
          <p style={{ color: 'var(--muted)' }}>→ List this NFT on the Grid Hunt from the Marketplace tab</p>
          <p style={{ color: 'var(--muted)' }}>→ Buyers pay cointags to reveal grid cells and claim it</p>
          <p style={{ color: 'var(--muted)' }}>→ When claimed, your locked USDC is paid to the winner</p>
        </div>

        <button
          onClick={() => { setStep('idle'); setAmount(''); setDueDate(''); setDescription(''); setFileName(null); setFileDataUrl(null); setMintedTokenId(null) }}
          className="w-full py-3 rounded-2xl text-sm font-semibold transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--ink-2)' }}
        >
          Tokenize another invoice
        </button>
      </div>
    )
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <p className="display text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Tokenize Invoice</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Upload an existing invoice receipt and lock USDC collateral to mint an NFT receivable.
        </p>
      </div>

      {/* Collateral warning */}
      <div
        className="rounded-xl p-3 flex items-start gap-2.5"
        style={{ background: 'rgba(245,158,11,0.08)' }}
      >
        <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--warning)' }}>
          You must lock <strong>100% of the face value in USDC</strong> as collateral. This is released to the buyer when they claim the NFT on the grid.
        </p>
      </div>

      <div className="space-y-3">
        {/* Upload receipt */}
        <div
          className="rounded-2xl p-4"
          style={{ background: 'var(--surface-muted)' }}
        >
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <Upload className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Invoice Receipt</span>
          </label>
          <label
            className="flex flex-col items-center justify-center gap-2 rounded-xl py-8 cursor-pointer transition-all"
            style={{
              border: `2px dashed ${fileDataUrl ? 'rgba(37,99,235,0.40)' : 'rgba(255,255,255,0.08)'}`,
              background: fileDataUrl ? 'rgba(37,99,235,0.04)' : 'transparent',
            }}
          >
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={handleFileChange} />
            {fileDataUrl ? (
              <>
                <CheckCircle className="size-6" style={{ color: '#2563EB' }} />
                <p className="text-sm font-medium" style={{ color: '#2563EB' }}>{fileName}</p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>Click to replace</p>
              </>
            ) : (
              <>
                <Upload className="size-6" style={{ color: 'var(--subtle)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Upload PDF or image</p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>The file reference is stored in the NFT metadata</p>
              </>
            )}
          </label>
        </div>

        {/* Description */}
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
          <label className="flex items-center gap-2 mb-2">
            <FileText className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Invoice Description</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Invoice #INV-2026-001, consulting services…"
            className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-slate-600"
            style={{ color: 'var(--ink)' }}
          />
        </div>

        {/* Amount */}
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
          <label className="flex items-center gap-2 mb-2">
            <DollarSign className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Face Value (USDC)</span>
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
              className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-700"
              style={{ color: 'var(--ink)' }}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
          {isValidAmount && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
              Collateral required: {amount} USDC
            </p>
          )}
        </div>

        {/* Due date */}
        <div className="rounded-2xl p-4" style={{ background: 'var(--surface-muted)' }}>
          <label className="flex items-center gap-2 mb-2">
            <Calendar className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Original Due Date</span>
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

      {/* Step indicator */}
      {step !== 'idle' && (
        <div
          className="rounded-xl p-3 flex items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <Loader2 className="size-4 animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {step === 'approving' ? 'Step 1/2 — Approving USDC…' : 'Step 2/2 — Minting NFT…'}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {step === 'approving' ? 'Approve USDC collateral transfer in your wallet' : 'Confirm NFT mint in your wallet'}
            </p>
          </div>
        </div>
      )}

      <button
        disabled={(!ready && !wrongChain) || isLoading}
        onClick={handleSubmit}
        className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer bg-[#2563EB] hover:bg-[#1D4ED8]"
      >
        {wrongChain
          ? 'Switch to Arc Testnet'
          : isLoading
          ? <><Loader2 className="size-4 animate-spin" /> {step === 'approving' ? 'Approving…' : 'Minting NFT…'}</>
          : <><Upload className="size-4" /> Lock Collateral & Mint NFT</>
        }
      </button>
    </div>
  )
}
