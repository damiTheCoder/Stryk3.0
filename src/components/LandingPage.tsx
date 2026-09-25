import { useNavigate } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import StrykLogo from './StrykLogo'
import bgImage from '../images/bg.png'

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
      {/* ── Background Image (bg.png) ── */}
      <div className="absolute inset-0 z-0">
        <img
          src={bgImage}
          alt="Background"
          className="h-full w-full object-cover object-center pointer-events-none"
        />
        {/* Subtle vignette for contrast */}
        <div className="absolute inset-0 bg-radial-[circle_at_center,_transparent_40%,_rgba(0,0,0,0.6)_100%] pointer-events-none" />
      </div>

      {/* ── Architectural Blueprint Grid Overlay (from reference image) ── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10 opacity-30"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="landing-grid" width="160" height="160" patternUnits="userSpaceOnUse">
            <path d="M 160 0 L 0 0 0 160" fill="none" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="0.75" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#landing-grid)" />
        {/* Large geometric arc in top left */}
        <circle cx="0" cy="0" r="320" fill="none" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="1" />
        <circle cx="0" cy="0" r="480" fill="none" stroke="rgba(255, 255, 255, 0.10)" strokeWidth="0.75" strokeDasharray="4 6" />
        {/* Subtle crosshairs */}
        <line x1="20%" y1="0" x2="20%" y2="100%" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.75" />
        <line x1="80%" y1="0" x2="80%" y2="100%" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.75" />
        <line x1="0" y1="28%" x2="100%" y2="28%" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="0.75" />
      </svg>

      {/* ── Floating Accent Cutout Blocks (like in reference image) ── */}
      {/* Top right glass accent */}
      <div className="absolute top-12 right-6 sm:right-14 z-10 w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-sky-500/20 backdrop-blur-md border border-white/20 shadow-2xl pointer-events-none hidden sm:block" />
      {/* Middle left white blur accent */}
      <div className="absolute top-[48%] left-4 sm:left-12 z-10 w-14 h-18 sm:w-16 sm:h-24 rounded-lg bg-white/25 backdrop-blur-lg border border-white/30 shadow-2xl pointer-events-none hidden sm:block" />

      {/* ── TOP SECTION: Brand & Massive Typography ── */}
      <header className="relative z-20 pt-10 sm:pt-14 px-6 text-center flex flex-col items-center">
        {/* Small top label */}
        <p className="text-xs sm:text-sm md:text-base font-semibold tracking-[0.25em] text-white/80 uppercase mb-2">
          Veo Protocol
        </p>

        {/* Main Bold Headline (matches 'BRANDING AGENCY' styling) */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white uppercase leading-[0.92] drop-shadow-md">
          STABLECOIN
          <br />
          INVOICING
        </h1>
      </header>

      {/* ── CENTER SECTION: Floating Stryk Glass Emblem ── */}
      <div className="relative z-20 flex items-center justify-center my-auto py-8">
        <div className="relative flex items-center justify-center">
          {/* Ambient Glow */}
          <div className="absolute w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />

          {/* Glass Card Container */}
          <div className="relative p-6 sm:p-8 rounded-3xl bg-white/[0.04] backdrop-blur-md border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex items-center justify-center transition-transform duration-500 hover:scale-105">
            <StrykLogo size={72} />
          </div>
        </div>
      </div>

      {/* ── BOTTOM SECTION: Subtitle & CTA Button ── */}
      <footer className="relative z-20 pb-12 sm:pb-16 px-6 text-center flex flex-col items-center gap-6">
        {/* Description paragraph (matches 'The right partner helps your brand grow with confidence.') */}
        <p className="text-base sm:text-lg md:text-xl text-white/85 font-medium max-w-md sm:max-w-lg mx-auto text-balance leading-snug drop-shadow-sm">
          The decentralized network for tokenized invoices, instant liquidity, and onchain settlement.
        </p>

        {/* Call to Action Button (matches 'LET'S BUILD ↗ YOUR BRAND.') */}
        <button
          onClick={handleLaunch}
          type="button"
          className="group relative inline-flex flex-col items-center justify-center px-8 py-4 rounded-2xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <span className="flex items-center gap-2 text-xs sm:text-sm font-extrabold tracking-widest uppercase text-white">
            <span>ENTER APP</span>
            <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
          <span className="text-xs sm:text-sm font-extrabold tracking-widest uppercase text-white/80">
            EXPLORE MARKETPLACE.
          </span>
        </button>
      </footer>
    </div>
  )
}
