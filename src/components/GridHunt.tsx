/**
 * GridHunt — single grid view, opened from Marketplace when user clicks "Hunt for this NFT"
 */
import { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { Grid3x3, Loader2, Trophy, Ticket, ChevronRight, ArrowLeft, RefreshCw } from 'lucide-react'
import { STRYK_GRID_CONTRACT, STRYK_NFT_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'
import { formatUsdc } from '@/onchain-money'

const GRID_ADDRESS = STRYK_GRID_CONTRACT.address
const GRID_ABI     = STRYK_GRID_CONTRACT.abi

// ── Cell colours ──────────────────────────────────────────────────────────────
const cellBg = (revealer: string, address?: string, isWinner?: boolean) => {
  if (revealer === '0x0000000000000000000000000000000000000000') return 'rgba(255,255,255,0.04)'
  if (isWinner) return 'rgba(37,99,235,0.3)'
  if (address && revealer.toLowerCase() === address.toLowerCase()) return 'rgba(255,255,255,0.18)'
  return 'rgba(255,255,255,0.10)'
}

// ── Single cell button ────────────────────────────────────────────────────────
function Cell({
  index, revealer, winningCell, address, onReveal, loading,
}: {
  index: number
  revealer: string
  winningCell: bigint
  address?: string
  onReveal: (i: number) => void
  loading: boolean
}) {
  const unrevealed = revealer === '0x0000000000000000000000000000000000000000'
  const isWinner =
    winningCell !== BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') &&
    BigInt(index) === winningCell
  return (
    <button
      disabled={!unrevealed || loading}
      onClick={() => onReveal(index)}
      title={unrevealed ? `Reveal cell ${index + 1}` : `Revealed by ${revealer.slice(0, 6)}…`}
      className="aspect-square rounded-md text-[9px] font-mono transition-all hover:scale-105 active:scale-95 disabled:cursor-default"
      style={{
        background: cellBg(revealer, address, isWinner),
        border: `1px solid ${isWinner ? 'rgba(37,99,235,0.6)' : unrevealed ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.14)'}`,
        color: unrevealed ? 'rgba(255,255,255,0.3)' : isWinner ? '#2563EB' : 'rgba(255,255,255,0.6)',
      }}
    >
      {isWinner ? '★' : unrevealed ? index + 1 : '✓'}
    </button>
  )
}

// ── Main Grid Hunt view ───────────────────────────────────────────────────────
export default function GridHunt({ gridId, onBack }: { gridId: bigint; onBack: () => void }) {
  const { address } = useAccount()
  const [approveSuccess, setApproveSuccess] = useState(false)
  const [pendingCell, setPendingCell]       = useState<number | null>(null)

  const { data: grid, refetch: refetchGrid } = useReadContract({
    address: GRID_ADDRESS, abi: GRID_ABI, functionName: 'getGrid', args: [gridId],
    chainId: ARC_TESTNET_ID, query: { refetchInterval: 10000 },
  })

  const { data: cells, refetch: refetchCells } = useReadContract({
    address: GRID_ADDRESS, abi: GRID_ABI, functionName: 'getRevealedCells', args: [gridId],
    chainId: ARC_TESTNET_ID, query: { refetchInterval: 10000 },
  })

  const { data: nft } = useReadContract({
    address: STRYK_NFT_CONTRACT.address, abi: STRYK_NFT_CONTRACT.abi,
    functionName: 'getInvoiceNFT',
    args: [grid ? (grid as readonly unknown[])[3] as bigint : 0n],
    chainId: ARC_TESTNET_ID, query: { enabled: !!grid },
  })

  // Approve USDC
  const { writeContract: approveWrite, data: approveTx } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTx })

  // Reveal cell
  const { writeContract: revealWrite, data: revealTx, isPending: revealPending } = useWriteContract()
  const { isSuccess: revealSuccess, isLoading: revealConfirming } = useWaitForTransactionReceipt({ hash: revealTx })

  useEffect(() => {
    if (!approveConfirmed) return
    const t = setTimeout(() => setApproveSuccess(true), 0)
    return () => clearTimeout(t)
  }, [approveConfirmed])

  const refresh = useCallback(() => { void refetchGrid(); void refetchCells() }, [refetchGrid, refetchCells])

  useEffect(() => {
    if (!revealSuccess) return
    toast.success('Cell revealed!')
    refresh()
    const t = setTimeout(() => { setPendingCell(null); setApproveSuccess(false) }, 0)
    return () => clearTimeout(t)
  }, [revealSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!grid || !cells) {
    return (
      <div className="flex flex-col gap-6">
        <button onClick={onBack} className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <ArrowLeft className="size-4" /> Back to Marketplace
        </button>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin" style={{ color: 'var(--subtle)' }} />
        </div>
      </div>
    )
  }

  const [, vendor, , tokenId, cointag, usdcToken, totalRevealed, claimed, , revealedWinningCell] =
    grid

  const cellArr   = cells as `0x${string}`[]
  const loading   = revealPending || revealConfirming
  const nftData   = nft as { faceValue: bigint; invoiceRef: string } | undefined
  const pct       = Math.round((Number(totalRevealed) / 100) * 100)

  const handleApprove = (cellIdx: number) => {
    if (!address) { toast.error('Connect wallet first'); return }
    setPendingCell(cellIdx)
    approveWrite({ address: usdcToken, abi: erc20Abi, functionName: 'approve', args: [GRID_ADDRESS, cointag], chainId: ARC_TESTNET_ID })
  }

  const handleReveal = () => {
    if (pendingCell === null) return
    revealWrite({ address: GRID_ADDRESS, abi: GRID_ABI, functionName: 'revealCell', args: [gridId, BigInt(pendingCell), usdcToken], chainId: ARC_TESTNET_ID })
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-6 font-sans px-2 sm:px-0">

      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-sm w-fit transition-opacity hover:opacity-70"
        style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" /> Back to Marketplace
      </button>

      {/* Header */}
      <div
        className="rounded-2xl px-6 py-6 flex flex-col gap-3"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Grid3x3 className="size-5" style={{ color: 'var(--accent)' }} />
              <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                Grid Hunt #{gridId.toString()}
              </h1>
              {claimed && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(37,99,235,0.15)', color: '#2563EB' }}>
                  Claimed
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              NFT #{tokenId.toString()} · Vendor {vendor.slice(0, 8)}…{vendor.slice(-6)}
            </p>
            {nftData && (
               <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {nftData.invoiceRef || 'Invoice receivable'} ·{' '}
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  {formatUsdc(nftData.faceValue)} USDC
                </span>{' '}face value
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="display text-2xl font-bold" style={{ color: 'var(--ink)' }}>{formatUsdc(cointag)}</p>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>USDC per cell</p>
            <button onClick={refresh} className="mt-2 p-1.5 rounded-lg transition-opacity hover:opacity-70"
              style={{ color: 'var(--subtle)', background: 'rgba(255,255,255,0.04)' }}>
              <RefreshCw className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
            <span>{totalRevealed.toString()} / 100 cells revealed</span>
            <span>{pct}%</span>
          </div>
          <div className="rounded-full overflow-hidden h-2" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--accent), #2563EB)' }} />
          </div>
        </div>
      </div>

      {/* How it works (compact) */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { icon: <Ticket className="size-4 mx-auto mb-1" />, label: 'Buy cointags', sub: 'Pay USDC per cell' },
          { icon: <Grid3x3 className="size-4 mx-auto mb-1" />, label: 'Reveal cells', sub: 'Find the winner' },
          { icon: <Trophy className="size-4 mx-auto mb-1" />, label: 'Claim NFT', sub: 'Win the receivable' },
        ].map(s => (
          <div key={s.label} className="rounded-xl py-3 px-2"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--muted)' }}>
            {s.icon}
            <p className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{s.label}</p>
            <p className="text-xs">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 10x10 Grid */}
      <div
        className="rounded-2xl p-4"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="grid grid-cols-10 gap-1.5">
          {cellArr.map((rev, i) => (
            <Cell
              key={i}
              index={i}
              revealer={rev}
              winningCell={revealedWinningCell}
              address={address}
              onReveal={handleApprove}
              loading={loading}
            />
          ))}
        </div>
      </div>

      {/* Pending reveal panel */}
      {pendingCell !== null && !claimed && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between gap-4"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              Cell {pendingCell + 1} selected
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Cost: {formatUsdc(cointag)} USDC
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
              80% creator · 10% platform · 10% liquidity
            </p>
          </div>
          {!approveSuccess ? (
            <button
              onClick={() => handleApprove(pendingCell)}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer"
              style={{ background: '#2563EB', color: '#fff', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Ticket className="size-3.5" />}
              Approve
            </button>
          ) : (
            <button
              onClick={handleReveal}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer"
              style={{ background: '#2563EB', color: '#fff', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}
              Reveal!
            </button>
          )}
        </div>
      )}

      {/* Claimed banner */}
      {claimed && (
        <div className="rounded-2xl p-5 flex items-center gap-4"
          style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}>
          <Trophy className="size-7 shrink-0" style={{ color: '#2563EB' }} />
          <div>
            <p className="font-semibold" style={{ color: '#2563EB' }}>NFT Claimed!</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              The winning cell was found. The NFT receivable has been transferred to the winner.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
