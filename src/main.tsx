/*
 *  ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
 *  ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
 *  ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
 *  ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝
 *
 *  Built with Arc Studio
 *  https://studio.arc.io
 */

import './tracing'
import './console-capture'

import { Component, StrictMode, type ReactNode, type ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { BrowserRouter } from 'react-router-dom'
import { MoonPayProvider } from '@moonpay/moonpay-react'
import { config } from './config'
import App from './App'
import './index.css'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RootErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', fontFamily: 'system-ui, sans-serif', maxWidth: '640px', margin: '40px auto', background: '#fee2e2', borderRadius: '16px', color: '#991b1b' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>Something went wrong</h2>
          <p style={{ fontSize: '14px', marginBottom: '16px' }}>{this.state.error?.message || 'An unexpected runtime error occurred.'}</p>
          <pre style={{ fontSize: '11px', background: 'rgba(0,0,0,0.06)', padding: '12px', borderRadius: '8px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '16px', padding: '8px 16px', borderRadius: '8px', background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

const queryClient = new QueryClient()

const moonpayKey = (import.meta.env.VITE_MOONPAY_PUBLIC_KEY as string | undefined) ?? 'pk_test_key'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <ConnectKitProvider>
              <MoonPayProvider apiKey={moonpayKey}>
                <App />
                <Toaster position="top-center" />
              </MoonPayProvider>
            </ConnectKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>,
)

