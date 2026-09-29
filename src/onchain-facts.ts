/*
 * Onchain facts for this app. GENERATED — do not edit.
 *
 * Arc Studio writes this file from its onchain facts registry, so the values here are
 * the ones Arc Studio itself deploys and links against. Edits are overwritten.
 *
 * Import a fact instead of typing one:
 *
 *   import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts';
 *
 * A chain's gas token and its ERC-20 USDC are separate facts. On Arc both are
 * USDC, at different decimal counts: 'nativeCurrency' for the gas token,
 * 'usdc' for the ERC-20. Mixing the two is a 10^12 error on a money path.
 */

export const USDC_DECIMALS = 6;

export interface TokenFact {
  symbol: string;
  address: string;
  decimals: number;
}

export interface NativeCurrencyFact {
  symbol: string;
  decimals: number;
  /** True when the gas token IS USDC, which makes 'decimals' above the gas decimals. */
  isUsdc: boolean;
}

export interface OnchainChain {
  chainId: number;
  name: string;
  isTestnet: boolean;
  /** Rollup / alt-EVM family. Absent for an L1 and for a chain in no shared-stack family. */
  family?: string;
  explorerBase: string;
  rpcUrls: string[];
  nativeCurrency: NativeCurrencyFact;
  /** Absent when no USDC contract is deployed on the chain. */
  usdc?: TokenFact;
  cctpDomain?: number;
  /** Circle SCP blockchain enum. Absent unless the deploy tool supports the chain. */
  scpBlockchain?: string;
}

export interface ProtocolContractFact {
  name: string;
  address: string;
  protocol: 'CCTP' | 'Gateway';
  networkKind?: 'testnet' | 'mainnet';
}

interface OnchainFacts {
  chains: OnchainChain[];
  protocolContracts: ProtocolContractFact[];
}

const FACTS: OnchainFacts = {
  "chains": [
    {
      "chainId": 5042002,
      "name": "Arc Testnet",
      "isTestnet": true,
      "family": "arc",
      "explorerBase": "https://explorer.testnet.arc.io",
      "rpcUrls": [
        "https://rpc.testnet.arc.io"
      ],
      "nativeCurrency": {
        "symbol": "USDC",
        "decimals": 18,
        "isUsdc": true
      },
      "usdc": {
        "symbol": "USDC",
        "address": "0x3600000000000000000000000000000000000000",
        "decimals": 6
      },
      "cctpDomain": 26,
      "scpBlockchain": "ARC-TESTNET"
    }
  ],
  "protocolContracts": [
    {
      "name": "TokenMessengerV2",
      "address": "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
      "protocol": "CCTP",
      "networkKind": "testnet"
    },
    {
      "name": "MessageTransmitterV2",
      "address": "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
      "protocol": "CCTP",
      "networkKind": "testnet"
    },
    {
      "name": "TokenMinterV2",
      "address": "0xb43db544E2c27092c107639Ad201b3dEfAbcF192",
      "protocol": "CCTP",
      "networkKind": "testnet"
    },
    {
      "name": "MessageV2",
      "address": "0xbaC0179bB358A8936169a63408C8481D582390C4",
      "protocol": "CCTP",
      "networkKind": "testnet"
    },
    {
      "name": "BridgingKitContract",
      "address": "0xC5567a5E3370d4DBfB0540025078e283e36A363d",
      "protocol": "CCTP",
      "networkKind": "testnet"
    },
    {
      "name": "TokenMessengerV2",
      "address": "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
      "protocol": "CCTP",
      "networkKind": "mainnet"
    },
    {
      "name": "MessageTransmitterV2",
      "address": "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
      "protocol": "CCTP",
      "networkKind": "mainnet"
    },
    {
      "name": "TokenMinterV2",
      "address": "0xfd78EE919681417d192449715b2594ab58f5D002",
      "protocol": "CCTP",
      "networkKind": "mainnet"
    },
    {
      "name": "MessageV2",
      "address": "0xec546b6B005471ECf012e5aF77FBeC07e0FD8f78",
      "protocol": "CCTP",
      "networkKind": "mainnet"
    },
    {
      "name": "GatewayWallet",
      "address": "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
      "protocol": "Gateway",
      "networkKind": "testnet"
    },
    {
      "name": "GatewayMinter",
      "address": "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",
      "protocol": "Gateway",
      "networkKind": "testnet"
    },
    {
      "name": "GatewayWallet",
      "address": "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
      "protocol": "Gateway",
      "networkKind": "mainnet"
    },
    {
      "name": "GatewayMinter",
      "address": "0x2222222d7164433c4C09B0b0D809a9b52C04C205",
      "protocol": "Gateway",
      "networkKind": "mainnet"
    }
  ]
};

export const ONCHAIN_CHAINS: readonly OnchainChain[] = FACTS.chains;

export const TESTNET_ONCHAIN_CHAINS: readonly OnchainChain[] = FACTS.chains.filter((chain) => chain.isTestnet);

/** CCTP and Gateway addresses differ by network kind (see networkKind) — mainnet differs from testnet. */
export const EVM_PROTOCOL_CONTRACTS: readonly ProtocolContractFact[] = FACTS.protocolContracts;

const BY_CHAIN_ID = new Map(ONCHAIN_CHAINS.map((chain) => [chain.chainId, chain]));

const BY_SCP_BLOCKCHAIN = new Map(
  ONCHAIN_CHAINS.flatMap((chain) => (chain.scpBlockchain ? [[chain.scpBlockchain, chain] as const] : [])),
);

export function getChain(chainId: number): OnchainChain | undefined {
  return BY_CHAIN_ID.get(chainId);
}

export function requireChain(chainId: number): OnchainChain {
  const chain = getChain(chainId);

  if (!chain) {
    throw new Error('Unknown chain ID ' + chainId + ' — ask Arc Studio to add it to its onchain facts registry');
  }

  return chain;
}

export function getChainByScpBlockchain(blockchain: string): OnchainChain | undefined {
  return BY_SCP_BLOCKCHAIN.get(blockchain);
}

export function requireChainByScpBlockchain(blockchain: string): OnchainChain {
  const chain = getChainByScpBlockchain(blockchain);

  if (!chain) {
    throw new Error(
      "No chain for SCP blockchain '" + blockchain + "' — ask Arc Studio to add it to its onchain facts registry",
    );
  }

  return chain;
}

export function getUsdc(chainId: number): TokenFact | undefined {
  return getChain(chainId)?.usdc;
}

export function getProtocolContractByName(
  name: string,
  networkKind?: 'testnet' | 'mainnet',
): ProtocolContractFact | undefined {
  const matches = EVM_PROTOCOL_CONTRACTS.filter((contract) => contract.name === name);
  if (matches.length > 1 && networkKind === undefined) {
    throw new Error('"' + name + '" has both a testnet and a mainnet address — pass networkKind to disambiguate');
  }
  return matches.find((contract) => contract.networkKind === undefined || contract.networkKind === networkKind);
}

export function buildAddressExplorerUrl(chainId: number, address: string): string {
  return requireChain(chainId).explorerBase + '/address/' + address;
}

export function buildTxExplorerUrl(chainId: number, txHash: string): string {
  return requireChain(chainId).explorerBase + '/tx/' + txHash;
}
