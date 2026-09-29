import { keccak256, encodeAbiParameters } from 'viem'

/**
 * Deterministically derives a CoinTag access code from user address and invoice ID.
 * Matches backend `derive_code(user_address, invoice_id)`.
 *
 * Known test vector:
 * userAddress: '0x46A5956424A9543AEa584227ED667FD6b8EbD565'
 * invoiceId: 1n
 * hash: keccak256(abi.encode(address, uint256))
 * Output format: 'CT-XXXX-XXXX-XXXX'
 */
export function deriveCode(
  userAddress: `0x${string}`,
  invoiceId: bigint
): string {
  const hash = keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [userAddress, invoiceId]
    )
  )
  const hex = hash.slice(2, 14).toUpperCase()
  return `CT-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`
}
