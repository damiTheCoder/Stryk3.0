/**
 * GridHunt — Interactive 2-Stage Tokenized Invoice Experience
 * Stage 1: Asset Detail View with real-time Line Chart, Live Metrics & "Buy Cointag" trigger
 * Stage 2: Hunting Page with 3D Character Card, Mystery Grid Boxes, Coordinate Reference Matrix,
 *          and Coordinate Tracking & Claim Input Bar.
 */
import { useState, useMemo } from 'react'
import { useAccount, useReadContract } from 'wagmi'
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
  Sparkles,
  Ticket,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  X,
  Target,
  Trophy,
} from 'lucide-react'
import { STRYK_GRID_CONTRACT, STRYK_NFT_CONTRACT, ARC_TESTNET_ID } from '../contractConfig'
import { formatUsdc } from '@/onchain-money'
import { LineChart } from './ui/chart'

const GRID_ADDRESS = STRYK_GRID_CONTRACT.address
const GRID_ABI = STRYK_GRID_CONTRACT.abi

// ── Coordinate Reference Table Matrix (10 rows x 5 columns) ─────────────────
const COORDINATE_COLS = ['A', 'B', 'C', 'D', 'E'] as const
type ColKey = typeof COORDINATE_COLS[number]

const COORDINATE_MATRIX: Record<number, Record<ColKey, string>> = {
  1:  { A: '66, 31', B: '65, 71', C: '97, 87', D: '15, 60', E: '61, 98' },
  2:  { A: '41, 52', B: '58, 18', C: '02, 71', D: '85, 84', E: '96, 28' },
  3:  { A: '78, 23', B: '23, 59', C: '77, 67', D: '68, 44', E: '95, 51' },
  4:  { A: '18, 68', B: '61, 70', C: '81, 20', D: '58, 46', E: '85, 51' },
  5:  { A: '18, 56', B: '61, 59', C: '61, 42', D: '62, 41', E: '15, 87' },
  6:  { A: '73, 84', B: '50, 56', C: '93, 56', D: '71, 71', E: '57, 99' },
  7:  { A: '31, 02', B: '08, 07', C: '19, 30', D: '28, 12', E: '10, 62' },
  8:  { A: '01, 81', B: '05, 50', C: '47, 42', D: '49, 00', E: '64, 24' },
  9:  { A: '22, 29', B: '68, 00', C: '09, 12', D: '66, 80', E: '37, 79' },
  10: { A: '66, 94', B: '06, 35', C: '66, 03', D: '01, 40', E: '87, 58' },
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

export default function GridHunt({ gridId, onBack }: { gridId: bigint; onBack: () => void }) {
  const { address } = useAccount()

  // Contract data for realism
  const { data: grid } = useReadContract({
    address: GRID_ADDRESS,
    abi: GRID_ABI,
    functionName: 'getGrid',
    args: [gridId],
    chainId: ARC_TESTNET_ID,
  })

  const { data: nft } = useReadContract({
    address: STRYK_NFT_CONTRACT.address,
    abi: STRYK_NFT_CONTRACT.abi,
    functionName: 'getInvoiceNFT',
    args: [grid ? ((grid as readonly unknown[])[3] as bigint) : 0n],
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!grid },
  })

  const nftData = nft as { faceValue: bigint; invoiceRef: string } | undefined

  // Views: 'asset-detail' | 'hunt'
  const [currentView, setCurrentView] = useState<'asset-detail' | 'hunt'>('asset-detail')

  // Asset detail state
  const [timeframe, setTimeframe] = useState<Timeframe>('1W')
  const [hoveredPoint, setHoveredPoint] = useState<{ index: number; val: number } | null>(null)
  const [isStarred, setIsStarred] = useState(false)
  const [copied, setCopied] = useState(false)

  // Cointag purchase & Access Code state
  const [isBuying, setIsBuying] = useState(false)
  const [accessCodeModal, setAccessCodeModal] = useState(false)
  const [purchasedCode, setPurchasedCode] = useState('HUNT-7823')
  const [enteredCode, setEnteredCode] = useState('')

  // Hunting Room State
  const [walletValue, setWalletValue] = useState<number>(0.0)
  const [claimedTokens, setClaimedTokens] = useState<number>(0)
  const [revealedBoxes, setRevealedBoxes] = useState<Record<number, { isCodepair: boolean; value: string }>>({})
  const [activeFoundCodepair, setActiveFoundCodepair] = useState<string | null>(null)
  const [coordinateInput, setCoordinateInput] = useState('')
  const [claimedCoordinates, setClaimedCoordinates] = useState<string[]>([])
  const [lastMatchedCoord, setLastMatchedCoord] = useState<string | null>(null)

  // Dynamic names & values
  const assetName = nftData?.invoiceRef ? `Nova Builders • ${nftData.invoiceRef}` : 'Nova Builders'
  const marketCapDisplay = nftData?.faceValue ? `$${formatUsdc(nftData.faceValue)} USDC` : '$10.7M'
  const priceDisplay = '$0.000108'
  const cointagCost = '$10.00 USDC'
  const contractAddressDisplay = '0x91a2...820ba3'

  const copyContractAddress = () => {
    navigator.clipboard?.writeText('0x91a2fc381691238910009182379123820ba3')
    setCopied(true)
    toast.success('Contract address copied to clipboard!')
    setTimeout(() => setCopied(false), 2000)
  }

  // Handle "Buy Cointag" click
  const handleBuyCointag = () => {
    setIsBuying(true)
    setTimeout(() => {
      setIsBuying(false)
      const generated = 'HUNT-7823'
      setPurchasedCode(generated)
      setAccessCodeModal(true)
      toast.success('Cointag purchased! Hunt access code unlocked.')
    }, 600)
  }

  // Handle Entering Code to Access Hunt
  const handleUnlockHunt = () => {
    const cleanEntered = enteredCode.trim().toUpperCase()
    const cleanPurchased = purchasedCode.trim().toUpperCase()

    if (cleanEntered === cleanPurchased || cleanEntered === 'HUNT-7823' || cleanEntered === '78, 23' || cleanEntered === 'A3') {
      setAccessCodeModal(false)
      setCurrentView('hunt')
      toast.success('Code verified! Welcome to the Live Hunting Room.')
    } else {
      toast.error('Invalid access code. Please enter the code given: ' + purchasedCode)
    }
  }

  // Mystery Box Config (4x4 = 16 Grid Boxes)
  const mysteryBoxConfig = useMemo(() => {
    return [
      { id: 1, isTarget: false, clue: 'Cold (No signal)' },
      { id: 2, isTarget: false, clue: 'Scanning…' },
      { id: 3, isTarget: false, clue: 'Warm signal' },
      { id: 4, isTarget: true,  clue: '78, 23' }, // Target codepair!
      { id: 5, isTarget: false, clue: 'Weak beacon' },
      { id: 6, isTarget: false, clue: 'Static noise' },
      { id: 7, isTarget: false, clue: 'Closer…' },
      { id: 8, isTarget: false, clue: 'Try North' },
      { id: 9, isTarget: false, clue: 'Decoy node' },
      { id: 10, isTarget: false, clue: 'Scanning…' },
      { id: 11, isTarget: false, clue: 'Warm pulse' },
      { id: 12, isTarget: false, clue: 'Frequency 88Hz' },
      { id: 13, isTarget: false, clue: 'Try Sector A' },
      { id: 14, isTarget: false, clue: 'Cold (No signal)' },
      { id: 15, isTarget: false, clue: 'Decoy node' },
      { id: 16, isTarget: false, clue: 'Near Sector 3' },
    ]
  }, [])

  // User clicks a mystery box
  const handleBoxClick = (id: number) => {
    if (revealedBoxes[id]) return

    const box = mysteryBoxConfig.find(b => b.id === id)
    if (!box) return

    setRevealedBoxes(prev => ({
      ...prev,
      [id]: { isCodepair: box.isTarget, value: box.clue },
    }))

    if (box.isTarget) {
      setActiveFoundCodepair('78, 23')
      toast.success('🎯 TARGET FOUND! Codepair is 78, 23. Find it on the COORDINATE REFERENCE table!')
    } else {
      toast('Revealed: ' + box.clue, { icon: '🔍' })
    }
  }

  // Handle Coordinate Submission
  const handleSubmitCoordinate = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const raw = coordinateInput.trim().toUpperCase()

    if (!raw) {
      toast.error('Please enter a coordinate (e.g. A3)')
      return
    }

    // Normalizing coordinate, e.g. "A3" or "3A"
    let col = ''
    let row = ''
    if (COORDINATE_COLS.includes(raw[0] as ColKey) && !isNaN(Number(raw.slice(1)))) {
      col = raw[0]
      row = raw.slice(1)
    } else if (!isNaN(Number(raw.slice(0, -1))) && COORDINATE_COLS.includes(raw.slice(-1) as ColKey)) {
      row = raw.slice(0, -1)
      col = raw.slice(-1)
    } else {
      toast.error('Format coordinate as [Column][Row], e.g. A3 or B4')
      return
    }

    const rowNum = Number(row)
    if (rowNum < 1 || rowNum > 10 || !COORDINATE_COLS.includes(col as ColKey)) {
      toast.error('Invalid coordinate range. Columns: A-E, Rows: 1-10')
      return
    }

    const foundPairInMatrix = COORDINATE_MATRIX[rowNum]?.[col as ColKey]
    const coordKey = `${col}${rowNum}`

    if (claimedCoordinates.includes(coordKey)) {
      toast.info(`Coordinate ${coordKey} has already been claimed!`)
      return
    }

    // Check if it matches the active target codepair (78, 23)
    if (foundPairInMatrix === '78, 23' || (activeFoundCodepair && foundPairInMatrix === activeFoundCodepair)) {
      setClaimedCoordinates(prev => [...prev, coordKey])
      setLastMatchedCoord(coordKey)
      setWalletValue(prev => prev + 5000.0)
      setClaimedTokens(prev => prev + 1)
      setCoordinateInput('')

      toast.success(`🎉 TARGET ACQUIRED! Coordinate [${coordKey}] verified for codepair ${foundPairInMatrix}! +$5,000.00 USDC claimed!`, {
        duration: 5000,
      })
    } else {
      toast.error(
        `Coordinate ${coordKey} holds [${foundPairInMatrix}], which doesn't match target codepair ${activeFoundCodepair || '78, 23'}. Check the table!`
      )
    }
  }

  // ── Prepare Data for shadcn LineChart ──────────────────────────────────────
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
    return CHART_DATA[timeframe].points.map((val, idx) => ({
      label: currentLabels[idx] || `#${idx + 1}`,
      value: val * 0.000001,
      meta: `Price: $${(val * 0.000001).toFixed(6)}`,
    }))
  }, [timeframe])

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
          STAGE 1: ASSET DETAIL VIEW (No background, clean shadcn LineChart)
      ═══════════════════════════════════════════════════════════════════════ */}
      {currentView === 'asset-detail' && (
        <div className="flex flex-col gap-4 animate-in fade-in duration-300 bg-transparent">
          {/* ── Header Bar (Exact match to Image 1, NO bg) ── */}
          <div className="bg-transparent text-[var(--ink)] p-1 sm:p-2 flex flex-col md:flex-row md:items-center justify-between gap-4 border-0">
            {/* Left: Avatar + Title + Icons + Subtitle */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Avatar with Verified Badge Overlay */}
              <div className="relative shrink-0">
                <img
                  src="/assets/musebook_avatar.png"
                  alt="Asset Avatar"
                  className="size-12 sm:size-14 rounded-full object-cover bg-neutral-800"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
                {/* Verified Badge Icon (Blue checkmark seal) */}
                <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center shadow-md">
                  <Check className="size-3" strokeWidth={3} />
                </div>
              </div>

              {/* Title & Metadata */}
              <div className="flex flex-col gap-1">
                {/* Name & Social Icons Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight text-[var(--ink)] uppercase">
                    MUSEBOOK
                  </h1>

                  {/* Icon set matching Image 1: feather, tv, divider, globe, x, search, star */}
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer shadow-xs">
                      <Feather className="size-3" />
                    </span>

                    <span className="size-5 rounded flex items-center justify-center bg-purple-500/15 text-purple-500 dark:text-purple-300 hover:opacity-80 transition-opacity cursor-pointer shadow-xs">
                      <Tv className="size-3" />
                    </span>

                    <span className="text-[var(--muted)] opacity-40 text-xs px-0.5">|</span>

                    <a
                      href="https://arc.network"
                      target="_blank"
                      rel="noreferrer"
                      className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer shadow-xs"
                    >
                      <Globe className="size-3" />
                    </a>

                    <a
                      href="https://x.com"
                      target="_blank"
                      rel="noreferrer"
                      className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer shadow-xs"
                    >
                      <span className="font-bold text-[10px] leading-none">𝕏</span>
                    </a>

                    <span className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer shadow-xs">
                      <Search className="size-3" />
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setIsStarred(s => !s)
                        toast.success(!isStarred ? 'Added to Watchlist!' : 'Removed from Watchlist')
                      }}
                      className="size-5 rounded flex items-center justify-center bg-[var(--surface)] text-[var(--muted)] hover:text-amber-500 transition-colors cursor-pointer shadow-xs"
                    >
                      <Star className={`size-3 ${isStarred ? 'text-amber-500 fill-amber-500' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Sub-row: ticker | timeframe | contract address + copy button */}
                <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-medium">
                  <span className="lowercase font-semibold text-[var(--ink)]">musebook</span>
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

            {/* Right: Market Cap & Price Stats (Matching Image 1) */}
            <div className="flex items-center gap-6 md:gap-8 self-start md:self-center">
              <div className="flex flex-col items-start md:items-end">
                <span className="text-[11px] font-medium text-[var(--muted)]">Market cap</span>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-[var(--ink)]">
                  $10.7M
                </span>
              </div>

              <div className="flex flex-col items-start md:items-end">
                <span className="text-[11px] font-medium text-[var(--muted)]">Price</span>
                <span className="text-xl sm:text-2xl font-black tracking-tight text-[var(--ink)] font-mono">
                  $0.000108
                </span>
              </div>
            </div>
          </div>

          {/* ── Line Chart Beneath It (shadcn UI LineChart, NO bg) ── */}
          <div className="bg-transparent text-[var(--ink)] p-0 sm:p-1 flex flex-col gap-3 border-0">
            {/* Chart Controls & Timeframe Selector */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500">
                  <TrendingUp className="size-4" />
                  <span>{CHART_DATA[timeframe].change}</span>
                </div>
                <span className="text-xs text-[var(--muted)]">Past {timeframe}</span>
              </div>

              {/* Timeframe Pills */}
              <div className="flex items-center gap-1 bg-[var(--surface)] p-1 rounded-xl shadow-xs">
                {(['1H', '1D', '1W', '1M', '1Y', 'ALL'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      timeframe === tf
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-strong)]'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* shadcn UI LineChart Component */}
            <div className="w-full pt-1">
              <LineChart
                data={lineChartData}
                height={240}
                strokeColor="#2563EB"
                fillGradient={true}
                showGridLines={true}
                showDots={true}
                className="w-full"
              />
            </div>

            {/* Bottom Chart Metrics Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-[var(--surface-strong)] text-xs">
              <div>
                <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">24h Volume</span>
                <p className="font-bold text-[var(--ink)] mt-0.5">$342.8K USDC</p>
              </div>
              <div>
                <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">Liquidity</span>
                <p className="font-bold text-[var(--ink)] mt-0.5">$1.24M</p>
              </div>
              <div>
                <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">Grid Reveal</span>
                <p className="font-bold text-[var(--ink)] mt-0.5">84 / 100 Cells (1 in 16)</p>
              </div>
              <div>
                <span className="text-[10px] text-[var(--muted)] uppercase font-semibold">Contract Standard</span>
                <p className="font-bold text-[#2563EB] dark:text-[#60A5FA] mt-0.5">Arc ERC-721 + StrykGrid</p>
              </div>
            </div>
          </div>

          {/* ── Prominent "Buy Cointag" Button Section (NO bg) ── */}
          <div className="bg-transparent text-[var(--ink)] p-1 sm:p-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-0">
            <div className="flex flex-col gap-0.5 text-center sm:text-left">
              <span className="text-base sm:text-lg font-bold text-[var(--ink)]">
                Enter the Live Coordinate Hunt
              </span>
              <p className="text-xs text-[var(--muted)]">
                Purchase 1 Cointag to receive the unique room access code and uncover secret coordinate pairs.
              </p>
            </div>

            <button
              type="button"
              onClick={handleBuyCointag}
              disabled={isBuying}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-sm tracking-wide shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
            >
              <Ticket className="size-4" />
              <span>{isBuying ? 'Purchasing Cointag…' : `Buy Cointag • ${cointagCost}`}</span>
              <ChevronRight className="size-4 ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* ── Cointag Purchase & Code Reveal Modal ── */}
      {accessCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-[24px] bg-[#0c0d12] text-white p-6 shadow-2xl border border-neutral-800 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Sparkles className="size-4" />
                </span>
                <h3 className="text-lg font-black tracking-tight text-white">Cointag Purchased!</h3>
              </div>
              <button
                type="button"
                onClick={() => setAccessCodeModal(false)}
                className="size-7 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Generated Code Announcement */}
            <p className="text-xs text-neutral-300 leading-relaxed">
              Your cointag has been minted. Here is your private hunting room access code. Enter it below to unlock the Live Hunt page:
            </p>

            {/* Code Box */}
            <div className="p-3.5 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-[10px] text-neutral-400 uppercase font-semibold">Your Access Code</span>
                <span className="font-mono text-xl font-black text-emerald-400 tracking-wider">
                  {purchasedCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(purchasedCode)
                  setEnteredCode(purchasedCode)
                  toast.success('Access code copied and auto-filled!')
                }}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Copy className="size-3.5" />
                <span>Auto-Fill</span>
              </button>
            </div>

            {/* Code Entry Input Bar */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="hunt-code-input" className="text-xs font-semibold text-neutral-300">
                Enter Code to Access Hunting Page
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="hunt-code-input"
                  type="text"
                  value={enteredCode}
                  onChange={(e) => setEnteredCode(e.target.value)}
                  placeholder={`e.g. ${purchasedCode}`}
                  className="flex-1 h-11 px-3 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
                <button
                  type="button"
                  onClick={handleUnlockHunt}
                  className="h-11 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  Enter Hunt →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          STAGE 2: THE HUNTING PAGE DESIGN (Matching Second Image)
      ═══════════════════════════════════════════════════════════════════════ */}
      {currentView === 'hunt' && (
        <div className="flex flex-col gap-4 animate-in fade-in duration-300">
          {/* ── Top Header (Exact match to Image 2) ── */}
          <div className="flex items-center justify-between gap-4 p-2 sm:p-3">
            {/* Left: Avatar + Title + Status */}
            <div className="flex items-center gap-3">
              <div className="size-11 sm:size-12 rounded-full overflow-hidden bg-[#B5F22C] flex items-center justify-center shrink-0 border-2 border-black shadow-xs">
                <img
                  src="/assets/nova_character.png"
                  alt="Nova Builders Avatar"
                  className="size-full object-cover scale-150"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </div>

              <div className="flex flex-col">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-[var(--ink)]">
                  Nova Builders
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-[var(--muted)] font-medium">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Live Hunt</span>
                  <span>•</span>
                  <span>Cycle 1</span>
                  <span>•</span>
                  <span>{claimedTokens} tokens claimed</span>
                </div>
              </div>
            </div>

            {/* Right: WALLET VALUE Card (Exact match to Image 2) */}
            <div className="rounded-[16px] sm:rounded-[20px] bg-[#0c0d12] p-2.5 sm:p-3 px-4 sm:px-6 flex flex-col items-start min-w-[140px] sm:min-w-[170px] border border-neutral-900 shadow-sm">
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                WALLET VALUE
              </span>
              <span className="text-xl sm:text-2xl font-black text-[#10B981] font-mono tracking-tight mt-0.5">
                ${walletValue.toFixed(6)}
              </span>
            </div>
          </div>

          {/* ── Main Two-Column Layout (Matching Image 2) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* ── LEFT COLUMN: 3D Artwork Card + Interactive Mystery Grid Boxes ── */}
            <div className="flex flex-col gap-3">
              {/* Vibrant Lime Green 3D Character Card */}
              <div className="relative rounded-[22px] sm:rounded-[26px] overflow-hidden bg-[#B5F22C] shadow-sm flex flex-col">
                <div className="aspect-[4/3] sm:aspect-square w-full relative flex items-center justify-center p-3">
                  <img
                    src="/assets/nova_character.png"
                    alt="Nova Builders Character"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Bottom Banner Title */}
                <div className="bg-[#121318] px-4 py-3 sm:py-3.5 text-white">
                  <h3 className="text-base sm:text-lg font-black tracking-tight">
                    Nova Builders
                  </h3>
                </div>
              </div>

              {/* ── Interactive Grid Boxes ── */}
              <div className="rounded-[20px] sm:rounded-[24px] bg-[#0c0d12] text-white p-3.5 sm:p-4 border border-neutral-900 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Target className="size-4 text-emerald-400" />
                    <span className="text-xs sm:text-sm font-bold text-white">
                      Click Mystery Boxes to Reveal Codepair
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">16 Sectors</span>
                </div>

                {/* Found Codepair Banner */}
                {activeFoundCodepair ? (
                  <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-600/40 flex items-center justify-between gap-2 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-2">
                      <span className="size-6 rounded-full bg-emerald-500 text-black flex items-center justify-center font-black text-xs">
                        ✓
                      </span>
                      <div>
                        <p className="text-xs font-bold text-emerald-300">
                          TARGET CODEPAIR FOUND:{' '}
                          <span className="font-mono text-sm text-white underline decoration-emerald-400 decoration-2">
                            {activeFoundCodepair}
                          </span>
                        </p>
                        <p className="text-[10px] text-emerald-400/80">
                          Locate this pair in the table on the right and submit coordinates below!
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-800 text-[11px] text-neutral-400">
                    💡 Click the sectors below to uncover the target codepair.
                  </div>
                )}

                {/* 4x4 Grid Boxes */}
                <div className="grid grid-cols-4 gap-2">
                  {mysteryBoxConfig.map((box) => {
                    const isRevealed = !!revealedBoxes[box.id]
                    const revealedData = revealedBoxes[box.id]

                    return (
                      <button
                        key={box.id}
                        type="button"
                        onClick={() => handleBoxClick(box.id)}
                        className={`aspect-square rounded-xl p-1.5 flex flex-col items-center justify-center text-center transition-all duration-200 cursor-pointer ${
                          !isRevealed
                            ? 'bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 active:scale-95 text-neutral-400 hover:text-white'
                            : revealedData.isCodepair
                            ? 'bg-[#10B981] text-black border-2 border-white shadow-lg animate-pulse font-black'
                            : 'bg-white/5 border border-white/10 text-neutral-400'
                        }`}
                      >
                        {!isRevealed ? (
                          <>
                            <span className="text-[9px] font-mono text-neutral-500">#{box.id}</span>
                            <span className="text-xs font-black mt-0.5">?</span>
                          </>
                        ) : revealedData.isCodepair ? (
                          <>
                            <span className="text-[8px] uppercase font-bold text-black/80">TARGET</span>
                            <span className="font-mono text-xs sm:text-sm font-black">{revealedData.value}</span>
                          </>
                        ) : (
                          <span className="text-[9px] font-medium leading-tight">{revealedData.value}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN: COORDINATE REFERENCE Table (Exact match to Image 2) ── */}
            <div className="rounded-[22px] sm:rounded-[26px] bg-[#121318] text-white p-4 sm:p-5 flex flex-col gap-3 shadow-md border border-neutral-900">
              {/* Header Title (Exact match to Image 2) */}
              <div className="flex items-center justify-between pb-1 border-b border-neutral-800">
                <h3 className="text-xs sm:text-sm font-extrabold tracking-wider text-neutral-300 uppercase">
                  COORDINATE REFERENCE
                </h3>
                <span className="text-[10px] text-neutral-400 font-mono">10 x 5 Matrix</span>
              </div>

              {/* Coordinates Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="text-neutral-400 text-xs sm:text-sm font-bold">
                      <th className="py-2 px-1 w-7 text-center"> </th>
                      {COORDINATE_COLS.map((col) => (
                        <th key={col} className="py-2 px-2 text-center text-neutral-400 font-bold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(COORDINATE_MATRIX).map(([rowStr, cols]) => {
                      const rowNum = Number(rowStr)
                      return (
                        <tr key={rowNum} className="border-t border-neutral-800/40 hover:bg-white/[0.02]">
                          {/* Row Index on Left (1 to 10) */}
                          <td className="py-1.5 sm:py-2 px-1 text-neutral-400 text-xs sm:text-sm font-bold">
                            {rowNum}
                          </td>

                          {/* Columns A to E */}
                          {COORDINATE_COLS.map((col) => {
                            const val = cols[col]
                            const coordKey = `${col}${rowNum}`
                            const isClaimed = claimedCoordinates.includes(coordKey)
                            const isCurrentMatch = lastMatchedCoord === coordKey

                            return (
                              <td
                                key={col}
                                onClick={() => {
                                  setCoordinateInput(coordKey)
                                  toast.info(`Selected coordinate ${coordKey} (${val})`)
                                }}
                                className={`py-1.5 sm:py-2 px-2 font-mono text-xs sm:text-[13px] tracking-tight transition-all cursor-pointer rounded-lg ${
                                  isClaimed || isCurrentMatch
                                    ? 'bg-[#10B981] text-black font-black shadow-md'
                                    : 'text-neutral-300 hover:text-white hover:bg-white/10'
                                }`}
                                title={`Coordinate ${coordKey}: ${val}`}
                              >
                                {val}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── Coordinate Input & Claim Bar ── */}
              <form
                onSubmit={handleSubmitCoordinate}
                className="mt-2 pt-3 border-t border-neutral-800 flex flex-col sm:flex-row items-center gap-2"
              >
                <div className="relative flex-1 w-full">
                  <input
                    type="text"
                    value={coordinateInput}
                    onChange={(e) => setCoordinateInput(e.target.value)}
                    placeholder="Enter Coordinate (e.g. A3)"
                    className="w-full h-11 px-3.5 rounded-xl bg-neutral-900 border border-neutral-800 text-white placeholder-neutral-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981] uppercase"
                  />
                  {activeFoundCodepair && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-emerald-400 font-mono font-bold pointer-events-none">
                      Codepair: {activeFoundCodepair}
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full sm:w-auto h-11 px-5 rounded-xl bg-[#10B981] hover:bg-[#059669] text-black font-extrabold text-xs sm:text-sm tracking-wide transition-all shadow-md active:scale-95 cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5"
                >
                  <Trophy className="size-4" />
                  <span>Verify & Claim</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
