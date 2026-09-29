import { http, createConfig, fallback } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

const rpcUrl = (import.meta.env.VITE_ARC_RPC_URL as string) || arcTestnet.rpcUrls.default.http[0]

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, rpcUrl)

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: fallback([
      http(rpcUrl, { retryCount: 5, retryDelay: 1000 }),
    ]),
  },
})
