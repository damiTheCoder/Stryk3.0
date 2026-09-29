import { useState, useEffect } from 'react'
import { X, Lock, Sparkles, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { useReadContract } from 'wagmi'
import { toast } from 'sonner'
import { deriveCode } from '../lib/code'
import { COINTAG_MANAGER_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'

export interface CodeEntryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  invoiceId: bigint
  userAddress?: string
  hasOnchainAccess?: boolean
  initialCode?: string
}

export default function CodeEntryModal({
  isOpen,
  onClose,
  onSuccess,
  invoiceId,
  userAddress,
  hasOnchainAccess = false,
  initialCode = '',
}: CodeEntryModalProps) {
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // Direct live on-chain access verification with loading & error states
  const {
    data: hasAccessOnchain,
    isLoading: isCheckingAccess,
    isError: isAccessError,
    refetch: refetchAccess,
  } = useReadContract({
    address: COINTAG_MANAGER_CONTRACT.address,
    abi: COINTAG_MANAGER_CONTRACT.abi,
    functionName: 'hasAccess',
    args: [
      userAddress ? (userAddress as `0x${string}`) : '0x0000000000000000000000000000000000000000',
      invoiceId,
    ],
    chainId: ARC_TESTNET_ID,
    query: {
      enabled: Boolean(isOpen && userAddress),
    },
  })

  const effectiveHasAccess =
    hasAccessOnchain !== undefined ? Boolean(hasAccessOnchain) : Boolean(hasOnchainAccess)

  useEffect(() => {
    if (isOpen) {
      setError(null)
      setRetryCount(0)
      if (initialCode) {
        setCode(initialCode)
      } else if (userAddress && effectiveHasAccess) {
        setCode(deriveCode(userAddress as `0x${string}`, invoiceId))
      } else {
        setCode('')
      }
    }
  }, [isOpen, initialCode, userAddress, effectiveHasAccess, invoiceId])

  if (!isOpen) return null

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)

    if (!userAddress) {
      setError('Please connect your wallet first.')
      return
    }

    const cleanEntered = code.trim().toUpperCase()
    const expectedCode = deriveCode(userAddress as `0x${string}`, invoiceId).toUpperCase()
    const isCodeMatch = cleanEntered === expectedCode

    // Step 1: Validate code format & value against invoice
    if (!isCodeMatch) {
      setError("That code doesn't match this invoice. Check your Code Store.")
      return
    }

    // Step 2: If on-chain read is still loading
    if (isCheckingAccess) {
      return
    }

    // Step 3: If on-chain read errored
    if (isAccessError) {
      if (retryCount >= 2 && isCodeMatch) {
        toast.warning('Could not verify on-chain access. Proceeding on code match only.')
        onSuccess()
        onClose()
        return
      }
      setError('Could not verify access on-chain. Please retry.')
      return
    }

    // Step 4: If on-chain read resolved to no access
    if (!effectiveHasAccess) {
      setError("This wallet doesn't have access to this invoice. Buy a CoinTag first.")
      return
    }

    onSuccess()
    onClose()
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

        {/* Lock / Sparkles Icon */}
        <div className="size-14 rounded-full bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center mb-4 shrink-0">
          <Lock className="size-7" />
        </div>

        {/* Headline */}
        <h3 className="text-[20px] font-semibold tracking-tight text-[var(--ink)]">
          Enter Access Code
        </h3>

        {/* Subtext */}
        <p className="text-[14px] text-[var(--muted)] mt-1.5 leading-relaxed max-w-[340px]">
          Enter the code from your Code Store to begin hunting on Invoice #{invoiceId.toString()}.
        </p>

        {/* Code Input Form */}
        <form onSubmit={handleSubmit} className="w-full my-5 flex flex-col gap-3">
          <div className="w-full">
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                if (error) setError(null)
              }}
              placeholder="CT-XXXX-XXXX-XXXX"
              autoFocus
              className="w-full h-12 px-4 rounded-xl bg-black/[0.04] dark:bg-white/[0.04] text-center font-mono text-[18px] font-bold text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[#2563EB] uppercase tracking-wider"
            />
          </div>

          {/* Loading Hint */}
          {isCheckingAccess && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-neutral-400 font-medium">
              <Loader2 className="size-3.5 animate-spin text-[#2563EB]" />
              <span>Verifying access…</span>
            </div>
          )}

          {/* Inline Error Message + Retry */}
          {error && !isCheckingAccess && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-rose-500 font-medium px-2 text-center">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{error}</span>
              {isAccessError && (
                <button
                  type="button"
                  onClick={() => {
                    setRetryCount((c) => c + 1)
                    void refetchAccess()
                  }}
                  className="underline hover:text-rose-400 font-bold ml-1 cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="size-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full mt-2">
            <button
              type="submit"
              disabled={isCheckingAccess}
              className="w-full h-11 px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-[14px] transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCheckingAccess ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Verifying access…</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  <span>Begin Hunt</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 px-5 rounded-xl bg-[#F3F4F6] dark:bg-[#232323] hover:bg-black/5 dark:hover:bg-white/5 text-[var(--ink)] font-semibold text-[14px] transition-colors cursor-pointer flex items-center justify-center"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
