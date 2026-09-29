// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {InvoiceNFT} from "../InvoiceNFT.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract InvoiceNFTTest is Test {
    InvoiceNFT public nft;

    address public admin = address(0xAD);
    address public invoiceManager = address(0x111);
    address public transferRole = address(0x222);
    address public creator = address(0x333);
    address public buyer = address(0x444);
    address public user = address(0x555);

    event InvoiceTokenized(uint256 indexed invoiceId, address indexed creator);
    event InvoiceNFTMinted(uint256 indexed invoiceId, address indexed to, string metadataURI);
    event InvoiceNFTTransferred(uint256 indexed invoiceId, address indexed from, address indexed to);

    function setUp() public {
        nft = new InvoiceNFT(admin);

        vm.startPrank(admin);
        nft.grantRole(nft.INVOICE_MANAGER(), invoiceManager);
        nft.grantRole(nft.TRANSFER_ROLE(), transferRole);
        vm.stopPrank();
    }

    function test_Constructor() public {
        assertEq(nft.name(), "Veo Invoice NFT");
        assertEq(nft.symbol(), "VEO-INV");
        assertTrue(nft.hasRole(nft.DEFAULT_ADMIN_ROLE(), admin));

        vm.expectRevert("Invalid admin");
        new InvoiceNFT(address(0));
    }

    function test_MintInvoiceNFT_HappyPath() public {
        uint256 invoiceId = 42;
        string memory uri = "ipfs://QmTest123";

        vm.startPrank(invoiceManager);
        vm.expectEmit(true, true, false, true);
        emit InvoiceTokenized(invoiceId, creator);

        vm.expectEmit(true, true, false, true);
        emit InvoiceNFTMinted(invoiceId, creator, uri);

        uint256 tokenId = nft.mintInvoiceNFT(invoiceId, creator, uri);
        vm.stopPrank();

        assertEq(tokenId, invoiceId);
        assertEq(nft.ownerOf(tokenId), creator);
        assertEq(nft.tokenURI(tokenId), uri);

        InvoiceNFT.InvoiceNFTData memory data = nft.getInvoiceNFTData(tokenId);
        assertEq(data.invoiceId, invoiceId);
        assertEq(data.creator, creator);
        assertEq(data.totalUnits, 100);
        assertEq(uint8(data.status), uint8(InvoiceNFT.InvoiceStatus.TOKENIZED));
    }

    function test_MintInvoiceNFT_AccessControl() public {
        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                nft.INVOICE_MANAGER()
            )
        );
        nft.mintInvoiceNFT(1, creator, "uri");
        vm.stopPrank();
    }

    function test_MintInvoiceNFT_EdgeCases() public {
        vm.startPrank(invoiceManager);

        vm.expectRevert("Invalid invoice ID");
        nft.mintInvoiceNFT(0, creator, "uri");

        vm.expectRevert("Invalid creator");
        nft.mintInvoiceNFT(1, address(0), "uri");

        nft.mintInvoiceNFT(1, creator, "uri");

        // Double mint same invoice ID must revert
        vm.expectRevert();
        nft.mintInvoiceNFT(1, creator, "uri");
        vm.stopPrank();
    }

    function test_SoulboundByDefault() public {
        uint256 invoiceId = 10;
        vm.prank(invoiceManager);
        nft.mintInvoiceNFT(invoiceId, creator, "uri");

        vm.startPrank(creator);
        vm.expectRevert("NFT is soulbound");
        nft.transferFrom(creator, buyer, invoiceId);
        vm.stopPrank();
    }

    function test_TransferableWhenEnabled() public {
        uint256 invoiceId = 10;
        vm.prank(invoiceManager);
        nft.mintInvoiceNFT(invoiceId, creator, "uri");

        // Enable transfer by TRANSFER_ROLE
        vm.prank(transferRole);
        nft.setTransferable(invoiceId, true);
        assertTrue(nft.isTransferable(invoiceId));

        vm.startPrank(creator);
        vm.expectEmit(true, true, true, true);
        emit InvoiceNFTTransferred(invoiceId, creator, buyer);

        nft.transferFrom(creator, buyer, invoiceId);
        vm.stopPrank();

        assertEq(nft.ownerOf(invoiceId), buyer);
    }

    function test_SetTransferable_AccessControl() public {
        uint256 invoiceId = 10;
        vm.prank(invoiceManager);
        nft.mintInvoiceNFT(invoiceId, creator, "uri");

        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                nft.TRANSFER_ROLE()
            )
        );
        nft.setTransferable(invoiceId, true);
        vm.stopPrank();
    }

    function test_SetCollateralPool_OnceOnly() public {
        uint256 invoiceId = 77;
        address pool = address(0x777);

        vm.startPrank(invoiceManager);
        nft.mintInvoiceNFT(invoiceId, creator, "uri");

        nft.setCollateralPool(invoiceId, pool);
        assertEq(nft.getInvoiceNFTData(invoiceId).collateralPool, pool);

        // Setting a second time must revert
        vm.expectRevert("Collateral pool already set");
        nft.setCollateralPool(invoiceId, address(0x888));

        // Setting address 0 must revert
        vm.expectRevert("Collateral pool already set");
        nft.setCollateralPool(invoiceId, address(0));
        vm.stopPrank();
    }

    function test_SetGridBoard_OnceOnly() public {
        uint256 invoiceId = 88;
        address board = address(0x888);

        vm.startPrank(invoiceManager);
        nft.mintInvoiceNFT(invoiceId, creator, "uri");

        nft.setGridBoard(invoiceId, board);
        assertEq(nft.getInvoiceNFTData(invoiceId).gridBoard, board);

        // Setting a second time must revert
        vm.expectRevert("Grid board already set");
        nft.setGridBoard(invoiceId, address(0x999));
        vm.stopPrank();
    }
}
