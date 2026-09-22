import { requireChain } from '@/onchain-facts'

export const ARC_TESTNET_ID = 5042002

requireChain(ARC_TESTNET_ID) // validates chain exists

export const INVOICE_CONTRACT = {
  address: '0x1f6e9cccf4f4c782900694b452c8dea490a59530' as `0x${string}`,
  abi: [
    {
      type: 'constructor',
      inputs: [
        { name: 'usdcAddress', type: 'address' },
        { name: 'initialOwner', type: 'address' },
      ],
    },
    {
      type: 'function',
      name: 'createInvoice',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'client', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'description', type: 'string' },
        { name: 'dueDate', type: 'uint256' },
      ],
      outputs: [{ name: 'invoiceId', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'payInvoice',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'invoiceId', type: 'uint256' }],
      outputs: [],
    },
    {
      type: 'function',
      name: 'tokenizeInvoice',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'invoiceId', type: 'uint256' }],
      outputs: [],
    },
    {
      type: 'function',
      name: 'cancelInvoice',
      stateMutability: 'nonpayable',
      inputs: [{ name: 'invoiceId', type: 'uint256' }],
      outputs: [],
    },
    {
      type: 'function',
      name: 'getInvoice',
      stateMutability: 'view',
      inputs: [{ name: 'invoiceId', type: 'uint256' }],
      outputs: [
        {
          type: 'tuple',
          components: [
            { name: 'id', type: 'uint256' },
            { name: 'vendor', type: 'address' },
            { name: 'client', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'description', type: 'string' },
            { name: 'dueDate', type: 'uint256' },
            { name: 'status', type: 'uint8' },
            { name: 'tokenContract', type: 'address' },
          ],
        },
      ],
    },
    {
      type: 'function',
      name: 'getVendorInvoices',
      stateMutability: 'view',
      inputs: [{ name: 'vendor', type: 'address' }],
      outputs: [{ type: 'uint256[]' }],
    },
    {
      type: 'function',
      name: 'getClientInvoices',
      stateMutability: 'view',
      inputs: [{ name: 'client', type: 'address' }],
      outputs: [{ type: 'uint256[]' }],
    },
    {
      type: 'function',
      name: 'usdcToken',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ type: 'address' }],
    },
    {
      type: 'event',
      name: 'InvoiceCreated',
      inputs: [
        { name: 'id', type: 'uint256', indexed: true },
        { name: 'vendor', type: 'address', indexed: true },
        { name: 'client', type: 'address', indexed: true },
        { name: 'amount', type: 'uint256' },
        { name: 'dueDate', type: 'uint256' },
      ],
    },
    {
      type: 'event',
      name: 'InvoicePaid',
      inputs: [
        { name: 'id', type: 'uint256', indexed: true },
        { name: 'payer', type: 'address', indexed: true },
        { name: 'amount', type: 'uint256' },
      ],
    },
    {
      type: 'event',
      name: 'InvoiceTokenized',
      inputs: [
        { name: 'id', type: 'uint256', indexed: true },
        { name: 'tokenContract', type: 'address' },
      ],
    },
    {
      type: 'event',
      name: 'InvoiceCancelled',
      inputs: [{ name: 'id', type: 'uint256', indexed: true }],
    },
  ] as const,
}

// StrykNFT — ERC-721 invoice receivable NFTs
export const STRYK_NFT_CONTRACT = {
  address: '0x127ece5559a9ee6a8a2cf9f43170f82515cf29c3' as `0x${string}`,
  abi: [
    { type: 'function', name: 'mintFromPlatform', stateMutability: 'nonpayable',
      inputs: [{ name: 'vendor', type: 'address' }, { name: 'faceValue', type: 'uint256' }, { name: 'dueDate', type: 'uint256' }, { name: 'invoiceRef', type: 'string' }],
      outputs: [{ name: 'tokenId', type: 'uint256' }] },
    { type: 'function', name: 'mintExternal', stateMutability: 'nonpayable',
      inputs: [{ name: 'vendor', type: 'address' }, { name: 'faceValue', type: 'uint256' }, { name: 'dueDate', type: 'uint256' }, { name: 'invoiceRef', type: 'string' }, { name: 'collateralAmount', type: 'uint256' }],
      outputs: [{ name: 'tokenId', type: 'uint256' }] },
    { type: 'function', name: 'withdrawCollateral', stateMutability: 'nonpayable',
      inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
    { type: 'function', name: 'getInvoiceNFT', stateMutability: 'view',
      inputs: [{ name: 'tokenId', type: 'uint256' }],
      outputs: [{ type: 'tuple', components: [
        { name: 'invoiceRef', type: 'string' },
        { name: 'vendor', type: 'address' },
        { name: 'faceValue', type: 'uint256' },
        { name: 'dueDate', type: 'uint256' },
        { name: 'collateral', type: 'uint256' },
        { name: 'paid', type: 'bool' },
        { name: 'redeemed', type: 'bool' },
        { name: 'tokenizedFromPlatform', type: 'bool' },
      ]}] },
    { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'ownerOf', stateMutability: 'view',
      inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'approve', stateMutability: 'nonpayable',
      inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }], outputs: [] },
    { type: 'function', name: 'setApprovalForAll', stateMutability: 'nonpayable',
      inputs: [{ name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' }], outputs: [] },
    { type: 'event', name: 'InvoiceNFTMinted',
      inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'vendor', type: 'address', indexed: true }, { name: 'faceValue', type: 'uint256' }, { name: 'fromPlatform', type: 'bool' }] },
    { type: 'event', name: 'CollateralWithdrawn',
      inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'vendor', type: 'address', indexed: true }] },
  ] as const,
}

// StrykGrid — cointag grid hunt for NFT receivables
export const STRYK_GRID_CONTRACT = {
  address: '0x61a4f2821bcab35d7abec6abaa888fa34432ef74' as `0x${string}`,
  abi: [
    { type: 'function', name: 'createListing', stateMutability: 'nonpayable',
      inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'cointag', type: 'uint256' }, { name: 'usdcToken', type: 'address' }, { name: 'commitment', type: 'bytes32' }],
      outputs: [{ name: 'gridId', type: 'uint256' }] },
    { type: 'function', name: 'revealWinner', stateMutability: 'nonpayable',
      inputs: [{ name: 'gridId', type: 'uint256' }, { name: 'secret', type: 'bytes32' }], outputs: [] },
    { type: 'function', name: 'revealCell', stateMutability: 'nonpayable',
      inputs: [{ name: 'gridId', type: 'uint256' }, { name: 'cellIndex', type: 'uint256' }, { name: 'usdcToken', type: 'address' }], outputs: [] },
    { type: 'function', name: 'cancelListing', stateMutability: 'nonpayable',
      inputs: [{ name: 'gridId', type: 'uint256' }], outputs: [] },
    { type: 'function', name: 'getGrid', stateMutability: 'view',
      inputs: [{ name: 'gridId', type: 'uint256' }],
      outputs: [
        { name: 'listingGridId', type: 'uint256' }, { name: 'vendor', type: 'address' },
        { name: 'nftContract', type: 'address' }, { name: 'tokenId', type: 'uint256' },
        { name: 'cointag', type: 'uint256' }, { name: 'usdcToken', type: 'address' },
        { name: 'totalRevealed', type: 'uint256' }, { name: 'claimed', type: 'bool' },
        { name: 'active', type: 'bool' }, { name: 'revealedWinningCell', type: 'uint256' },
      ] },
    { type: 'function', name: 'getRevealedCells', stateMutability: 'view',
      inputs: [{ name: 'gridId', type: 'uint256' }],
      outputs: [{ name: 'cells', type: 'address[100]' }] },
    { type: 'function', name: 'GRID_SIZE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'MIN_COIN_TAG', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'event', name: 'ListingCreated',
      inputs: [{ name: 'gridId', type: 'uint256', indexed: true }, { name: 'vendor', type: 'address', indexed: true }, { name: 'tokenId', type: 'uint256', indexed: true }, { name: 'cointag', type: 'uint256' }] },
    { type: 'event', name: 'WinnerRevealed',
      inputs: [{ name: 'gridId', type: 'uint256', indexed: true }, { name: 'winningCell', type: 'uint256' }] },
    { type: 'event', name: 'CellRevealed',
      inputs: [{ name: 'gridId', type: 'uint256', indexed: true }, { name: 'cellIndex', type: 'uint256', indexed: true }, { name: 'revealer', type: 'address', indexed: true }, { name: 'isWinner', type: 'bool' }] },
    { type: 'event', name: 'NFTClaimed',
      inputs: [{ name: 'gridId', type: 'uint256', indexed: true }, { name: 'tokenId', type: 'uint256', indexed: true }, { name: 'claimer', type: 'address', indexed: true }] },
    { type: 'event', name: 'ListingCancelled',
      inputs: [{ name: 'gridId', type: 'uint256', indexed: true }] },
    { type: 'event', name: 'FeeSplit',
      inputs: [{ name: 'gridId', type: 'uint256', indexed: true }, { name: 'creatorAmt', type: 'uint256' }, { name: 'platformAmt', type: 'uint256' }, { name: 'liquidityAmt', type: 'uint256' }] },
    { type: 'function', name: 'platformFeeAddress', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'liquidityPoolAddress', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
    { type: 'function', name: 'CREATOR_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'PLATFORM_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
    { type: 'function', name: 'LIQUIDITY_BPS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  ] as const,
}
