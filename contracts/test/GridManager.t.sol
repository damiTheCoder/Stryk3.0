// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {GridManager} from "../GridManager.sol";
import {UnitClaim} from "../UnitClaim.sol";
import {CollateralManager} from "../CollateralManager.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 10_000_000 * 1e6);
    }
}

contract GridManagerTest is Test {
    GridManager public gridManager;
    UnitClaim public unitClaim;
    CollateralManager public collateralManager;
    MockUSDC public usdc;

    address public admin = address(0xAD);
    address public invoiceManager = address(0x111);
    address public cointagManager = address(0x222);
    address public creator = address(0x333);
    address public hunter = address(0x444);

    uint16[100]  public winningCoords;
    uint8[100]   public unitBindings;
    bytes32[676] public pairHashes;
    bytes32      public merkleRoot;
    bytes32[10][100] public winningProofs;

    event BoardCreated(uint256 indexed invoiceId);
    event AccessGranted(uint256 indexed invoiceId, address indexed user);
    event UnitClaimed(uint256 indexed invoiceId, uint8 unitId, address indexed claimer, uint256 payout);
    event GameCompleted(uint256 indexed invoiceId);

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
        collateralManager = new CollateralManager(admin);
        unitClaim = new UnitClaim(admin);
        gridManager = new GridManager(admin, address(collateralManager), address(unitClaim));

        vm.startPrank(admin);
        gridManager.grantRole(gridManager.INVOICE_MANAGER(), invoiceManager);
        gridManager.grantRole(gridManager.COINTAG_MANAGER(), cointagManager);
        collateralManager.grantRole(collateralManager.GRID_MANAGER(), address(gridManager));
        collateralManager.grantRole(collateralManager.INVOICE_MANAGER(), invoiceManager);
        unitClaim.grantRole(unitClaim.GRID_MANAGER(), address(gridManager));
        vm.stopPrank();

        // Prepare test board:
        // First 100 coords (0..99) are winning coordinates mapped to 1..100
        for (uint16 i = 0; i < 100; i++) {
            winningCoords[i] = i;
            unitBindings[i] = uint8(i + 1);
        }
        // Generate pairHashes: hash of (c, c + 1000)
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

        // Fund and initialize collateral for invoice 1
        uint256 collateral = 10_000 * 1e6;
        usdc.transfer(creator, collateral);
        vm.prank(creator);
        usdc.approve(address(collateralManager), collateral);
        vm.prank(invoiceManager);
        collateralManager.depositInitial(1, address(usdc), creator, collateral);
    }

    function test_CreateBoard_HappyPath() public {
        vm.startPrank(invoiceManager);
        vm.expectEmit(true, false, false, false);
        emit BoardCreated(1);

        gridManager.createBoard(
            1,
            address(usdc),
            winningCoords,
            unitBindings,
            merkleRoot
        );
        vm.stopPrank();

        assertEq(gridManager.getBoardUnitsClaimed(1), 0);
        assertFalse(gridManager.isCompleted(1));
        assertEq(gridManager.getCoordinateToUnit(1, 0), 1);
        assertEq(gridManager.getCoordinateToUnit(1, 99), 100);
        assertEq(gridManager.getCoordinateToUnit(1, 100), 0); // decoy
        assertEq(gridManager.getMerkleRoot(1), merkleRoot);
    }

    function test_CreateBoard_GasUsage() public {
        vm.startPrank(invoiceManager);
        uint256 gasBefore = gasleft();
        gridManager.createBoard(
            1,
            address(usdc),
            winningCoords,
            unitBindings,
            merkleRoot
        );
        uint256 gasUsed = gasBefore - gasleft();
        vm.stopPrank();

        emit log_named_uint("createBoard gas used", gasUsed);
    }

    function test_CreateBoard_RevertsOnInvalidCoordinate() public {
        uint16[100] memory badCoords = winningCoords;
        badCoords[0] = 676; // coordinate out of bounds (max 675)

        vm.startPrank(invoiceManager);
        vm.expectRevert("INVALID_COORD");
        gridManager.createBoard(2, address(usdc), badCoords, unitBindings, merkleRoot);
        vm.stopPrank();
    }

    function test_CreateBoard_RevertsOnNonBijectiveBinding() public {
        uint8[100] memory badBindings = unitBindings;
        badBindings[0] = 2; // non-bijective (starts at 2 instead of 1)

        vm.startPrank(invoiceManager);
        vm.expectRevert("INVALID_BINDING");
        gridManager.createBoard(2, address(usdc), winningCoords, badBindings, merkleRoot);
        vm.stopPrank();
    }

    function test_GrantAccess_HappyPath() public {
        vm.prank(invoiceManager);
        gridManager.createBoard(1, address(usdc), winningCoords, unitBindings, merkleRoot);

        vm.startPrank(cointagManager);
        vm.expectEmit(true, true, false, false);
        emit AccessGranted(1, hunter);

        gridManager.grantAccess(1, hunter);
        vm.stopPrank();

        assertTrue(gridManager.hasAccess(hunter, 1));
    }

    function test_GrantAccess_RevertsOnNonExistentBoard() public {
        vm.startPrank(cointagManager);
        vm.expectRevert("NO_BOARD");
        gridManager.grantAccess(999, hunter);
        vm.stopPrank();
    }

    function test_SubmitPair_HappyPath() public {
        vm.prank(invoiceManager);
        gridManager.createBoard(1, address(usdc), winningCoords, unitBindings, merkleRoot);

        vm.prank(cointagManager);
        gridManager.grantAccess(1, hunter);

        uint256 expectedPayout = (10_000 * 1e6) / 100;
        bytes32[] memory proof = _getProofMemory(0);

        vm.startPrank(hunter);
        vm.expectEmit(true, false, true, true);
        emit UnitClaimed(1, 1, hunter, expectedPayout);

        gridManager.submitPair(1, 0, 0, 1000, proof);
        vm.stopPrank();

        assertEq(gridManager.getBoardUnitsClaimed(1), 1);
        assertTrue(gridManager.isUnitClaimed(1, 1));
        assertEq(usdc.balanceOf(hunter), expectedPayout);
        assertEq(unitClaim.ownerOf(1), hunter);
    }

    function test_SubmitPair_RevertsWithCPUNotFound_AllFailureModes() public {
        vm.prank(invoiceManager);
        gridManager.createBoard(1, address(usdc), winningCoords, unitBindings, merkleRoot);

        bytes32[2048] memory tree;
        (, tree) = buildTree(pairHashes);

        bytes32[] memory proof0 = _getProofMemory(0);
        bytes32[] memory proof100 = getProofFromTree(tree, 100);

        // 1. Reverts with "CPU not found" when caller has NO access
        vm.startPrank(hunter);
        vm.expectRevert("CPU not found");
        gridManager.submitPair(1, 0, 0, 1000, proof0);
        vm.stopPrank();

        // Grant access
        vm.prank(cointagManager);
        gridManager.grantAccess(1, hunter);

        // 2. Reverts with "CPU not found" on wrong pair numbers
        vm.startPrank(hunter);
        vm.expectRevert("CPU not found");
        gridManager.submitPair(1, 0, 999, 888, proof0);

        // 3. Reverts with "CPU not found" on bad Merkle proof
        bytes32[] memory badProof = new bytes32[](10);
        vm.expectRevert("CPU not found");
        gridManager.submitPair(1, 0, 0, 1000, badProof);

        // 4. Reverts with "CPU not found" on decoy coordinate (coord 100 has unitId 0)
        vm.expectRevert("CPU not found");
        gridManager.submitPair(1, 100, 100, 1100, proof100);

        // 5. Successful claim on coord 0 (unit 1)
        gridManager.submitPair(1, 0, 0, 1000, proof0);

        // 6. Reverts with "CPU not found" when trying to re-claim already claimed unit
        vm.expectRevert("CPU not found");
        gridManager.submitPair(1, 0, 0, 1000, proof0);
        vm.stopPrank();
    }

    function test_SubmitPair_CompletesAt100Claims() public {
        vm.prank(invoiceManager);
        gridManager.createBoard(1, address(usdc), winningCoords, unitBindings, merkleRoot);

        vm.prank(cointagManager);
        gridManager.grantAccess(1, hunter);

        vm.startPrank(hunter);
        for (uint16 i = 0; i < 99; i++) {
            bytes32[] memory proof = _getProofMemory(i);
            gridManager.submitPair(1, i, i, i + 1000, proof);
        }

        assertFalse(gridManager.isCompleted(1));
        assertEq(gridManager.getBoardUnitsClaimed(1), 99);

        // 100th claim triggers GameCompleted
        vm.expectEmit(true, false, false, false);
        emit GameCompleted(1);

        bytes32[] memory proof99 = _getProofMemory(99);
        gridManager.submitPair(1, 99, 99, 1099, proof99);

        assertTrue(gridManager.isCompleted(1));
        assertEq(gridManager.getBoardUnitsClaimed(1), 100);

        // Subsequent submitPair reverts with "CPU not found" because board is completed
        bytes32[] memory proof0 = _getProofMemory(0);
        vm.expectRevert("CPU not found");
        gridManager.submitPair(1, 0, 0, 1000, proof0);
        vm.stopPrank();
    }

    function test_MerkleProof_KnownTestVector() public {
        // Test a known 2-pair custom tree
        bytes32 h0 = keccak256(abi.encode(uint256(111), uint256(222)));
        bytes32 h1 = keccak256(abi.encode(uint256(333), uint256(444)));
        bytes32 l0 = keccak256(abi.encode(uint16(0), h0));
        bytes32 l1 = keccak256(abi.encode(uint16(1), h1));
        bytes32 expectedParent01 = _hashPair(l0, l1);

        bytes32[676] memory customHashes;
        customHashes[0] = h0;
        customHashes[1] = h1;

        bytes32 root;
        bytes32[2048] memory tree;
        (root, tree) = buildTree(customHashes);
        bytes32[] memory proof0 = getProofFromTree(tree, 0);

        // Verify that l0 combined with proof0[0] gives expectedParent01
        assertEq(proof0[0], l1);
        assertEq(_hashPair(l0, proof0[0]), expectedParent01);

        // Setup invoice 2 with collateral
        uint256 collateral = 10_000 * 1e6;
        usdc.transfer(creator, collateral);
        vm.prank(creator);
        usdc.approve(address(collateralManager), collateral);
        vm.prank(invoiceManager);
        collateralManager.depositInitial(2, address(usdc), creator, collateral);

        // Create board with root and test submitPair
        vm.prank(invoiceManager);
        gridManager.createBoard(2, address(usdc), winningCoords, unitBindings, root);
        vm.prank(cointagManager);
        gridManager.grantAccess(2, hunter);

        vm.prank(hunter);
        gridManager.submitPair(2, 0, 111, 222, proof0);
        assertTrue(gridManager.isUnitClaimed(2, 1));
    }
}
