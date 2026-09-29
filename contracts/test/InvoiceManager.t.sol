// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {InvoiceManager} from "../InvoiceManager.sol";
import {CollateralManager} from "../CollateralManager.sol";
import {InvoiceNFT} from "../InvoiceNFT.sol";
import {GridManager} from "../GridManager.sol";
import {UnitClaim} from "../UnitClaim.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 10_000_000 * 1e6);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract InvoiceManagerTest is Test {
    InvoiceManager public invoiceManager;
    CollateralManager public collateralManager;
    InvoiceNFT public invoiceNFT;
    GridManager public gridManager;
    UnitClaim public unitClaim;
    MockUSDC public usdc;

    address public admin = address(0xAD);
    address public creator = address(0x333);
    address public stranger = address(0x555);

    uint16[100]  public winningCoords;
    uint8[100]   public unitBindings;
    bytes32[676] public pairHashes;
    bytes32      public merkleRoot;

    event InvoiceTokenized(uint256 indexed invoiceId, address indexed creator);
    event InvoiceStatusChanged(uint256 indexed invoiceId, InvoiceManager.InvoiceStatus newStatus);

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function computeMerkleRoot(bytes32[676] memory hashes) internal pure returns (bytes32) {
        bytes32[1024] memory layer;
        for (uint16 c = 0; c < 676; c++) {
            layer[c] = keccak256(abi.encode(c, hashes[c]));
        }
        uint256 n = 1024;
        while (n > 1) {
            n = n / 2;
            for (uint256 i = 0; i < n; i++) {
                layer[i] = _hashPair(layer[2 * i], layer[2 * i + 1]);
            }
        }
        return layer[0];
    }

    function setUp() public {
        usdc = new MockUSDC();
        collateralManager = new CollateralManager(admin);
        invoiceNFT = new InvoiceNFT(admin);
        unitClaim = new UnitClaim(admin);
        gridManager = new GridManager(admin, address(collateralManager), address(unitClaim));

        invoiceManager = new InvoiceManager(
            admin,
            address(collateralManager),
            address(invoiceNFT),
            address(gridManager),
            0
        );

        vm.startPrank(admin);
        invoiceNFT.grantRole(invoiceNFT.INVOICE_MANAGER(), address(invoiceManager));
        collateralManager.grantRole(collateralManager.INVOICE_MANAGER(), address(invoiceManager));
        collateralManager.grantRole(collateralManager.GRID_MANAGER(), address(gridManager));
        unitClaim.grantRole(unitClaim.GRID_MANAGER(), address(gridManager));
        gridManager.grantRole(gridManager.INVOICE_MANAGER(), address(invoiceManager));
        vm.stopPrank();

        for (uint16 i = 0; i < 100; i++) {
            winningCoords[i] = i;
            unitBindings[i] = uint8(i + 1);
        }
        for (uint16 c = 0; c < 676; c++) {
            pairHashes[c] = keccak256(abi.encode(uint256(c), uint256(c + 1000)));
        }
        merkleRoot = computeMerkleRoot(pairHashes);

        usdc.mint(creator, 50_000 * 1e6);
    }

    function test_TokenizeInvoice_HappyPath() public {
        uint256 amount = 10_000 * 1e6;
        uint64 dueDate = uint64(block.timestamp + 30 days);
        bytes32 debtorRef = keccak256("debtor_acme_corp");
        string memory uri = "ipfs://QmTokenize";

        vm.startPrank(creator);
        usdc.approve(address(collateralManager), amount);

        vm.expectEmit(true, true, false, false);
        emit InvoiceTokenized(1, creator);
        vm.expectEmit(true, false, false, true);
        emit InvoiceStatusChanged(1, InvoiceManager.InvoiceStatus.ACTIVE);

        uint256 invoiceId = invoiceManager.tokenizeInvoice(
            amount,
            address(usdc),
            dueDate,
            debtorRef,
            uri,
            winningCoords,
            unitBindings,
            merkleRoot
        );
        vm.stopPrank();

        assertEq(invoiceId, 1);

        // Check collateral pool locked and funded
        (
            ,
            ,
            uint256 initialCollateral,
            ,
            ,
            ,
            uint256 unitsClaimed,
            bool locked
        ) = collateralManager.pools(invoiceId);
        assertTrue(locked);
        assertEq(initialCollateral, amount);
        assertEq(unitsClaimed, 0);

        // Check NFT minted
        assertEq(invoiceNFT.ownerOf(invoiceId), creator);

        // Check board created in GridManager
        assertEq(gridManager.getBoardUnitsClaimed(invoiceId), 0);
        assertFalse(gridManager.isCompleted(invoiceId));
        assertEq(gridManager.getMerkleRoot(invoiceId), merkleRoot);

        // Check InvoiceManager record
        InvoiceManager.InvoiceRecord memory record = invoiceManager.getInvoice(invoiceId);
        assertEq(record.id, 1);
        assertEq(record.creator, creator);
        assertEq(record.amount, amount);
        assertEq(record.stablecoin, address(usdc));
        assertEq(record.dueDate, dueDate);
        assertEq(record.debtorRef, debtorRef);
        assertEq(record.metadataURI, uri);
        assertEq(uint8(record.status), uint8(InvoiceManager.InvoiceStatus.ACTIVE));

        assertEq(invoiceManager.getInvoiceCreator(invoiceId), creator);
        assertEq(invoiceManager.getInvoiceStablecoin(invoiceId), address(usdc));
    }

    function test_TokenizeInvoice_RevertsOnInvalidParameters() public {
        uint256 amount = 10_000 * 1e6;
        uint64 dueDate = uint64(block.timestamp + 30 days);

        vm.startPrank(creator);
        usdc.approve(address(collateralManager), amount * 10);

        // Zero amount
        vm.expectRevert("INVALID_AMOUNT");
        invoiceManager.tokenizeInvoice(
            0,
            address(usdc),
            dueDate,
            bytes32(0),
            "uri",
            winningCoords,
            unitBindings,
            merkleRoot
        );

        // Zero token
        vm.expectRevert("INVALID_TOKEN");
        invoiceManager.tokenizeInvoice(
            amount,
            address(0),
            dueDate,
            bytes32(0),
            "uri",
            winningCoords,
            unitBindings,
            merkleRoot
        );

        // Past or current due date
        vm.expectRevert("INVALID_DUE_DATE");
        invoiceManager.tokenizeInvoice(
            amount,
            address(usdc),
            uint64(block.timestamp),
            bytes32(0),
            "uri",
            winningCoords,
            unitBindings,
            merkleRoot
        );
        vm.stopPrank();
    }

    function test_TokenizeInvoice_SkipsExistingIds() public {
        InvoiceManager offsetManager = new InvoiceManager(
            admin,
            address(collateralManager),
            address(invoiceNFT),
            address(gridManager),
            100
        );

        vm.startPrank(admin);
        invoiceNFT.grantRole(invoiceNFT.INVOICE_MANAGER(), address(offsetManager));
        collateralManager.grantRole(collateralManager.INVOICE_MANAGER(), address(offsetManager));
        gridManager.grantRole(gridManager.INVOICE_MANAGER(), address(offsetManager));
        vm.stopPrank();

        uint256 amount = 1_000 * 1e6;
        uint64 dueDate = uint64(block.timestamp + 30 days);

        vm.startPrank(creator);
        usdc.approve(address(collateralManager), amount);
        uint256 invoiceId = offsetManager.tokenizeInvoice(
            amount,
            address(usdc),
            dueDate,
            bytes32(0),
            "ipfs://QmSkip",
            winningCoords,
            unitBindings,
            merkleRoot
        );
        vm.stopPrank();

        assertEq(invoiceId, 101);
    }
}
