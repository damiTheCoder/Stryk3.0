import { useNavigate } from 'react-router-dom'
import bgImage from '../images/k.jpeg'
import veoLogo from '../images/veo-logo.png'

interface Props {
  onEnter?: () => void
}

export default function LandingPage({ onEnter }: Props) {
  const navigate = useNavigate()

  const handleLaunch = () => {
    if (onEnter) {
      onEnter()
    } else {
      navigate('/app')
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white font-sans select-none flex flex-col justify-between">
      {/* ── Space Background ── */}
      <div className="absolute inset-0 z-0">
        <img
          src={bgImage}
          alt=""
          className="h-full w-full object-cover object-center pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/80 pointer-events-none" />
      </div>

      {/* ── TOP: Giant logo lockup ── */}
      <header className="relative z-20 pt-14 sm:pt-20 px-6 text-center flex flex-col items-center">
        <div className="flex flex-col items-center justify-center gap-4 sm:gap-5">
          <img
            src={veoLogo}
            alt="Veo logo"
            className="size-16 sm:size-20 rounded-full object-cover shrink-0"
          />
          <span className="text-[26vw] sm:text-[9rem] md:text-[11rem] font-black tracking-tight leading-none lowercase">
            veo
          </span>
        </div>
      </header>

      {/* ── BOTTOM: Tagline, subtext, CTA ── */}
      <footer className="relative z-20 pb-12 sm:pb-16 px-6 text-center flex flex-col items-center gap-5">
        <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white">
          where invoices become legends.
        </h1>
        <p className="text-sm sm:text-lg text-white/60 font-medium max-w-md sm:max-w-xl mx-auto leading-relaxed">
          From stablecoin invoices to on-chain hunts — tokenize receivables,
          grow collateral with CoinTags, and settle instantly on Arc.
        </p>
        <button
          onClick={handleLaunch}
          type="button"
          className="group mt-2 inline-flex items-center justify-center px-10 sm:px-14 py-4 sm:py-5 rounded-2xl bg-white/10 hover:bg-white/15 backdrop-blur-md text-white font-bold text-lg sm:text-xl transition-all active:scale-[0.98] cursor-pointer"
        >
          <span>Launch app</span>
        </button>
        <div className="flex items-center gap-4 text-[11px] sm:text-xs font-semibold tracking-[0.2em] uppercase text-white/40">
          <span>Tokenize</span>
          <span className="opacity-50">•</span>
          <span>Hunt</span>
          <span className="opacity-50">•</span>
          <span>Earn</span>
        </div>
      </footer>
    </div>
  )
}
