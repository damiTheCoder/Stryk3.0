import { encodeAbiParameters, encodePacked, keccak256 } from 'viem'

/**
 * Merkle tree construction matches GridManager._verifyProof.
 * Leaves: keccak256(abi.encode(uint16 coord, bytes32 pairHash))
 * Parents: keccak256(abi.encodePacked(sorted pair))
 * Root: top of tree
 */

export interface GeneratedBoard {
  merkleRoot: `0x${string}`           // <-- NEW: 32-byte root
  winningCoordinates: number[]        // <-- unchanged, 100 entries
  unitBindings: number[]              // <-- unchanged, 100 entries
  plaintextPairs: {
    coordinate: number
    pair_a: string                   // decimal string of BigInt
    pair_b: string                   // decimal string of BigInt
    pair_hash: `0x${string}`
  }[]                                // <-- unchanged, 676 entries
}

function randomTwoDigitInTens(): bigint {
  const arr = new Uint8Array(1)
  crypto.getRandomValues(arr)
  // (arr[0] % 90) yields 0..89
  // + 10 yields 10..99 inclusive
  return BigInt((arr[0] % 90) + 10)
}

function getRandomInt(max: number): number {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return arr[0] % max
}

export function _computeMerkleRoot(leaves: `0x${string}`[]): `0x${string}` {
  if (leaves.length === 0) {
    return '0x0000000000000000000000000000000000000000000000000000000000000000'
  }
  let currentLevel = leaves
  while (currentLevel.length > 1) {
    const nextLevel: `0x${string}`[] = []
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        const a = currentLevel[i]
        const b = currentLevel[i + 1]
        const left = a.toLowerCase() <= b.toLowerCase() ? a : b
        const right = a.toLowerCase() <= b.toLowerCase() ? b : a
        nextLevel.push(keccak256(encodePacked(['bytes32', 'bytes32'], [left, right])))
      } else {
        // Promote odd last element
        nextLevel.push(currentLevel[i])
      }
    }
    currentLevel = nextLevel
  }
  return currentLevel[0]
}

export function generateBoard(): GeneratedBoard {
  const plaintextPairs: GeneratedBoard['plaintextPairs'] = []
  const leaves: `0x${string}`[] = []

  // 1. Generate 676 pairs and their ABI-encoded keccak hashes
  for (let c = 0; c < 676; c++) {
    const pairA = randomTwoDigitInTens()
    const pairB = randomTwoDigitInTens()

    const pairHash = keccak256(
      encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }],
        [pairA, pairB]
      )
    )

    // Leaf: keccak256(abi.encode(uint16(coordinate), pairHash))
    const leaf = keccak256(
      encodeAbiParameters(
        [{ type: 'uint16' }, { type: 'bytes32' }],
        [c, pairHash]
      )
    )

    leaves.push(leaf)
    plaintextPairs.push({
      coordinate: c,
      pair_a: pairA.toString(),
      pair_b: pairB.toString(),
      pair_hash: pairHash,
    })
  }

  // 2. Compute Merkle root
  const merkleRoot = _computeMerkleRoot(leaves)

  // 3. Pick 100 winning coordinates via Fisher-Yates shuffle
  const coords = Array.from({ length: 676 }, (_, i) => i)
  for (let i = coords.length - 1; i > 0; i--) {
    const j = getRandomInt(i + 1)
    const temp = coords[i]
    coords[i] = coords[j]
    coords[j] = temp
  }

  const winningCoordinates = coords.slice(0, 100).sort((a, b) => a - b)
  const unitBindings = winningCoordinates.map((_, i) => i + 1)

  return {
    merkleRoot,
    winningCoordinates,
    unitBindings,
    plaintextPairs,
  }
}

export function coordToLabel(coord: number): string {
  const letterIndex = Math.floor(coord / 26)
  const rowIndex = (coord % 26) + 1
  const letter = String.fromCharCode(65 + letterIndex)
  return `${letter}${rowIndex}`
}

export function labelToCoord(label: string): number {
  const match = label.toUpperCase().trim().match(/^([A-Z])(\d{1,2})$/)
  if (!match) throw new Error('Invalid coordinate')
  const letterIndex = match[1].charCodeAt(0) - 65
  const rowIndex = parseInt(match[2], 10)
  if (letterIndex < 0 || letterIndex > 25) throw new Error('Invalid column')
  if (rowIndex < 1 || rowIndex > 26) throw new Error('Invalid row')
  return letterIndex * 26 + (rowIndex - 1)
}

export function getMerkleProof(
  pairs: { coordinate: number; pair_a: string; pair_b: string; pair_hash: string }[],
  coordinate: number
): `0x${string}`[] {
  const sortedPairs = [...pairs].sort((a, b) => a.coordinate - b.coordinate)
  const leaves: `0x${string}`[] = sortedPairs.map((p) => {
    return keccak256(
      encodeAbiParameters(
        [{ type: 'uint16' }, { type: 'bytes32' }],
        [p.coordinate, p.pair_hash as `0x${string}`]
      )
    )
  })

  let targetIdx = sortedPairs.findIndex((p) => p.coordinate === coordinate)
  if (targetIdx === -1) throw new Error(`Coordinate ${coordinate} not found in reference sheet`)

  const proof: `0x${string}`[] = []
  let currentLevel = leaves

  while (currentLevel.length > 1) {
    const nextLevel: `0x${string}`[] = []
    const isRightChild = targetIdx % 2 === 1
    const siblingIdx = isRightChild ? targetIdx - 1 : targetIdx + 1

    if (siblingIdx < currentLevel.length) {
      proof.push(currentLevel[siblingIdx])
    }

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        const a = currentLevel[i]
        const b = currentLevel[i + 1]
        const left = a.toLowerCase() <= b.toLowerCase() ? a : b
        const right = a.toLowerCase() <= b.toLowerCase() ? b : a
        nextLevel.push(keccak256(encodePacked(['bytes32', 'bytes32'], [left, right])))
      } else {
        nextLevel.push(currentLevel[i])
      }
    }

    targetIdx = Math.floor(targetIdx / 2)
    currentLevel = nextLevel
  }

  return proof
}
