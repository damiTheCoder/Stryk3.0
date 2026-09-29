/**
 * GridHunt — Interactive 2-Stage Tokenized Invoice Experience
 * Stage 1: Asset Detail View with real-time Line Chart, Live Metrics & "Buy Cointag" / "Begin Hunt" triggers
 * Stage 2: Hunting Page with 3D Character Card, 676-Box Mystery Grid, 26x26 Coordinate Reference Matrix,
 *          and Coordinate Tracking & Real Merkle submitPair Claim Input Bar.
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import {
  Feather,
  Tv,
  Globe,
  Search,
  Star,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  Layers,
  Ticket,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  Target,
  Trophy,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import {
  INVOICE_MANAGER_CONTRACT,
  COINTAG_MANAGER_CONTRACT,
  GRID_MANAGER_CONTRACT,
  COLLATERAL_MANAGER_CONTRACT,
  CONTRACT_ADDRESSES,
  ARC_TESTNET_ID,
} from '../contractConfig'
import { formatUsdc } from '@/onchain-money'
import { deriveCode } from '../lib/code'
import { coordToLabel, labelToCoord, getMerkleProof } from '@/lib/tokenize'
import { api } from '@/lib/api'
import PurchaseSuccessModal from './PurchaseSuccessModal'
import CodeEntryModal from './CodeEntryModal'
import { ChartAreaStep } from './ui/chart-area-step'
import { GradientBlock } from './marketplace/GradientBlock'

const ERC20_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

interface ReferencePairItem {
  coordinate: number
  pair_a: string
  pair_b: string
  pair_hash: string
}

// ── Chart Timeframe Data ────────────────────────────────────────────────────
type Timeframe = '1H' | '1D' | '1W' | '1M' | '1Y' | 'ALL'

const CHART_DATA: Record<Timeframe, { points: number[]; change: string; isPositive: boolean }> = {
  '1H': {
    points: [102, 104, 103, 107, 106, 109, 108, 112, 110, 115, 114, 118],
    change: '+2.4%',
    isPositive: true,
  },
  '1D': {
    points: [95, 98, 97, 103, 100, 106, 104, 111, 109, 115, 112, 121],
    change: '+14.2%',
    isPositive: true,
  },
  '1W': {
    points: [72, 78, 75, 86, 82, 94, 91, 102, 98, 110, 116, 126],
    change: '+38.5%',
    isPositive: true,
  },
  '1M': {
    points: [45, 52, 49, 65, 60, 78, 85, 92, 104, 112, 120, 134],
    change: '+92.1%',
    isPositive: true,
  },
  '1Y': {
    points: [15, 22, 30, 28, 44, 62, 58, 85, 94, 110, 125, 142],
    change: '+310.8%',
    isPositive: true,
  },
  'ALL': {
    points: [10, 18, 25, 34, 45, 60, 72, 88, 98, 115, 130, 150],
    change: '+540.0%',
    isPositive: true,
  },
}

const KNOWN_GRIDS_META: Record<string, {
  companyName: string
  invoiceRef: string
  ticker: string
  faceValue: bigint
  cointag: bigint
  totalRevealed: number
  volume: string
}> = {
  '1': {
    companyName: 'CyberFlow Corp',
    invoiceRef: 'INV-2026-001',
    ticker: 'cyberflow',
    faceValue: 5000000000n, // $5,000 USDC
    cointag: 10000000n, // $10 USDC
    totalRevealed: 84,
    volume: '$342.8K USDC',
  },
  '2': {
    companyName: 'Nova Builders',
    invoiceRef: 'INV-2026-002',
    ticker: 'novabuilders',
    faceValue: 12500000000n, // $12,500 USDC
    cointag: 25000000n, // $25 USDC
    totalRevealed: 62,
    volume: '$480.2K USDC',
  },
  '3': {
    companyName: 'Apex Logistics',
    invoiceRef: 'INV-2026-003',
    ticker: 'apexlogistics',
    faceValue: 2800000000n, // $2,800 USDC
    cointag: 5000000n, // $5 USDC
    totalRevealed: 91,
    volume: '$195.4K USDC',
  },
  '4': {
    companyName: 'Studio Mirage',
    invoiceRef: 'INV-2026-004',
    ticker: 'studiomirage',
    faceValue: 8400000000n, // $8,400 USDC
    cointag: 15000000n, // $15 USDC
    totalRevealed: 45,
    volume: '$512.0K USDC',
  },
  '5': {
    companyName: 'Quantix Tech',
    invoiceRef: 'INV-2026-005',
    ticker: 'quantixtech',
    faceValue: 16000000000n, // $16,000 USDC
    cointag: 30000000n, // $30 USDC
    totalRevealed: 73,
    volume: '$890.5K USDC',
  },
  '6': {
    companyName: 'Horizon Health',
    invoiceRef: 'INV-2026-006',
    ticker: 'horizonhealth',
    faceValue: 3200000000n, // $32,000 USDC
    cointag: 50000000n, // $50 USDC
    totalRevealed: 38,
    volume: '$1.45M USDC',
  },
}


export default function GridHunt({ gridId, onBack }: { gridId: bigint; onBack: () => void }) {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: ARC_TESTNET_ID })

  const fallback = KNOWN_GRIDS_META[gridId.toString()] || {
    companyName: `Receivable #${gridId.toString()}`,
    invoiceRef: `INV-2026-${gridId.toString().padStart(3, '0')}`,
    ticker: `inv-${gridId.toString()}`,
    faceValue: 5000000000n,
    cointag: 15000000n,
    totalRevealed: 70,
    volume: '$300.0K USDC',
  }

  // 1. Invoice data from InvoiceManager
  const { data: invoiceRaw } = useReadContract({
    address: INVOICE_MANAGER_CONTRACT.address,
    abi: INVOICE_MANAGER_CONTRACT.abi,
    functionName: 'getInvoice',
    args: [gridId],
    chainId: ARC_TESTNET_ID,
  })

  // 2. Global / custom CoinTag price
  const { data: globalPriceRaw } = useReadContract({
    address: COINTAG_MANAGER_CONTRACT.address,
    abi: COINTAG_MANAGER_CONTRACT.abi,
    functionName: 'globalCointagPrice',
    chainId: ARC_TESTNET_ID,
  })

  // 3. Collateral Pool stats from CollateralManager
  const { data: totalCollateralRaw } = useReadContract({
    address: COLLATERAL_MANAGER_CONTRACT.address,
    abi: COLLATERAL_MANAGER_CONTRACT.abi,
    functionName: 'totalCollateral',
    args: [gridId],
    chainId: ARC_TESTNET_ID,
  })

  // 4. Grid reveal units from GridManager
  const { data: boardUnitsClaimedRaw, refetch: refetchBoardUnitsClaimed } = useReadContract({
    address: GRID_MANAGER_CONTRACT.address,
    abi: GRID_MANAGER_CONTRACT.abi,
    functionName: 'getBoardUnitsClaimed',
    args: [gridId],
    chainId: ARC_TESTNET_ID,
  })

  // 5. Access check from CoinTagManager / GridManager
  const { data: hasAccessRaw, refetch: refetchAccess } = useReadContract({
    address: COINTAG_MANAGER_CONTRACT.address,
    abi: COINTAG_MANAGER_CONTRACT.abi,
    functionName: 'hasAccess',
    args: [address ?? '0x0000000000000000000000000000000000000000', gridId],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })

  // 6. Game board completion check
  const { data: isCompletedRaw, refetch: refetchCompleted } = useReadContract({
    address: GRID_MANAGER_CONTRACT.address,
    abi: GRID_MANAGER_CONTRACT.abi,
    functionName: 'isCompleted',
    args: [gridId],
    chainId: ARC_TESTNET_ID,
  })
  const isBoardCompleted = Boolean(isCompletedRaw)

  const invoice = invoiceRaw as {
    id: bigint
    creator: string
    amount: bigint
    stablecoin: string
    dueDate: bigint
    debtorRef: `0x${string}`
    metadataURI: string
    status: number
  } | undefined

  // Unified dynamic tokenized invoice data
  const displayTitle = `Invoice #${gridId.toString()}`
  const creatorAddress = invoice?.creator || '0x46A5956424A9543AEa584227ED667FD6b8EbD565'
  const creatorShort = `${creatorAddress.slice(0, 6)}…${creatorAddress.slice(-4)}`
  const ticker = fallback.ticker

  const faceValueRaw = invoice?.amount ?? fallback.faceValue
  const faceValueFormatted = formatUsdc(faceValueRaw)
  const faceValueNumeric = Number(faceValueRaw) / 1_000_000

  const cointagRaw = (globalPriceRaw) ?? fallback.cointag
  const cointagFormatted = formatUsdc(cointagRaw)
  const cointagNumeric = Number(cointagRaw) / 1_000_000

  const totalCollateralFormatted = formatUsdc((totalCollateralRaw) ?? faceValueRaw)

  const totalRevealed = boardUnitsClaimedRaw !== undefined ? Number(boardUnitsClaimedRaw) : 0
  const remainingCells = Math.max(0, 100 - totalRevealed)
  const gridRevealText = totalRevealed >= 100 ? 'All units claimed (100/100)' : `${totalRevealed} / 100 Units Claimed`

  // Stablecoin & Allowance
  const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
  const stablecoinAddr = (invoice?.stablecoin as `0x${string}`) || ARC_USDC_ADDRESS

  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: stablecoinAddr,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address ?? '0x0000000000000000000000000000000000000000', COINTAG_MANAGER_CONTRACT.address],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address },
  })

  // Views: 'asset-detail' | 'hunt'
  const [currentView, setCurrentView] = useState<'asset-detail' | 'hunt'>(() => {
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('gridhunt_initial_view') : null
    if (saved === 'hunt') {
      sessionStorage.removeItem('gridhunt_initial_view')
      return 'hunt'
    }
    return 'asset-detail'
  })

  // Asset detail state
  const [timeframe, setTimeframe] = useState<Timeframe>('1W')
  const [isStarred, setIsStarred] = useState(false)
  const [copied, setCopied] = useState(false)

  // Cointag purchase & Access Code state
  const [isBuying, setIsBuying] = useState(false)
  const [accessCodeModal, setAccessCodeModal] = useState(false)
  const [codeEntryModalOpen, setCodeEntryModalOpen] = useState(false)
  const [isRepeatPurchase, setIsRepeatPurchase] = useState(false)
  const [purchasedCode, setPurchasedCode] = useState(() => {
    const savedCode = typeof window !== 'undefined' ? sessionStorage.getItem('gridhunt_code') : null
    if (savedCode) {
      sessionStorage.removeItem('gridhunt_code')
      return savedCode
    }
    return address ? deriveCode(address, gridId) : 'CT-0000-0000-0000'
  })

  // Hunting Room Real State
  const [boardPairs, setBoardPairs] = useState<ReferencePairItem[]>([])
  const [boardLoading, setBoardLoading] = useState(false)
  const [boardError, setBoardError] = useState<string | null>(null)

  // Box reveal & Claim states (numeric coord indices 0..675)
  const [revealedCoords, setRevealedCoords] = useState<Set<number>>(new Set())
  const [highlightedCoord, setHighlightedCoord] = useState<number | null>(null)
  const [claimedCoords, setClaimedCoords] = useState<Set<number>>(new Set())

  // Claim Bar Inputs (Coordinate only)
  const [coordinateInput, setCoordinateInput] = useState('')
  const [isClaiming, setIsClaiming] = useState(false)
  const [isRestoringPairs, setIsRestoringPairs] = useState(false)

  const realContractAddress = CONTRACT_ADDRESSES.invoiceManager
  const contractAddressDisplay = `${realContractAddress.slice(0, 6)}...${realContractAddress.slice(-6)}`

  const copyContractAddress = () => {
    navigator.clipboard?.writeText(realContractAddress)
    setCopied(true)
    toast.success('Contract address copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  // Fetch Reference Sheet from backend when entering 'hunt' view
  const fetchReferenceSheet = useCallback(async () => {
    setBoardLoading(true)
    setBoardError(null)
    try {
      const res = await fetch(api(`/api/board/${gridId.toString()}/reference-sheet`))
      if (!res.ok) {
        throw new Error(`Failed to load reference sheet (${res.status})`)
      }
      const json = await res.json()
      if (Array.isArray(json.pairs) && json.pairs.length > 0) {
        setBoardPairs(json.pairs)
      } else {
        throw new Error('Reference sheet contains no pairs')
      }
    } catch (err: any) {
      console.error('Error fetching reference sheet:', err)
      setBoardError(err?.message || 'Failed to load reference sheet')
    } finally {
      setBoardLoading(false)
    }
  }, [gridId])

  const pendingSessionPairs = useMemo(() => {
    if (typeof window === 'undefined') return null
    try {
      const stored = sessionStorage.getItem(`pending_pairs_${gridId.toString()}`)
      if (stored) return JSON.parse(stored)
    } catch {}
    return null
  }, [gridId, boardLoading, boardError])

  const handleRestoreSessionPairs = async () => {
    if (!pendingSessionPairs || !pendingSessionPairs.pairs) return
    setIsRestoringPairs(true)
    toast.info('Restoring reference sheet pairs to backend…')
    try {
      const res = await fetch(api(`/api/board/${gridId.toString()}/pairs`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs: pendingSessionPairs.pairs }),
      })
      if (res.ok || res.status === 409) {
        sessionStorage.removeItem(`pending_pairs_${gridId.toString()}`)
        toast.success('Reference sheet pairs restored successfully!')
        void fetchReferenceSheet()
      } else {
        const errText = await res.text()
        toast.error(`Restore failed: ${errText}`)
      }
    } catch (err: any) {
      toast.error(`Restore failed: ${err?.message || String(err)}`)
    } finally {
      setIsRestoringPairs(false)
    }
  }

  useEffect(() => {
    if (currentView === 'hunt') {
      void fetchReferenceSheet()
    }
  }, [currentView, fetchReferenceSheet])

  // Mapping lookup for 26x26 matrix display
  const pairsByCoord = useMemo(() => {
    const map = new Map<number, ReferencePairItem>()
    for (const p of boardPairs) {
      map.set(p.coordinate, p)
    }
    return map
  }, [boardPairs])

  const pairStringByCoord = useMemo(() => {
    const map = new Map<number, string>()
    for (const p of boardPairs) {
      map.set(p.coordinate, `${p.pair_a}, ${p.pair_b}`)
    }
    return map
  }, [boardPairs])

  // Handle "Buy Cointag" click
  const handleBuyCointag = async () => {
    if (!address) {
      toast.error('Please connect your wallet first')
      return
    }

    setIsBuying(true)
    try {
      const currentAllowance = (allowanceRaw) || 0n

      if (currentAllowance < cointagRaw) {
        toast.info('Approving USDC for CoinTag purchase…')
        const approveTx = await writeContractAsync({
          address: stablecoinAddr,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [COINTAG_MANAGER_CONTRACT.address, cointagRaw],
        })
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: approveTx })
        }
        await refetchAllowance()
      }

      toast.info('Purchasing CoinTag on-chain…')
      const purchaseTx = await writeContractAsync({
        address: COINTAG_MANAGER_CONTRACT.address,
        abi: COINTAG_MANAGER_CONTRACT.abi,
        functionName: 'purchaseCoinTag',
        args: [gridId, cointagRaw],
      })

      // Only register the code if the on-chain transaction succeeded.
      // A reverted purchase must not produce a stale code in the backend.
      const receipt = publicClient
        ? await publicClient.waitForTransactionReceipt({ hash: purchaseTx })
        : null
      if (receipt && receipt.status !== 'success') {
        toast.error('CoinTag purchase failed on-chain. No code generated.')
        return
      }
      if (!receipt) {
        toast.error('Could not confirm the CoinTag purchase on-chain. Please try again.')
        return
      }

      // Only now derive the code and POST to backend
      const code = deriveCode(address, gridId)
      setPurchasedCode(code)

      // Register with backend. The backend re-verifies the tx on-chain
      // (defense in depth), so a failed POST here is a soft error: the
      // user HAS on-chain access and can still enter the hunt with the
      // code shown in the modal.
      try {
        const registerRes = await fetch(api('/api/cointags/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: Number(gridId),
            userAddress: address,
            code,
            amount: cointagRaw.toString(),
            txHash: purchaseTx,
            blockNumber: Number(receipt.blockNumber),
          }),
        })
        if (!registerRes.ok) {
          console.warn('On-chain purchase succeeded but code registration failed.')
          toast.warning('CoinTag purchased. Code could not be saved locally. The code is: ' + code)
        }
      } catch (e) {
        console.warn('On-chain purchase succeeded but code registration failed:', e)
        toast.warning('CoinTag purchased. Code could not be saved locally. The code is: ' + code)
      }

      await refetchAccess()
      setIsRepeatPurchase(Boolean(hasAccessRaw))
      setAccessCodeModal(true)
      toast.success('CoinTag purchased successfully!')
    } catch (err: any) {
      console.error('CoinTag purchase failed:', err)
      const msg = (err?.message || '').toLowerCase()
      if (msg.includes('cancel') || msg.includes('reject') || msg.includes('denied')) {
        toast.error('Transaction cancelled')
      } else {
        toast.error(err?.shortMessage || err?.message || 'Failed to purchase CoinTag')
      }
    } finally {
      setIsBuying(false)
    }
  }

  // Handle Box Click (0..675)
  const handleBoxClick = (coord: number) => {
    setRevealedCoords((prev) => {
      const next = new Set(prev)
      next.add(coord)
      return next
    })
    setHighlightedCoord(coord)
    const label = coordToLabel(coord)
    setCoordinateInput(label)
    toast.info(`Revealed pair at ${label}`)
  }

  // Handle Coordinate Submission via Backend Relayer
  const handleSubmitPair = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!address) {
      toast.error('Please connect your wallet first')
      return
    }

    const cleanCoordStr = coordinateInput.trim().toUpperCase()
    if (!cleanCoordStr) {
      toast.error('Please specify a coordinate (e.g. B10)')
      return
    }

    let coordNum: number
    try {
      coordNum = labelToCoord(cleanCoordStr)
    } catch {
      toast.error('Invalid coordinate format. Must be A1..Z26')
      return
    }

    // CHECK 2: Reveal gate on submit
    if (!revealedCoords.has(coordNum)) {
      toast.error('You must reveal this coordinate first. Click a box to reveal its pair.')
      return
    }

    setIsClaiming(true)
    try {
      const res = await fetch(api(`/api/board/${gridId.toString()}/claim`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          coordinate: coordNum,
        }),
      })

      const data = await res.json()

      if (data.win) {
        toast.success(
          `Unit claimed! ${formatUsdc(BigInt(data.netPayout))} USDC added to your wallet`
        )
        setClaimedCoords((prev) => new Set(prev).add(coordNum))
        setCoordinateInput('')
        if (refetchBoardUnitsClaimed) void refetchBoardUnitsClaimed()
        if (refetchCompleted) void refetchCompleted()
        void fetchReferenceSheet()
      } else {
        toast.error(data.reason ?? 'CPU not found')
      }
    } catch (err) {
      console.error('Claim failed:', err)
      toast.error('Claim failed. Please try again.')
    } finally {
      setIsClaiming(false)
    }
  }

  // ── Prepare Data for Step Area Chart ─────────────────────────────────────
  const lineChartData = useMemo(() => {
    const labelsMap: Record<Timeframe, string[]> = {
      '1H': ['0m', '10m', '20m', '30m', '40m', '50m', '60m', '70m', '80m', '90m', '100m', 'Now'],
      '1D': ['2am', '4am', '6am', '8am', '10am', '12pm', '2pm', '4pm', '6pm', '8pm', '10pm', 'Now'],
      '1W': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Today'],
      '1M': ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'Now'],
      '1Y': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      'ALL': ['2023', 'Q1', 'Q2', 'Q3', 'Q4', '2024', 'Q1', 'Q2', 'Q3', 'Q4', '2025', 'Now'],
    }
    const currentLabels = labelsMap[timeframe]
    // Anchor the series to the live invoice capitalisation (collateral pool
    // total) so the last bar always sits at the current cap level.
    const liveCapNumeric = totalCollateralRaw != null
      ? Number(totalCollateralRaw) / 1_000_000
      : faceValueNumeric
    const mockPts = CHART_DATA[timeframe].points
    const lastMock = mockPts[mockPts.length - 1] ?? 1
    const anchor = liveCapNumeric > 0 && lastMock > 0
      ? liveCapNumeric / lastMock
      : (cointagNumeric > 0 ? cointagNumeric / 100 : 0.1)

    return mockPts.map((val, idx) => {
      const scaledVal = Number((val * anchor).toFixed(2))
      return {
        label: currentLabels[idx] || `#${idx + 1}`,
        value: scaledVal,
        meta: `Cap: $${scaledVal.toFixed(2)} USDC`,
      }
    })
  }, [timeframe, cointagNumeric, totalCollateralRaw, faceValueNumeric])

  return (
    <div className="w-full flex flex-col gap-3 font-sans pb-8 select-none">
      {/* ── Top Navigation Bar ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={currentView === 'hunt' ? () => setCurrentView('asset-detail') : onBack}
          className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
        >
          <ArrowLeft className="size-4" />
          <span>{currentView === 'hunt' ? 'Back to Asset Detail' : 'Back to Marketplace'}</span>
        </button>

        {currentView === 'hunt' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">Live Hunt Session</span>
            <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          STAGE 1: ASSET DETAIL VIEW
      ═══════════════════════════════════════════════════════════════════════ */}
      {currentView === 'asset-detail' && (
        <div className="flex flex-col gap-4 animate-in fade-in duration-300 bg-transparent">
          {/* Header Bar */}
          <div className="bg-transparent text-[var(--ink)] p-1 sm:p-2 flex flex-col md:flex-row md:items-center justify-between gap-4 border-0">
            {/* Left: Avatar + Title + Icons + Subtitle */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="relative shrink-0">
                <GradientBlock seed={gridId} rounded="full" className="size-12 sm:size-14 shrink-0" />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight text-[var(--ink)] uppercase">
                    {displayTitle}
                  </h1>

                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer">
                      <Feather className="size-3" />
                    </span>
                    <span className="size-5 rounded flex items-center justify-center bg-purple-500/15 text-purple-500 dark:text-purple-300 hover:opacity-80 transition-opacity cursor-pointer">
                      <Tv className="size-3" />
                    </span>
                    <span className="text-[var(--muted)] opacity-40 text-xs px-0.5">|</span>
                    <a
                      href="https://arc.network"
                      target="_blank"
                      rel="noreferrer"
                      className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                    >
                      <Globe className="size-3" />
                    </a>
                    <a
                      href="https://x.com"
                      target="_blank"
                      rel="noreferrer"
                      className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                    >
                      <span className="font-bold text-[10px] leading-none">𝕏</span>
                    </a>
                    <span className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer">
                      <Search className="size-3" />
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsStarred((s) => !s)
                        toast.success(!isStarred ? 'Added to Watchlist!' : 'Removed from Watchlist')
                      }}
                      className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-amber-500 transition-colors cursor-pointer"
                    >
                      <Star className={`size-3 ${isStarred ? 'text-amber-500 fill-amber-500' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-medium">
                  <span className="font-semibold text-[var(--ink)]">{creatorShort}</span>
                  <span className="opacity-40">|</span>
                  <span>1w</span>
                  <span className="opacity-40">|</span>
                  <button
                    type="button"
                    onClick={copyContractAddress}
                    className="flex items-center gap-1 font-mono text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                  >
                    <span>{contractAddressDisplay}</span>
                    {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Invoice Cap & Price Stats */}
            <div className="flex items-center gap-6 md:gap-8 self-start md:self-center">
              <div className="flex flex-col items-start md:items-end">
                <span className="text-[11px] font-medium text-[var(--muted)]">Invoice Cap</span>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-[var(--ink)]">
                  ${faceValueFormatted} USDC
                </span>
              </div>

              <div className="flex flex-col items-start md:items-end">
                <span className="text-[11px] font-medium text-[var(--muted)]">Cointag Price</span>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-[#2563EB] dark:text-[#60A5FA] font-mono">
                  ${cointagFormatted} USDC
                </span>
              </div>
            </div>
          </div>

          {/* Line Chart */}
          <div className="bg-transparent text-[var(--ink)] p-0 sm:p-1 flex flex-col gap-3 border-0">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                  <TrendingUp className="size-4" />
                  <span>{CHART_DATA[timeframe].change}</span>
                </div>
                <span className="text-xs text-[var(--muted)]">Past {timeframe}</span>
              </div>

              <div className="flex items-center gap-1 bg-[var(--surface)] p-1 rounded-xl">
                {(['1H', '1D', '1W', '1M', '1Y', 'ALL'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      timeframe === tf
                        ? 'bg-[#2563EB] text-white'
                        : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-strong)]'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full pt-1">
              <ChartAreaStep
                data={lineChartData.map((p) => ({ label: p.label, value: p.value }))}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-[var(--surface-strong)] text-xs">
              <div>
                <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">24h Volume</span>
                <p className="font-bold text-[var(--ink)] mt-0.5">${totalCollateralFormatted} USDC</p>
              </div>
              <div>
                <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">Liquidity</span>
                <p className="font-bold text-[var(--ink)] mt-0.5">${totalCollateralFormatted} USDC</p>
              </div>
              <div>
                <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">Grid Reveal</span>
                <p className="font-bold text-[var(--ink)] mt-0.5">{gridRevealText}</p>
              </div>
              <div>
                <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">Contract Standard</span>
                <p className="font-bold text-[#2563EB] dark:text-[#60A5FA] mt-0.5">Arc ERC-721 + GridManager</p>
              </div>
            </div>
          </div>

          {/* Prominent "Begin Hunt" & "Buy Cointag" Action Row */}
          <div className="bg-transparent text-[var(--ink)] p-1 sm:p-2 flex flex-col gap-4 border-0">
            <div className="flex flex-col gap-0.5 text-center sm:text-left">
              <span className="text-base sm:text-lg font-bold text-[var(--ink)]">
                Enter the Live Coordinate Hunt
              </span>
              <p className="text-xs text-[var(--muted)]">
                Purchase 1 Cointag to receive the unique room access code and uncover secret coordinate pairs.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  setCodeEntryModalOpen(true)
                }}
                className="flex-1 h-12 min-w-0 px-4 sm:px-5 rounded-xl bg-[#F3F4F6] dark:bg-[#232323] hover:bg-black/5 dark:hover:bg-white/5 text-[var(--ink)] font-bold text-xs sm:text-sm tracking-wide transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                <Layers className="size-4 shrink-0 text-[#2563EB]" />
                <span className="truncate">Begin Hunt</span>
              </button>

              <button
                type="button"
                onClick={handleBuyCointag}
                disabled={isBuying}
                className="flex-1 h-12 min-w-0 px-4 sm:px-5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs sm:text-sm tracking-wide transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Ticket className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{isBuying ? 'Purchasing Cointag…' : `Buy Cointag • ${cointagFormatted} USDC`}</span>
                <ChevronRight className="size-4 shrink-0" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <PurchaseSuccessModal
        isOpen={accessCodeModal}
        onClose={() => setAccessCodeModal(false)}
        onBeginHunt={() => {
          setAccessCodeModal(false)
          setCurrentView('hunt')
        }}
        invoiceId={gridId}
        code={purchasedCode}
        isRepeatPurchase={isRepeatPurchase}
      />

      <CodeEntryModal
        isOpen={codeEntryModalOpen}
        onClose={() => setCodeEntryModalOpen(false)}
        onSuccess={() => {
          setCurrentView('hunt')
          toast.success('Access code verified! Welcome to the Live Hunt.')
        }}
        invoiceId={gridId}
        userAddress={address}
        hasOnchainAccess={Boolean(hasAccessRaw)}
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          STAGE 2: THE HUNTING PAGE DESIGN (676-Box Mystery Grid + 26x26 Reference Sheet)
      ═══════════════════════════════════════════════════════════════════════ */}
      {currentView === 'hunt' && (
        <div className="flex flex-col gap-4 animate-in fade-in duration-300">
          {/* Header Bar (Same design as Asset Detail) */}
          <div className="bg-transparent text-[var(--ink)] p-1 sm:p-2 flex flex-col md:flex-row md:items-center justify-between gap-4 border-0">
            {/* Left: Avatar + Title + Icons + Subtitle */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="relative shrink-0">
                <GradientBlock seed={gridId} rounded="full" className="size-12 sm:size-14 shrink-0" />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight text-[var(--ink)] uppercase">
                    {displayTitle}
                  </h1>

                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer">
                      <Feather className="size-3" />
                    </span>
                    <span className="size-5 rounded flex items-center justify-center bg-purple-500/15 text-purple-500 dark:text-purple-300 hover:opacity-80 transition-opacity cursor-pointer">
                      <Tv className="size-3" />
                    </span>
                    <span className="text-[var(--muted)] opacity-40 text-xs px-0.5">|</span>
                    <a
                      href="https://arc.network"
                      target="_blank"
                      rel="noreferrer"
                      className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                    >
                      <Globe className="size-3" />
                    </a>
                    <a
                      href="https://x.com"
                      target="_blank"
                      rel="noreferrer"
                      className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                    >
                      <span className="font-bold text-[10px] leading-none">𝕏</span>
                    </a>
                    <span className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer">
                      <Search className="size-3" />
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsStarred((s) => !s)
                        toast.success(!isStarred ? 'Added to Watchlist!' : 'Removed from Watchlist')
                      }}
                      className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-amber-500 transition-colors cursor-pointer"
                    >
                      <Star className={`size-3 ${isStarred ? 'text-amber-500 fill-amber-500' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-medium">
                  <span className="font-semibold text-[var(--ink)]">{creatorShort}</span>
                  <span className="opacity-40">|</span>
                  <div className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-emerald-500 font-semibold">Live Hunt ({totalRevealed}/100 claimed)</span>
                  </div>
                  <span className="opacity-40">|</span>
                  <button
                    type="button"
                    onClick={copyContractAddress}
                    className="flex items-center gap-1 font-mono text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                  >
                    <span>{contractAddressDisplay}</span>
                    {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Invoice Cap & Cointag Price Stats */}
            <div className="flex items-center gap-6 md:gap-8 self-start md:self-center">
              <div className="flex flex-col items-start md:items-end">
                <span className="text-[11px] font-medium text-[var(--muted)]">Invoice Cap</span>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-[var(--ink)]">
                  ${faceValueFormatted} USDC
                </span>
              </div>

              <div className="flex flex-col items-start md:items-end">
                <span className="text-[11px] font-medium text-[var(--muted)]">Cointag Price</span>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-[#2563EB] dark:text-[#60A5FA] font-mono">
                  ${cointagFormatted} USDC
                </span>
              </div>
            </div>
          </div>

          {/* Completion Banner if finished */}
          {isBoardCompleted && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center gap-3">
              <Trophy className="size-5 shrink-0" />
              <p className="text-xs sm:text-sm font-semibold">
                This game board has completed all 100 units! All collateral has been unlocked and claimed.
              </p>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════
              VERTICAL STACKED LAYOUT
          ═══════════════════════════════════════════════════════════════════════ */}

          {/* ── ROW 2: Reference Sheet (26 × 26 Frozen-Header Grid) ── */}
          <div className="bg-transparent text-neutral-900 dark:text-white flex flex-col gap-3 w-full">
            {/* Board Loading / Error / Table States */}
            {boardLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-neutral-500 dark:text-neutral-400">
                <Loader2 className="size-6 animate-spin text-emerald-400" />
                <span className="text-xs font-medium">Loading 676 coordinate pairs from backend…</span>
              </div>
            )}

            {boardError && !boardLoading && (
              <div className="p-5 sm:p-6 rounded-2xl bg-rose-950/40 border border-rose-800/40 flex flex-col items-center gap-3 text-center text-xs text-rose-300">
                <AlertTriangle className="size-6 text-rose-400 shrink-0" />
                <div className="space-y-2 max-w-lg">
                  <p className="font-bold text-sm text-rose-200">
                    Reference sheet not stored for this invoice.
                  </p>
                  <p className="text-neutral-300 leading-relaxed text-xs">
                    This happens when the pairs weren't saved to the backend during tokenization. If you recently tokenized this invoice, try:
                  </p>
                  <ol className="text-left text-neutral-300 space-y-1.5 pl-5 list-decimal text-xs bg-black/20 p-3 rounded-xl border border-white/5">
                    <li>Click <strong>Retry</strong> below to re-request the reference sheet.</li>
                    <li>If retry fails, the pairs are lost — you'll need to tokenize a new invoice to test the hunt.</li>
                  </ol>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                  {pendingSessionPairs && (
                    <button
                      type="button"
                      disabled={isRestoringPairs}
                      onClick={handleRestoreSessionPairs}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer text-xs disabled:opacity-50"
                    >
                      {isRestoringPairs ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      <span>Restore Pairs from Session</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={fetchReferenceSheet}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1.5 cursor-pointer text-xs"
                  >
                    <RefreshCw className="size-3.5" />
                    <span>Retry</span>
                  </button>
                </div>
              </div>
            )}

            {!boardLoading && !boardError && (
              <div className="overflow-x-auto overflow-y-auto max-h-[440px] border border-neutral-200 dark:border-neutral-800 rounded-xl bg-[#F3F4F6] dark:bg-[#232323]">
                <table className="w-full text-center border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-20 bg-[#F3F4F6] dark:bg-[#232323]">
                    <tr className="text-neutral-500 dark:text-neutral-400 font-bold">
                      <th className="py-2.5 px-2 text-center w-9 sticky top-0 left-0 z-30 bg-[#F3F4F6] dark:bg-[#232323] border-b border-r border-neutral-200 dark:border-neutral-800 font-mono text-[11px]">
                        #
                      </th>
                      {Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map((col) => (
                        <th
                          key={col}
                          className="py-2.5 px-2 text-center text-neutral-500 dark:text-neutral-400 font-mono font-bold min-w-[62px] border-b border-r border-neutral-200/80 dark:border-neutral-800/80 bg-[#F3F4F6] dark:bg-[#232323]"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 26 }, (_, r) => {
                      const rowNum = r + 1
                      return (
                        <tr key={rowNum} className="hover:bg-black/[0.03] dark:hover:bg-white/[0.02]">
                          <td className="py-2 px-1.5 text-neutral-500 dark:text-neutral-400 font-mono font-bold sticky left-0 z-10 bg-[#F3F4F6] dark:bg-[#232323] border-b border-r border-neutral-200 dark:border-neutral-800 text-[11px]">
                            {rowNum}
                          </td>
                          {Array.from({ length: 26 }, (_, c) => {
                            const colLetter = String.fromCharCode(65 + c)
                            const coord = c * 26 + r
                            const label = `${colLetter}${rowNum}`
                            const pair = pairsByCoord.get(coord)
                            const isClaimed = claimedCoords.has(coord)
                            const isHighlighted = highlightedCoord === coord

                            const fullPair = pair
                              ? `Pair A: ${pair.pair_a}\nPair B: ${pair.pair_b}`
                              : 'Loading…'

                            return (
                              <td
                                key={colLetter}
                                className={`py-2 px-1 font-mono text-[10px] tracking-tight border-b border-r border-neutral-200 dark:border-neutral-800/30 transition-colors whitespace-nowrap ${
                                  isHighlighted
                                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-inset ring-emerald-500/50'
                                    : isClaimed
                                    ? 'bg-[#10B981]/25 text-emerald-400 font-bold'
                                    : 'bg-[#F3F4F6] dark:bg-[#232323] text-neutral-600 dark:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
                                }`}
                                title={`${label}\n${fullPair}`}
                              >
                                <span
                                  className={`font-mono text-[10px] whitespace-nowrap leading-none ${
                                    isHighlighted
                                      ? 'text-emerald-200 font-bold'
                                      : isClaimed
                                      ? 'text-emerald-300 font-bold'
                                      : 'text-neutral-600 dark:text-neutral-300'
                                  }`}
                                >
                                  {pair ? `${pair.pair_a}, ${pair.pair_b}` : '—'}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── ROW 3: 676-Box Mystery Grid (Strips of 7, 97 Columns) ── */}
          <div className="rounded-[20px] sm:rounded-[24px] bg-[#F3F4F6] dark:bg-[#232323] text-neutral-900 dark:text-white p-3.5 sm:p-4 border border-neutral-200 dark:border-neutral-900 flex flex-col gap-3 w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Target className="size-4 text-emerald-400" />
                <span className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                  Mystery Box Grid (676 Sectors)
                </span>
              </div>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                {revealedCoords.size} Revealed • 97 Columns
              </span>
            </div>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Click any mystery box to reveal its coordinate pair. Match it in the reference matrix above to find its coordinate.
            </p>

            {/* 676 Box CSS Grid */}
            <div className="overflow-x-auto pb-2 custom-scrollbar">
              <div
                className="grid gap-1.5"
                style={{
                  gridTemplateRows: 'repeat(7, 34px)',
                  gridAutoFlow: 'column',
                }}
              >
                {Array.from({ length: 676 }, (_, coord) => {
                  const isClaimed = claimedCoords.has(coord)
                  const isRevealed = revealedCoords.has(coord) || isClaimed
                  const pair = pairsByCoord.get(coord)

                  return (
                    <button
                      key={coord}
                      type="button"
                      onClick={() => handleBoxClick(coord)}
                      className={`w-[48px] h-[34px] rounded-lg p-0.5 flex items-center justify-center text-center transition-all cursor-pointer select-none font-mono ${
                        isClaimed
                          ? 'bg-[#10B981] text-black font-black border border-white/60'
                          : isRevealed
                          ? 'bg-black/[0.06] dark:bg-white/10 hover:bg-black/[0.09] dark:hover:bg-white/15 border border-black/10 dark:border-white/20 text-emerald-600 dark:text-emerald-400 font-bold'
                          : 'bg-[#F3F4F6] dark:bg-[#232323] hover:bg-neutral-200 dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-800 text-neutral-500 dark:hover:text-neutral-300 font-bold'
                      }`}
                      title={pair ? `Pair: ${pair.pair_a}, ${pair.pair_b}` : 'Click to reveal'}
                    >
                      {isRevealed ? (
                        pair ? (
                          <span className="text-[9px] font-mono whitespace-nowrap leading-none px-0.5">
                            {pair.pair_a}, {pair.pair_b}
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono whitespace-nowrap leading-none">...</span>
                        )
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── ROW 4: Submit Claim Bar (Single Coordinate Input) ── */}
          <div className="bg-transparent text-neutral-900 dark:text-white p-4 w-full">
            <form
              onSubmit={handleSubmitPair}
              className="flex flex-col gap-3"
            >
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-neutral-700 dark:text-neutral-300 mb-1 block">
                  Coordinate to Claim (A1..Z26)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={coordinateInput}
                    onChange={(e) => setCoordinateInput(e.target.value.toUpperCase())}
                    placeholder="e.g. B10"
                    className="w-full h-11 pl-4 pr-12 rounded-xl bg-[#F3F4F6] dark:bg-[#232323] text-neutral-900 dark:text-white placeholder-neutral-500 font-mono text-sm focus:outline-none uppercase"
                  />
                  <button
                    type="submit"
                    disabled={isClaiming || isBoardCompleted}
                    aria-label="Verify and claim"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-all active:scale-95 cursor-pointer flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isClaiming ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ArrowRight className="size-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
