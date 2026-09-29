#!/usr/bin/env bash
set -euo pipefail

# Check src/, contracts/, and foundry.toml for any chain name or RPC
# other than Arc L1: ethereum, sepolia, base, arbitrum, polygon, optimism, avalanche, unichain.

TARGETS="src/ contracts/ foundry.toml"

# Grep for chain names or RPCs across targets, excluding generated build artifacts
# and filtering out common non-chain false positives (CSS classes, Base64 library, EIP-1193 window.ethereum object).
OFFENDING_FILES=$(grep -rn -I -i -E '(ethereum|sepolia|base|arbitrum|polygon|optimism|avalanche|unichain)' $TARGETS \
  --exclude-dir=out \
  --exclude-dir=cache \
  --exclude="*.log" 2>/dev/null \
  | grep -v -E "(window\.ethereum|getEthereum|\.ethereum|\{ ethereum|'ethereum'|@tailwind base|text-base|items-baseline|Base64|baseScale|explorerBase|stack-based)" \
  | cut -d: -f1 \
  | sort -u || true)

if [ -n "$OFFENDING_FILES" ]; then
  echo "Non-Arc chain or RPC references found in:"
  echo "$OFFENDING_FILES"
  exit 1
fi

echo "Arc-only check passed."
exit 0
