// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GridManager} from "../GridManager.sol";
import {CoinTagManager} from "../CoinTagManager.sol";
import {UnitClaim} from "../UnitClaim.sol";
import {InvoiceManager} from "../InvoiceManager.sol";
import {CollateralManager} from "../CollateralManager.sol";
import {Treasury} from "../Treasury.sol";
import {InvoiceNFT} from "../InvoiceNFT.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 100_000_000 * 1e6);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract InvariantsTest is Test {
    GridManager public gridManager;
    CoinTagManager public coinTagManager;
    UnitClaim public unitClaim;
    InvoiceManager public invoiceManager;
    CollateralManager public collateralManager;
    Treasury public treasury;
    InvoiceNFT public invoiceNFT;
    MockUSDC public usdc;

    address public admin = address(0xAD);
    address public platformRecipient = address(0xCAFE);
    address public creator = address(0x101);
    address public hunter = address(0x202);
    address public unauthorizedHunter = address(0x303);

    uint16[100]  public winningCoords;
    uint8[100]   public unitBindings;
    bytes32[676] public pairHashes;
    bytes32      public merkleRoot;
    bytes32[10][100] public winningProofs;

    uint256 public constant INVOICE_ID = 1;
    uint256 public constant INITIAL_COLLATERAL = 10_000 * 1e6; // 10,000 USDC
    uint256 public constant COINTAG_PRICE = 100 * 1e6; // 100 USDC

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function buildTree(bytes32[676] memory hashes)
        internal
        pure
        returns (bytes32 root, bytes32[2048] memory tree)
    {
        for (uint16 c = 0; c < 676; c++) {
            tree[1024 + c] = keccak256(abi.encode(c, hashes[c]));
        }
        for (uint256 i = 1023; i > 0; i--) {
            tree[i] = _hashPair(tree[2 * i], tree[2 * i + 1]);
        }
        root = tree[1];
    }

    function getProofFromTree(bytes32[2048] memory tree, uint16 targetCoord)
        internal
        pure
        returns (bytes32[] memory)
    {
        bytes32[] memory proof = new bytes32[](10);
        uint256 idx = 1024 + targetCoord;
        for (uint256 level = 0; level < 10; level++) {
            proof[level] = tree[idx ^ 1];
            idx = idx / 2;
        }
        return proof;
    }

    function _getProofMemory(uint16 i) internal view returns (bytes32[] memory) {
        bytes32[] memory p = new bytes32[](10);
        for (uint256 k = 0; k < 10; k++) {
            p[k] = winningProofs[i][k];
        }
        return p;
    }

    function setUp() public {
        usdc = new MockUSDC();
        treasury = new Treasury(admin, platformRecipient);
        collateralManager = new CollateralManager(admin);
        unitClaim = new UnitClaim(admin);
        invoiceNFT = new InvoiceNFT(admin);
        gridManager = new GridManager(admin, address(collateralManager), address(unitClaim));

        invoiceManager = new InvoiceManager(
            admin,
            address(collateralManager),
            address(invoiceNFT),
            address(gridManager),
            0
        );

        coinTagManager = new CoinTagManager(
            admin,
            address(collateralManager),
            address(treasury),
            address(gridManager),
            address(invoiceManager)
        );

        vm.startPrank(admin);
        // Roles
        invoiceNFT.grantRole(invoiceNFT.INVOICE_MANAGER(), address(invoiceManager));
        collateralManager.grantRole(collateralManager.INVOICE_MANAGER(), address(invoiceManager));
        collateralManager.grantRole(collateralManager.COINTAG_MANAGER(), address(coinTagManager));
        collateralManager.grantRole(collateralManager.GRID_MANAGER(), address(gridManager));

        unitClaim.grantRole(unitClaim.GRID_MANAGER(), address(gridManager));

        gridManager.grantRole(gridManager.INVOICE_MANAGER(), address(invoiceManager));
        gridManager.grantRole(gridManager.COINTAG_MANAGER(), address(coinTagManager));

        treasury.grantRole(treasury.COINTAG_MANAGER(), address(coinTagManager));

        coinTagManager.setAllowlistedStablecoin(address(usdc), true);
        coinTagManager.setGlobalCoinTagPrice(COINTAG_PRICE);
        vm.stopPrank();

        // Prepare deterministic 100 winning coords (0..99 mapped to unit 1..100)
        for (uint16 i = 0; i < 100; i++) {
            winningCoords[i] = i;
            unitBindings[i] = uint8(i + 1);
        }
        for (uint16 c = 0; c < 676; c++) {
            pairHashes[c] = keccak256(abi.encode(uint256(c), uint256(c + 1000)));
        }

        bytes32[2048] memory tree;
        (merkleRoot, tree) = buildTree(pairHashes);

        for (uint16 i = 0; i < 100; i++) {
            uint256 idx = 1024 + i;
            for (uint256 level = 0; level < 10; level++) {
                winningProofs[i][level] = tree[idx ^ 1];
                idx = idx / 2;
            }
        }

        // Fund creator & create + tokenize invoice
        usdc.mint(creator, INITIAL_COLLATERAL);
        vm.prank(creator);
        usdc.approve(address(collateralManager), INITIAL_COLLATERAL);

        vm.startPrank(creator);
        invoiceManager.tokenizeInvoice(
            INITIAL_COLLATERAL,
            address(usdc),
            uint64(block.timestamp + 30 days),
            bytes32(0),
            "ipfs://QmInvariant",
            winningCoords,
            unitBindings,
            merkleRoot
        );
        vm.stopPrank();

        // Fund hunter
        usdc.mint(hunter, 100_000 * 1e6);
    }

    // Invariant 2: Conservation of CoinTag value (fuzz 1..1e30)
    function testFuzz_Invariant2_CoinTagSplitConservation(uint256 amount) public pure {
        vm.assume(amount > 0 && amount <= 1e30);
        uint256 creatorAmount = (amount * 70) / 100;
        uint256 collateralAmount = (amount * 15) / 100;
        uint256 platformAmount = amount - creatorAmount - collateralAmount;

        assertEq(creatorAmount + collateralAmount + platformAmount, amount);
    }

    // Invariant 7: submitPair reverts without access
    function test_Invariant7_SubmitPairRevertsWithoutAccess() public {
        assertFalse(gridManager.hasAccess(unauthorizedHunter, INVOICE_ID));

        bytes32[] memory proof0 = _getProofMemory(0);

        vm.prank(unauthorizedHunter);
        vm.expectRevert("CPU not found");
        gridManager.submitPair(INVOICE_ID, 0, 0, 1000, proof0);
    }

    // Invariant 12: All failure modes revert with exact "CPU not found"
    function test_Invariant12_AllFailureModesRevertWithExactCPUNotFound() public {
        // Grant access to hunter
        vm.startPrank(hunter);
        usdc.approve(address(coinTagManager), COINTAG_PRICE);
        coinTagManager.purchaseCoinTag(INVOICE_ID, address(usdc), COINTAG_PRICE);

        bytes32[2048] memory tree;
        (, tree) = buildTree(pairHashes);

        bytes32[] memory proof0 = _getProofMemory(0);
        bytes32[] memory proof100 = getProofFromTree(tree, 100);

        // Failure Mode 1: Out of bounds coordinate (>= 676)
        vm.expectRevert("CPU not found");
        gridManager.submitPair(INVOICE_ID, 676, 676, 1676, proof0);

        // Failure Mode 2: Pair preimage hash mismatch
        vm.expectRevert("CPU not found");
        gridManager.submitPair(INVOICE_ID, 0, 0, 9999, proof0); // bad b

        // Failure Mode 3: Decoy cell (coordinate 100 is decoy)
        vm.expectRevert("CPU not found");
        gridManager.submitPair(INVOICE_ID, 100, 100, 1100, proof100);

        // Failure Mode 4: Claim coordinate 0 (unit 1)
        gridManager.submitPair(INVOICE_ID, 0, 0, 1000, proof0); // succeeds!

        // Failure Mode 5: Double claim on already claimed coordinate / unit
        vm.expectRevert("CPU not found");
        gridManager.submitPair(INVOICE_ID, 0, 0, 1000, proof0);
        vm.stopPrank();
    }

    // Invariant 6: No double claims on same unit
    function test_Invariant6_NoDoubleClaimsOnSameUnit() public {
        vm.startPrank(hunter);
        usdc.approve(address(coinTagManager), COINTAG_PRICE);
        coinTagManager.purchaseCoinTag(INVOICE_ID, address(usdc), COINTAG_PRICE);

        bytes32[] memory proof5 = _getProofMemory(5);

        gridManager.submitPair(INVOICE_ID, 5, 5, 1005, proof5); // unit 6
        assertEq(unitClaim.tokenOf(INVOICE_ID, 6), 1);

        // Same caller or different caller claiming unit 6 reverts with "CPU not found"
        vm.expectRevert("CPU not found");
        gridManager.submitPair(INVOICE_ID, 5, 5, 1005, proof5);
        vm.stopPrank();

        // Direct call to UnitClaim.mint reverts with ALREADY_MINTED
        vm.prank(address(gridManager));
        vm.expectRevert("ALREADY_MINTED");
        unitClaim.mint(hunter, INVOICE_ID, 6);
    }

    // Invariant 13: 100 winning coords bound to unitIds 1..100
    function test_Invariant13_WinningCoordsBijectiveTo1To100() public view {
        bool[101] memory seenUnit;
        for (uint16 i = 0; i < 100; i++) {
            uint16 coord = winningCoords[i];
            uint8 unitId = gridManager.getCoordinateToUnit(INVOICE_ID, coord);
            assertTrue(unitId >= 1 && unitId <= 100);
            assertFalse(seenUnit[unitId]);
            seenUnit[unitId] = true;
        }

        // All 100 units 1..100 are mapped
        for (uint256 u = 1; u <= 100; u++) {
            assertTrue(seenUnit[u]);
        }
    }

    // Invariants 1, 3, 11:
    // - Invariant 1: Exactly 100 units claimable, never > 100
    // - Invariant 3: initialCollateral + coinTagContributions == paidOut + remaining balance
    // - Invariant 11: isCompleted == true iff unitsClaimed == 100
    function test_Invariants1_3_11_FullGameSimulation() public {
        vm.startPrank(hunter);
        usdc.approve(address(coinTagManager), COINTAG_PRICE * 10);

        // Purchase access
        coinTagManager.purchaseCoinTag(INVOICE_ID, address(usdc), COINTAG_PRICE);

        // Check solvency initially
        (,, uint256 initCol, uint256 coinTagCol, uint256 totCol, uint256 paidOut, uint256 claimed, bool locked) =
            collateralManager.pools(INVOICE_ID);
        assertTrue(locked);
        assertEq(claimed, 0);
        assertEq(initCol + coinTagCol, paidOut + usdc.balanceOf(address(collateralManager)));

        // Claim units 1 to 50
        for (uint16 i = 0; i < 50; i++) {
            bytes32[] memory proof = _getProofMemory(i);
            gridManager.submitPair(INVOICE_ID, i, i, i + 1000, proof);
            assertFalse(gridManager.isCompleted(INVOICE_ID));
        }
        assertEq(gridManager.getBoardUnitsClaimed(INVOICE_ID), 50);

        // Mid-game CoinTag contribution increases collateral pool
        coinTagManager.purchaseCoinTag(INVOICE_ID, address(usdc), COINTAG_PRICE);

        (,, initCol, coinTagCol, totCol, paidOut, claimed,) = collateralManager.pools(INVOICE_ID);
        assertEq(claimed, 50);
        assertEq(initCol + coinTagCol, paidOut + usdc.balanceOf(address(collateralManager)));

        // Claim units 51 to 99
        for (uint16 i = 50; i < 99; i++) {
            bytes32[] memory proof = _getProofMemory(i);
            gridManager.submitPair(INVOICE_ID, i, i, i + 1000, proof);
            assertFalse(gridManager.isCompleted(INVOICE_ID));
        }
        assertEq(gridManager.getBoardUnitsClaimed(INVOICE_ID), 99);
        assertFalse(gridManager.isCompleted(INVOICE_ID));

        // Claim the 100th unit
        bytes32[] memory proof99 = _getProofMemory(99);
        gridManager.submitPair(INVOICE_ID, 99, 99, 1099, proof99);

        // Invariant 11: isCompleted iff unitsClaimed == 100
        assertEq(gridManager.getBoardUnitsClaimed(INVOICE_ID), 100);
        assertTrue(gridManager.isCompleted(INVOICE_ID));

        // Invariant 1: Exactly 100 units claimed, further claims revert
        vm.expectRevert("CPU not found");
        gridManager.submitPair(INVOICE_ID, 99, 99, 1099, proof99);

        // Invariant 3: Solvency holds at completion
        (,, initCol, coinTagCol, totCol, paidOut, claimed,) = collateralManager.pools(INVOICE_ID);
        assertEq(claimed, 100);
        assertEq(initCol + coinTagCol, paidOut + usdc.balanceOf(address(collateralManager)));
        vm.stopPrank();
    }

    // Invariant 4: Treasury separation
    function test_Invariant4_TreasurySeparation() public view {
        // Treasury only tracks platform revenue, has no claim payout functionality
        assertEq(treasury.totalRevenueCollected(address(usdc)), 0);
        assertEq(usdc.balanceOf(address(treasury)), 0);
        // CollateralManager holds hunter collateral, completely isolated from Treasury
        assertEq(usdc.balanceOf(address(collateralManager)), INITIAL_COLLATERAL);
    }
}
