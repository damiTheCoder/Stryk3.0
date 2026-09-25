import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import {
  LayoutDashboard,
  FileText,
  Inbox,
  Send,
  X,
  Layers,
  Columns2,
} from 'lucide-react'
import { toast } from 'sonner'
import StrykLogo from './components/StrykLogo'
import Dashboard from './components/Dashboard'
import CreateInvoice from './components/CreateInvoice'
import InvoiceList from './components/InvoiceList'
import Marketplace from './components/Marketplace'
import PaymentPage from './components/PaymentPage'
import GridHunt from './components/GridHunt'
import TokenizeExternal from './components/TokenizeExternal'

type Tab = 'dashboard' | 'create' | 'vendor' | 'client' | 'marketplace' | 'tokenize'

const TABS: { id: Tab; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'marketplace', label: 'Marketplace',  icon: <Columns2 className="size-5" /> },
  { id: 'dashboard',   label: 'Dashboard',    icon: <LayoutDashboard className="size-5" /> },
  { id: 'create',      label: 'New Invoice',  icon: <Send className="size-5" /> },
  { id: 'vendor',      label: 'Issued',       icon: <FileText className="size-5" /> },
  { id: 'client',      label: 'Received',     icon: <Inbox className="size-5" /> },
  { id: 'tokenize',    label: 'Tokenize',     icon: <Layers className="size-5" /> },
]

export default function App() {
  const [tab, setTab]         = useState<Tab>('marketplace')
  const [selectedGridId, setSelectedGridId] = useState<bigint | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isLightTheme, setIsLightTheme] = useState(true)

  useEffect(() => {
    document.documentElement.dataset.theme = isLightTheme ? 'light' : 'dark'
    if (isLightTheme) {
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
    }
  }, [isLightTheme])

  const toggleTheme = () => {
    setIsLightTheme(curr => !curr)
  }

  const navigate = (t: Tab) => {
    setTab(t)
    setSelectedGridId(null)
    setSidebarOpen(false)
  }

  const openGrid = (gridId: bigint) => {
    setSelectedGridId(gridId)
    setSidebarOpen(false)
  }

  return (
    <Routes>
      <Route path="/pay/:invoiceId" element={<PaymentPage />} />
      <Route path="*" element={<AppShell tab={tab} navigate={navigate} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} selectedGridId={selectedGridId} openGrid={openGrid} isLightTheme={isLightTheme} toggleTheme={toggleTheme} />} />
    </Routes>
  )
}

function AppShell({
  tab,
  navigate,
  sidebarOpen,
  setSidebarOpen,
  selectedGridId,
  openGrid,
  isLightTheme,
  toggleTheme,
}: {
  tab: Tab
  navigate: (t: Tab) => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  selectedGridId: bigint | null
  openGrid: (gridId: bigint) => void
  isLightTheme: boolean
  toggleTheme: () => void
}) {
  return (
    <div
      className="min-h-screen bg-[var(--bg)] font-sans text-[var(--ink)] p-0 lg:p-3 antialiased selection:bg-gray-200 transition-colors duration-200"
      data-theme={isLightTheme ? 'light' : 'dark'}
    >
      {/* ── Mobile topbar (flush to top/left/right, no border radius, bg matches page bg) ── */}
      <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between m-0 bg-[var(--bg)] px-4 sm:px-6 py-2.5 rounded-none transition-colors duration-200">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-xl text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
            aria-label="Open menu"
          >
            <Columns2 className="size-5" />
          </button>
          <StrykLogo size={24} />
          <span className="text-lg font-bold tracking-tight text-[var(--ink)]">Veo</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={isLightTheme ? '0' : '0.2'} stroke="currentColor" strokeWidth="1.75" />
              <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
            </svg>
          </button>
          <ConnectKitButton.Custom>
            {({ isConnected, show, address }) => {
              const displayAddr = isConnected && address
                ? `${address.slice(0, 6)}••••${address.slice(-4)}`
                : '0x46A5••••D565'
              return (
                <button
                  onClick={show}
                  type="button"
                  className="bg-[var(--surface)] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-mono font-semibold text-[var(--ink)] hover:bg-[var(--surface-strong)] transition-colors"
                >
                  <div className="w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[9px] font-bold">A</div>
                  <span>{displayAddr}</span>
                </button>
              )
            }}
          </ConnectKitButton.Custom>
        </div>
      </header>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Desktop 3-Column Single-Row Grid ── */}
      <div className="px-4 py-2 sm:px-6 sm:py-3 lg:p-0 lg:grid lg:grid-cols-[260px_1fr_auto] gap-2.5 sm:gap-3 lg:gap-3.5 items-start max-w-[1600px] mx-auto">

        {/* ── COLUMN 1: SIDEBAR (LEFT) ── */}
        <aside
          className={[
            'bg-[var(--surface)] rounded-none lg:rounded-2xl p-3 flex flex-col',
            'fixed top-0 left-0 h-full z-40 w-64 transition-transform duration-300',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
            'lg:sticky lg:top-3 lg:self-start lg:w-[260px] lg:h-auto lg:max-h-[calc(100vh-1.5rem)] lg:overflow-y-auto lg:z-20 lg:translate-x-0 shrink-0',
          ].join(' ')}
        >
          {/* Logo Section */}
          <div className="flex items-center justify-between px-1.5 py-1">
            <div className="flex items-center gap-2.5">
              <StrykLogo size={26} />
              <span className="text-xl font-bold tracking-tight text-[var(--ink)]">Veo</span>
            </div>
            <button
              className="lg:hidden p-1 rounded-lg text-[var(--muted)] hover:text-[var(--ink)]"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Navigation Menu (margin space between logo and menu removed/tightened) */}
          <nav className="mt-2 flex flex-col gap-1">
            {TABS.map(t => {
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => navigate(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-all ${
                    active
                      ? 'bg-[var(--bg)] text-[var(--ink)] font-semibold shadow-xs'
                      : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-strong)] font-medium'
                  }`}
                >
                  <span className={active ? 'text-[var(--ink)]' : 'text-[var(--muted)]'}>{t.icon}</span>
                  <span className="flex-1">{t.label}</span>
                  {t.badge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--ink)] text-[var(--bg)]">
                      {t.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* ── COLUMN 2: MAIN CONTENT AREA (CENTER) ── */}
        <main className="flex-1 min-w-0 flex flex-col gap-2.5 sm:gap-3">
          {/* Grid hunt deep-link — shown over any tab when a grid is selected */}
          {selectedGridId !== null ? (
            <GridHunt gridId={selectedGridId} onBack={() => navigate('marketplace')} />
          ) : (
            <>
              {tab === 'marketplace' && (
                <Marketplace onSelectGrid={openGrid} />
              )}
              {tab === 'dashboard' && (
                <Dashboard onNavigate={(t) => navigate(t as Tab)} />
              )}
              {tab === 'create' && (
                <CreateInvoice
                  onCreated={() => {
                    toast.success('Invoice created!')
                    navigate('vendor')
                  }}
                />
              )}
              {tab === 'vendor' && (
                <InvoiceList mode="vendor" />
              )}
              {tab === 'client' && (
                <InvoiceList mode="client" />
              )}
              {tab === 'tokenize' && (
                <TokenizeExternal />
              )}
            </>
          )}
        </main>

        {/* ── COLUMN 3: TOP RIGHT UTILITY (RIGHT) ── */}
        <aside aria-label="Utility controls" className="hidden lg:flex lg:sticky lg:top-3 lg:self-start justify-self-end bg-[var(--surface)] rounded-2xl p-1.5 items-center gap-2 shrink-0 z-20">
          {/* Item 1: Circular Theme Toggle Icon (half black, half white circle) */}
          <button
            type="button"
            title={isLightTheme ? 'Switch to dark theme' : 'Switch to light theme'}
            aria-label="Toggle theme"
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--surface-strong)] transition-colors focus:outline-none text-[var(--ink)]"
            onClick={toggleTheme}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={isLightTheme ? '0' : '0.2'} stroke="currentColor" strokeWidth="1.75" />
              <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
            </svg>
          </button>

          {/* Item 2: Connected Wallet Button */}
          <ConnectKitButton.Custom>
            {({ isConnected, show, address }) => {
              const displayAddr = isConnected && address
                ? `${address.slice(0, 6)}••••${address.slice(-4)}`
                : '0x46A5••••D565'
              return (
                <button
                  onClick={show}
                  type="button"
                  className="bg-[var(--bg)] rounded-xl px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-strong)] shadow-xs focus:outline-none transition-colors text-[var(--ink)]"
                >
                  <div className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 leading-none">
                    A
                  </div>
                  <span className="font-mono text-xs font-semibold tracking-tight">
                    {displayAddr}
                  </span>
                </button>
              )
            }}
          </ConnectKitButton.Custom>
        </aside>

      </div>
    </div>
  )
}
