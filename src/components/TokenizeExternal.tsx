/**
 * TokenizeExternal — lock USDC collateral + tokenize invoice into onchain NFT receivable & Merkle grid board.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount, useWriteContract, useSwitchChain, usePublicClient } from 'wagmi'
import { erc20Abi, keccak256, toBytes, decodeEventLog } from 'viem'
import { toast } from 'sonner'
import {
  Upload, DollarSign, Calendar, FileText, Loader2, CheckCircle,
  Copy, ExternalLink, AlertTriangle, ShieldCheck, Target, User,
  RefreshCw,
} from 'lucide-react'
import {
  INVOICE_MANAGER_CONTRACT,
  COLLATERAL_MANAGER_CONTRACT,
  ARC_TESTNET_ID,
} from '../contractConfig'
import { getUsdc, buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import { parseUsdc, formatUsdc } from '@/onchain-money'
import { generateBoard } from '@/lib/tokenize'

const USDC_ADDRESS = getUsdc(ARC_TESTNET_ID)!.address as `0x${string}`
const INVOICE_MANAGER_ADDRESS = INVOICE_MANAGER_CONTRACT.address
const COLLATERAL_MANAGER_ADDRESS = COLLATERAL_MANAGER_CONTRACT.address

export interface TokenizePrefill {
  id?: string
  amount?: string
  dueDate?: string
  description?: string
  client?: string
}

interface Props {
  prefill?: TokenizePrefill | null
  onOpenHunt?: (id: bigint) => void
  onClearPrefill?: () => void
}

export default function TokenizeExternal({ prefill, onOpenHunt, onClearPrefill }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient()
  const wrongChain = chainId !== ARC_TESTNET_ID

  // Form state
  const [amount, setAmount] = useState(prefill?.amount || '')
  const [dueDate, setDueDate] = useState(prefill?.dueDate || '')
  const [description, setDescription] = useState(prefill?.description || '')
  const [client, setClient] = useState(prefill?.client || '')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Tokenize state
  const [step, setStep] = useState<'idle' | 'staging' | 'approving' | 'tokenizing' | 'saving_board' | 'done'>('idle')
  const [tokenizedId, setTokenizedId] = useState<string | null>(null)
  const [tokenizeTxHash, setTokenizeTxHash] = useState<string | null>(null)
  const [pairsSaveFailed, setPairsSaveFailed] = useState(false)
  const [isRetryingPairs, setIsRetryingPairs] = useState(false)
  const [pendingPairsData, setPendingPairsData] = useState<{
    onchainId: number
    pairs: any[]
    winners?: number[]
    offchainInvoiceId: string | null
  } | null>(null)
  // Pending on-chain link for the stage-first flow: pairs are safely staged
  // in the backend, only the link still needs to complete.
  const [pendingLinkData, setPendingLinkData] = useState<{
    onchainId: number | null
    offchainInvoiceId: string
  } | null>(null)
  const [isRetryingLink, setIsRetryingLink] = useState(false)
  // Board already staged in the backend — reused on retry so no regeneration needed.
  const stagedBoardRef = useRef<{ board: any; offchainId: string } | null>(null)

  useEffect(() => {
    if (prefill) {
      if (prefill.amount) setAmount(prefill.amount)
      if (prefill.dueDate) setDueDate(prefill.dueDate)
      if (prefill.description) setDescription(prefill.description)
      if (prefill.client) setClient(prefill.client)
    }
  }, [prefill])

  // Derived
  const amountNum = parseFloat(amount)
  const isValidAmount = !isNaN(amountNum) && amountNum > 0
  const isValidDate = !!dueDate && new Date(dueDate).getTime() > new Date().getTime()
  const isValidDesc = description.trim().length > 0
  const ready = !!address && isValidAmount && isValidDate && isValidDesc

  const { writeContractAsync } = useWriteContract()

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => setFileDataUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleTokenize = async () => {
    if (wrongChain) {
      switchChain({ chainId: ARC_TESTNET_ID })
      return
    }
    if (!ready || !address) return

    try {
      const faceValue = parseUsdc(amount)
      const dueDateTs = BigInt(Math.floor(new Date(dueDate).getTime() / 1000))

      const offchainInvoiceId = prefill?.id
      const metadataURI = offchainInvoiceId || `standalone-${Date.now()}`
      // Stage-first flow whenever we have an off-chain invoice row to key on.
      // Standalone tokenizes (no off-chain row) keep the legacy direct pairs POST.
      const useStagedFlow = !!offchainInvoiceId

      // 1. Generate Board (reuse the already-staged board on retry)
      setStep('staging')
      toast.info('Generating 676-pair Merkle board...')
      const board = (useStagedFlow && stagedBoardRef.current && stagedBoardRef.current.offchainId === offchainInvoiceId)
        ? stagedBoardRef.current.board
        : generateBoard()

      const debtorRef = client ? keccak256(toBytes(client.trim().toLowerCase())) : ('0x' + '00'.repeat(32)) as `0x${string}`

      // 2. Stage pairs BEFORE any on-chain transaction. If this fails, ABORT —
      // no tokenizeInvoice fires, so nothing is at risk.
      if (useStagedFlow) {
        toast.info('Staging pairs safely before tokenizing...')
        const stagedOk = await stagePairs(offchainInvoiceId, board.plaintextPairs, board.winningCoordinates)
        if (!stagedOk) {
          toast.error('Failed to stage pairs. Please retry.')
          setStep('idle')
          return
        }
        stagedBoardRef.current = { board, offchainId: offchainInvoiceId }
      }

      // 3. Check & Approve USDC Collateral
      setStep('approving')
      let currentAllowance = 0n
      if (publicClient) {
        currentAllowance = await publicClient.readContract({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [address, COLLATERAL_MANAGER_ADDRESS],
        })
      }

      if (currentAllowance < faceValue) {
        toast.info('Approving USDC collateral...')
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [COLLATERAL_MANAGER_ADDRESS, faceValue],
          chainId: ARC_TESTNET_ID,
        })
        if (publicClient) {
          const appReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
          if (appReceipt.status === 'reverted') {
            toast.error('USDC approval reverted')
            setStep('idle')
            return
          }
        }
        toast.success('Collateral approved!')
      }

      // 4. Call tokenizeInvoice atomically
      setStep('tokenizing')
      toast.info('Submitting tokenizeInvoice transaction...')
      const txHash = await writeContractAsync({
        address: INVOICE_MANAGER_ADDRESS,
        abi: INVOICE_MANAGER_CONTRACT.abi,
        functionName: 'tokenizeInvoice',
        args: [
          faceValue,
          USDC_ADDRESS,
          dueDateTs,
          debtorRef,
          metadataURI,
          board.winningCoordinates as unknown as readonly [number, ...number[]] & { length: 100 },
          board.unitBindings as unknown as readonly [number, ...number[]] & { length: 100 },
          board.merkleRoot,
        ],
        chainId: ARC_TESTNET_ID,
      })

      setTokenizeTxHash(txHash)
      toast.info('Transaction broadcasted. Awaiting confirmation...')

      let onchainId: number | null = null
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (receipt.status === 'reverted') {
          toast.error('Tokenize transaction reverted on-chain.')
          setStep('idle')
          return
        }

        // Parse logs for invoiceId
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: INVOICE_MANAGER_CONTRACT.abi,
              data: log.data,
              topics: log.topics,
              eventName: 'InvoiceTokenized',
            })
            if (decoded?.args && 'invoiceId' in decoded.args) {
              onchainId = Number(decoded.args.invoiceId)
              break
            }
          } catch {
            // not InvoiceTokenized
          }
        }
      }

      if (useStagedFlow) {
        // 5. Link the staged pairs to the on-chain ID. Pairs are safe in the
        // backend even if this fails — the user can retry linking later.
        if (onchainId === null) {
          try {
            sessionStorage.setItem(`pending_link_${offchainInvoiceId}`, JSON.stringify({ onchainId: null }))
          } catch {}
          setPendingLinkData({ onchainId: null, offchainInvoiceId: offchainInvoiceId })
          setStep('idle')
          toast.warning('Tokenized, but the on-chain invoice ID could not be read. Your pairs are staged safely — click Retry to complete the link.')
          return
        }
        setTokenizedId(String(onchainId))
        setStep('saving_board')
        toast.info('Linking staged pairs...')
        try {
          sessionStorage.setItem(`pending_link_${offchainInvoiceId}`, JSON.stringify({ onchainId }))
        } catch {}
        const linked = await linkOnchainWithRetry(offchainInvoiceId, onchainId)
        if (linked) {
          stagedBoardRef.current = null
          setPendingLinkData(null)
          setStep('done')
          toast.success(`Invoice #${onchainId} tokenized successfully!`)
        } else {
          setPendingLinkData({ onchainId, offchainInvoiceId: offchainInvoiceId })
          setStep('idle')
          toast.warning('Your pairs are staged. The on-chain link failed. Click Retry to complete.')
        }
        return
      }

      // Legacy flow (standalone, no off-chain invoice row): direct pairs POST.
      if (onchainId === null) {
        onchainId = 1 // Fallback if receipt log decoding fails
      }

      setTokenizedId(String(onchainId))

      // 5. Submit 676 plaintext pairs and winners to backend with retry
      setStep('saving_board')
      toast.info('Persisting board reference sheet...')
      const saved = await submitPairsWithRetry(onchainId, board.plaintextPairs, offchainInvoiceId, board.winningCoordinates)

      if (saved) {
        setStep('done')
        toast.success(`Invoice #${onchainId} tokenized successfully!`)
      } else {
        setStep('idle')
        toast.warning(
          'Invoice tokenized on-chain but the reference sheet could not be saved. The board is live but the hunt won’t work until the pairs are stored.'
        )
      }

    } catch (err) {
      console.error('Tokenization error:', err)
      toast.error('Tokenization failed: ' + ((err as Error)?.message ?? String(err)))
      setStep('idle')
    }
  }

  // Stage pairs + winners BEFORE tokenizing. Returns true only on HTTP 200.
  const stagePairs = async (
    offchainId: string,
    pairsData: any[],
    winnersData?: number[]
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/invoices/${offchainId}/stage-pairs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairs: pairsData,
          winners: winnersData ?? [],
        }),
      })
      if (!res.ok) {
        console.error('Pairs staging failed:', await res.text())
        return false
      }
      return true
    } catch (err) {
      console.error('Pairs staging error:', err)
      return false
    }
  }

  // Link staged pairs to the on-chain ID with extended backoff (~60s total).
  // Clears the pending-link session entry on success.
  const linkOnchainWithRetry = async (
    offchainId: string,
    targetOnchainId: number
  ): Promise<boolean> => {
    const delays = [1000, 2000, 4000, 8000, 16000, 30000]
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        if (attempt > 0) {
          toast.info(`Retrying on-chain link (attempt ${attempt + 1}/6)...`)
          await new Promise((r) => setTimeout(r, delays[attempt - 1]))
        }
        const res = await fetch(`/api/invoices/${offchainId}/link-onchain`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onchainId: targetOnchainId }),
        })
        if (res.ok) {
          try {
            sessionStorage.removeItem(`pending_link_${offchainId}`)
          } catch {}
          return true
        }
        console.error(`On-chain link attempt ${attempt + 1} failed:`, await res.text())
      } catch (err) {
        console.error(`On-chain link attempt ${attempt + 1} error:`, err)
      }
    }
    return false
  }

  const submitPairsWithRetry = async (
    targetOnchainId: number,
    pairsData: any[],
    offchainId?: string | null,
    winnersData?: number[]
  ): Promise<boolean> => {
    // 1. Always store pairs and winners in sessionStorage first so they cannot be lost if connection breaks
    try {
      sessionStorage.setItem(
        `pending_pairs_${targetOnchainId}`,
        JSON.stringify({
          pairs: pairsData,
          winners: winnersData ?? null,
          offchainInvoiceId: offchainId ?? null,
        })
      )
    } catch (e) {
      console.warn('Could not save to sessionStorage:', e)
    }

    const delays = [1000, 2000, 4000]
    let succeeded = false

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          toast.info(`Retrying reference sheet save (attempt ${attempt + 1}/3)...`)
          await new Promise((r) => setTimeout(r, delays[attempt - 1]))
        }
        const pairsRes = await fetch(`/api/board/${targetOnchainId}/pairs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pairs: pairsData,
            winners: winnersData,
          }),
        })
        if (pairsRes.ok || pairsRes.status === 409) {
          succeeded = true
          break
        }
        console.error(`Board pairs storage attempt ${attempt + 1} failed:`, await pairsRes.text())
      } catch (err) {
        console.error(`Board pairs storage attempt ${attempt + 1} error:`, err)
      }
    }

    if (succeeded) {
      try {
        sessionStorage.removeItem(`pending_pairs_${targetOnchainId}`)
      } catch {}
      if (offchainId) {
        try {
          await fetch(`/api/invoices/${offchainId}/link-onchain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ onchain_id: targetOnchainId }),
          })
        } catch (err) {
          console.error('Failed to link onchain invoice:', err)
        }
      }
      setPairsSaveFailed(false)
      setPendingPairsData(null)
      return true
    } else {
      setPairsSaveFailed(true)
      setPendingPairsData({
        onchainId: targetOnchainId,
        pairs: pairsData,
        winners: winnersData,
        offchainInvoiceId: offchainId ?? null,
      })
      return false
    }
  }

  const handleManualRetryPairs = async () => {
    let data = pendingPairsData
    if (!data && tokenizedId) {
      try {
        const stored = sessionStorage.getItem(`pending_pairs_${tokenizedId}`)
        if (stored) {
          const parsed = JSON.parse(stored)
          data = {
            onchainId: Number(tokenizedId),
            pairs: parsed.pairs,
            winners: parsed.winners,
            offchainInvoiceId: parsed.offchainInvoiceId,
          }
        }
      } catch {}
    }

    if (!data || !data.pairs || data.pairs.length === 0) {
      toast.error('No pending pairs found in memory or session.')
      return
    }

    setIsRetryingPairs(true)
    toast.info('Retrying reference sheet save...')
    const saved = await submitPairsWithRetry(data.onchainId, data.pairs, data.offchainInvoiceId, data.winners)
    setIsRetryingPairs(false)

    if (saved) {
      setStep('done')
      toast.success(`Invoice #${data.onchainId} reference sheet saved successfully!`)
    } else {
      toast.error('Could not save reference sheet to backend. Please retry.')
    }
  }

  const handleManualRetryLink = async () => {
    let data = pendingLinkData
    if (!data && typeof window !== 'undefined') {
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key && key.startsWith('pending_link_')) {
            const raw = sessionStorage.getItem(key)
            if (raw) {
              const parsed = JSON.parse(raw)
              data = {
                onchainId: typeof parsed.onchainId === 'number' ? parsed.onchainId : null,
                offchainInvoiceId: key.replace('pending_link_', ''),
              }
              break
            }
          }
        }
      } catch {}
    }

    if (!data) {
      toast.error('No pending link found.')
      return
    }

    // If the on-chain ID was never decoded, re-read the tokenize receipt.
    let onchainId = data.onchainId
    if (onchainId === null && tokenizeTxHash && publicClient) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash: tokenizeTxHash as `0x${string}` })
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: INVOICE_MANAGER_CONTRACT.abi,
              data: log.data,
              topics: log.topics,
              eventName: 'InvoiceTokenized',
            })
            if (decoded?.args && 'invoiceId' in decoded.args) {
              onchainId = Number(decoded.args.invoiceId)
              break
            }
          } catch {
            // not InvoiceTokenized
          }
        }
      } catch (err) {
        console.error('Could not re-read tokenize receipt:', err)
      }
    }

    if (onchainId === null) {
      toast.error('Could not determine the on-chain invoice ID. Find it in the wallet transaction and reload.')
      return
    }

    setIsRetryingLink(true)
    toast.info('Retrying on-chain link...')
    const linked = await linkOnchainWithRetry(data.offchainInvoiceId, onchainId)
    setIsRetryingLink(false)

    if (linked) {
      setPendingLinkData(null)
      stagedBoardRef.current = null
      setTokenizedId(String(onchainId))
      setStep('done')
      toast.success(`Invoice #${onchainId} linked successfully!`)
    } else {
      setPendingLinkData({ onchainId, offchainInvoiceId: data.offchainInvoiceId })
      toast.error('Link still failing. Your pairs are staged — please retry.')
    }
  }

  useEffect(() => {
    // Check if there are any pending links or pairs in sessionStorage
    if (typeof window !== 'undefined') {
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key && key.startsWith('pending_link_')) {
            const raw = sessionStorage.getItem(key)
            if (raw) {
              const parsed = JSON.parse(raw)
              setPendingLinkData({
                onchainId: typeof parsed.onchainId === 'number' ? parsed.onchainId : null,
                offchainInvoiceId: key.replace('pending_link_', ''),
              })
              break
            }
          }
        }
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key && key.startsWith('pending_pairs_')) {
            const raw = sessionStorage.getItem(key)
            if (raw) {
              const parsed = JSON.parse(raw)
              const invId = Number(key.replace('pending_pairs_', ''))
              if (invId > 0 && parsed.pairs?.length > 0) {
                setTokenizedId(String(invId))
                setPendingPairsData({
                  onchainId: invId,
                  pairs: parsed.pairs,
                  winners: parsed.winners,
                  offchainInvoiceId: parsed.offchainInvoiceId ?? null,
                })
                setPairsSaveFailed(true)
                break
              }
            }
          }
        }
      } catch {}
    }
  }, [])

  const handleCopy = () => {
    if (!tokenizedId) return
    void navigator.clipboard.writeText(tokenizedId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isLoading = step === 'staging' || step === 'approving' || step === 'tokenizing' || step === 'saving_board'

  // ── Success Screen ──
  if (step === 'done') {
    return (
      <div className="flex flex-col gap-6 w-full pb-6 font-sans">
        <div>
          <p className="display text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Invoice Tokenized</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Collateral locked, NFT receivable minted, and 676-box Grid Board created.
          </p>
        </div>

        <div className="rounded-2xl p-6 flex flex-col gap-4 text-center bg-[var(--surface)] border-0">
          <CheckCircle className="size-12 mx-auto" style={{ color: '#2563EB' }} />
          <div>
            <p className="display text-xl font-bold" style={{ color: 'var(--ink)' }}>
              Invoice #{tokenizedId ?? '—'} Live Onchain
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {formatUsdc(parseUsdc(amount))} USDC locked in CollateralManager
            </p>
          </div>

          {tokenizedId && (
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl transition-all cursor-pointer bg-[var(--surface-strong)] text-[var(--ink-2)]"
              >
                <Copy className="size-3.5" />
                {copied ? 'Copied!' : `Invoice ID: #${tokenizedId}`}
              </button>
              {tokenizeTxHash && (
                <a
                  href={buildTxExplorerUrl(ARC_TESTNET_ID, tokenizeTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl transition-all bg-[var(--surface-strong)] text-[var(--muted)] hover:text-[var(--ink)]"
                  title="View on Explorer"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          )}

          {tokenizedId && onOpenHunt && (
            <button
              onClick={() => onOpenHunt(BigInt(tokenizedId))}
              className="mt-2 w-full py-3 rounded-xl text-sm font-bold text-white bg-[#10B981] hover:bg-[#059669] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Target className="size-4" /> View Grid Board & Hunt Asset
            </button>
          )}
        </div>

        {/* Next steps */}
        <div className="rounded-xl p-4 text-sm space-y-1.5 bg-[var(--surface)] border-0">
          <p className="font-semibold" style={{ color: 'var(--ink-2)' }}>What happens next?</p>
          <p style={{ color: 'var(--muted)' }}>→ Players purchase CoinTags to reveal reference sheet pairs</p>
          <p style={{ color: 'var(--muted)' }}>→ Players submit unit claims on the 676 grid</p>
          <p style={{ color: 'var(--muted)' }}>→ When claimed, locked collateral is distributed to the winner</p>
        </div>

        <button
          onClick={() => {
            setStep('idle')
            setAmount('')
            setDueDate('')
            setDescription('')
            setClient('')
            setFileName(null)
            setFileDataUrl(null)
            setTokenizedId(null)
            if (onClearPrefill) onClearPrefill()
          }}
          className="w-full py-3 rounded-2xl text-sm font-semibold transition-all bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-strong)] cursor-pointer"
        >
          Tokenize another invoice
        </button>
      </div>
    )
  }

  // ── Form Screen ──
  return (
    <div className="flex flex-col gap-6 w-full pb-6 font-sans">
      <div>
        <p className="display text-2xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Tokenize Invoice</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {prefill?.id
            ? `Tokenize existing off-chain invoice ${prefill.id} onto Arc Testnet.`
            : 'Lock USDC collateral to mint an NFT receivable & launch a 676 Merkle board.'}
        </p>
      </div>

      {/* Retry On-Chain Link Banner (stage-first flow: pairs are safe, only the link is pending) */}
      {pendingLinkData && (
        <div className="rounded-2xl p-5 bg-rose-500/10 border border-rose-500/30 text-rose-200 flex flex-col gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm text-rose-100">
                Action Required: Complete On-Chain Link{pendingLinkData.onchainId ? ` for Invoice #${pendingLinkData.onchainId}` : ''}
              </p>
              <p className="text-xs text-rose-300 leading-relaxed">
                Your pairs are staged. The on-chain link failed.
                Click Retry to complete.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              disabled={isRetryingLink}
              onClick={handleManualRetryLink}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isRetryingLink ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Linking…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  <span>Retry Link</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Retry Saving Pairs Banner (legacy standalone flow) */}
      {pairsSaveFailed && !pendingLinkData && (
        <div className="rounded-2xl p-5 bg-rose-500/10 border border-rose-500/30 text-rose-200 flex flex-col gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-sm text-rose-100">
                Action Required: Save Reference Sheet {tokenizedId ? `for Invoice #${tokenizedId}` : ''}
              </p>
              <p className="text-xs text-rose-300 leading-relaxed">
                Your invoice is tokenized on-chain, but the backend reference sheet could not be saved.
                The board is live on Arc Testnet, but players cannot view the 676 coordinate matrix until the pairs are stored.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              disabled={isRetryingPairs}
              onClick={handleManualRetryPairs}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isRetryingPairs ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Saving Pairs…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="size-3.5" />
                  <span>Retry Saving Pairs</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Collateral notice */}
      <div
        className="rounded-xl p-3 flex items-start gap-2.5 bg-yellow-500/10 text-yellow-600"
      >
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed">
          You will lock <strong>100% of the face value in USDC</strong> as collateral in CollateralManager. This guarantees instant payout to grid hunters.
        </p>
      </div>

      <div className="space-y-3">
        {/* Upload receipt (optional) */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <Upload className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Invoice Document / PDF</span>
            <span className="ml-auto text-xs" style={{ color: 'var(--subtle)' }}>optional</span>
          </label>
          <label
            className="flex flex-col items-center justify-center gap-2 rounded-xl py-6 cursor-pointer transition-all bg-[var(--surface-strong)]"
          >
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={handleFileChange} />
            {fileDataUrl ? (
              <>
                <CheckCircle className="size-6 text-blue-600" />
                <p className="text-sm font-medium text-blue-600">{fileName}</p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>Click to replace</p>
              </>
            ) : (
              <>
                <Upload className="size-6" style={{ color: 'var(--subtle)' }} />
                <p className="text-sm" style={{ color: 'var(--muted)' }}>Upload invoice PDF or receipt</p>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>Included in NFT metadataURI</p>
              </>
            )}
          </label>
        </div>

        {/* Amount */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-2">
            <DollarSign className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Face Value (USDC Collateral)</span>
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
              className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-400"
              style={{ color: 'var(--ink)' }}
            />
            <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
          {isValidAmount && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--muted)' }}>
              Collateral required: <span className="mono font-semibold text-blue-600">{amount} USDC</span>
            </p>
          )}
        </div>

        {/* Client Address */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-2">
            <User className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Client Address (Debtor)</span>
            <span className="ml-auto text-xs" style={{ color: 'var(--subtle)' }}>optional</span>
          </label>
          <input
            value={client}
            onChange={e => setClient(e.target.value.trim())}
            placeholder="0x..."
            className="mono w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            style={{ color: 'var(--ink)' }}
          />
        </div>

        {/* Description */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-2">
            <FileText className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Invoice Description</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Invoice description, services delivered..."
            className="w-full bg-transparent text-sm outline-none resize-none placeholder:text-slate-400"
            style={{ color: 'var(--ink)' }}
          />
        </div>

        {/* Due Date */}
        <div className="rounded-2xl p-4 bg-[var(--surface)] border-0">
          <label className="flex items-center gap-2 mb-2">
            <Calendar className="size-3.5" style={{ color: 'var(--subtle)' }} />
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Maturity / Due Date</span>
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

      {/* Step Indicator */}
      {step !== 'idle' && (
        <div className="rounded-xl p-3 flex items-center gap-3 bg-[var(--surface)] border-0">
          <Loader2 className="size-4 animate-spin shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {step === 'staging' ? 'Step 1/4 — Staging Pairs Safely...' :
               step === 'approving' ? 'Step 2/4 — Approving USDC Collateral...' :
               step === 'tokenizing' ? 'Step 3/4 — Minting NFT & Creating Board...' :
               'Step 4/4 — Linking Staged Pairs...'}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {step === 'staging' ? 'Storing reference sheet in backend before tokenizing' :
               step === 'approving' ? 'Confirm USDC allowance in your wallet' :
               step === 'tokenizing' ? 'Confirm atomic tokenization transaction in wallet' :
               'Finalizing board link with backend'}
            </p>
          </div>
        </div>
      )}

      <button
        disabled={(!ready && !wrongChain) || isLoading}
        onClick={handleTokenize}
        className="w-full rounded-2xl py-3.5 text-sm font-bold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer bg-[#2563EB] hover:bg-[#1D4ED8]"
      >
        {wrongChain ? (
          'Switch to Arc Testnet'
        ) : isLoading ? (
          <><Loader2 className="size-4 animate-spin" /> Processing...</>
        ) : (
          <><ShieldCheck className="size-4" /> Lock Collateral & Tokenize Invoice</>
        )}
      </button>
    </div>
  )
}
