import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import {
  LayoutDashboard,
  FileText,
  Inbox,
  Send,
  ShoppingCart,
  Menu,
  X,
  Layers,
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
  { id: 'marketplace', label: 'Marketplace',  icon: <ShoppingCart className="size-5" /> },
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
      <Route path="*" element={<AppShell tab={tab} navigate={navigate} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} selectedGridId={selectedGridId} openGrid={openGrid} />} />
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
}: {
  tab: Tab
  navigate: (t: Tab) => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  selectedGridId: bigint | null
  openGrid: (gridId: bigint) => void
}) {
  return (
    <div className="min-h-dvh flex" style={{ background: 'var(--bg-gradient)' }}>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={[
          'fixed top-0 left-0 h-full z-40 flex flex-col transition-transform duration-300',
          'w-64',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0 lg:static lg:z-auto',
        ].join(' ')}
        style={{
          background: 'var(--sidebar-bg)',

        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center rounded-xl"
              style={{ width: 32, height: 32, background: '#1a1a1a' }}
            >
              <StrykLogo size={20} />
            </div>
            <span className="display text-lg font-bold tracking-tight" style={{ color: '#f5f5f5' }}>
              Stryk
            </span>
          </div>
          <button
            className="lg:hidden p-1 rounded-lg"
            style={{ color: 'var(--subtle)' }}
            onClick={() => setSidebarOpen(false)}
          >
            <X className="size-5" />
          </button>
        </div>



        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {TABS.map(t => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => navigate(t.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                style={{
                  background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                  color: active ? '#f5f5f5' : 'var(--muted)',
                  fontWeight: active ? 600 : 400,
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget).style.background = 'rgba(255,255,255,0.05)'
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget).style.background = 'transparent'
                }}
              >
                <span style={{ color: active ? '#f5f5f5' : 'var(--subtle)' }}>{t.icon}</span>
                <span className="flex-1 text-sm">{t.label}</span>
                {t.badge && (
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: '#f5f5f5', color: '#0a0a0a', letterSpacing: '0.06em' }}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar — always visible */}
        <header
          className="sticky top-0 z-20 px-5 py-3 flex items-center justify-between"
          style={{ background: 'var(--bg-gradient)' }}
        >
          {/* Left: hamburger (mobile) + logo (mobile) */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl"
              style={{ color: 'var(--ink)' }}
            >
              <Menu className="size-5" />
            </button>
            <div className="flex items-center gap-2 lg:hidden">
              <StrykLogo size={20} />
              <span className="display text-base font-bold tracking-tight" style={{ color: '#f5f5f5' }}>Stryk</span>
            </div>
          </div>

          {/* Right: wallet connect */}
          <ConnectKitButton
            customTheme={{
              '--ck-font-family': "'Glacial Indifference', 'DM Sans', sans-serif",
              '--ck-primary-button-background': '#f5f5f5',
              '--ck-primary-button-color': '#0a0a0a',
              '--ck-primary-button-hover-background': '#ffffff',
              '--ck-body-background': '#111111',
              '--ck-body-color': '#f5f5f5',
              '--ck-border-radius': '12px',
            }}
          />
        </header>

        {/* Page content */}
        <main className={[
          'flex-1 px-4 py-6 w-full mx-auto',
          (tab === 'marketplace' && selectedGridId === null) ? 'max-w-7xl' : 'max-w-3xl',
        ].join(' ')}>
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
      </div>
    </div>
  )
}
