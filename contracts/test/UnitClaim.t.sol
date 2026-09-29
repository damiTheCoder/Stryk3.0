// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {UnitClaim} from "../UnitClaim.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract UnitClaimTest is Test {
    UnitClaim public unitClaim;

    address public admin = address(0xAD);
    address public gridManager = address(0x681);
    address public user = address(0x45E);
    address public claimer = address(0xC1);

    event UnitClaimMinted(
        uint256 indexed tokenId,
        uint256 indexed invoiceId,
        uint8 unitId,
        address indexed holder
    );

    function setUp() public {
        unitClaim = new UnitClaim(admin);
        vm.startPrank(admin);
        unitClaim.grantRole(unitClaim.GRID_MANAGER(), gridManager);
        vm.stopPrank();
    }

    function test_Mint_HappyPath() public {
        uint256 invoiceId = 10;
        uint8 unitId = 1;

        vm.startPrank(gridManager);
        vm.expectEmit(true, true, false, true);
        emit UnitClaimMinted(1, invoiceId, unitId, claimer);

        uint256 tokenId = unitClaim.mint(claimer, invoiceId, unitId);
        vm.stopPrank();

        assertEq(tokenId, 1);
        assertEq(unitClaim.ownerOf(tokenId), claimer);
        assertEq(unitClaim.tokenOf(invoiceId, unitId), tokenId);

        (
            uint256 proofInvoiceId,
            uint8 proofUnitId,
            address proofHolder,
            uint64 proofClaimedAt
        ) = unitClaim.claimProofs(tokenId);

        assertEq(proofInvoiceId, invoiceId);
        assertEq(proofUnitId, unitId);
        assertEq(proofHolder, claimer);
        assertGt(proofClaimedAt, 0);
    }

    function test_Mint_RevertsOnDuplicate() public {
        uint256 invoiceId = 10;
        uint8 unitId = 5;

        vm.startPrank(gridManager);
        unitClaim.mint(claimer, invoiceId, unitId);

        vm.expectRevert("ALREADY_MINTED");
        unitClaim.mint(claimer, invoiceId, unitId);
        vm.stopPrank();
    }

    function test_Mint_RevertsOnInvalidUnitId() public {
        vm.startPrank(gridManager);

        vm.expectRevert("INVALID_UNIT");
        unitClaim.mint(claimer, 1, 0);

        vm.expectRevert("INVALID_UNIT");
        unitClaim.mint(claimer, 1, 101);

        vm.stopPrank();
    }

    function test_Mint_AccessControl() public {
        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                unitClaim.GRID_MANAGER()
            )
        );
        unitClaim.mint(user, 1, 1);
        vm.stopPrank();
    }

    function test_TransfersRevert_Soulbound() public {
        vm.prank(gridManager);
        uint256 tokenId = unitClaim.mint(claimer, 1, 1);

        vm.startPrank(claimer);
        vm.expectRevert("SOULBOUND");
        unitClaim.transferFrom(claimer, user, tokenId);

        vm.expectRevert("SOULBOUND");
        unitClaim.safeTransferFrom(claimer, user, tokenId);

        vm.expectRevert("SOULBOUND");
        unitClaim.safeTransferFrom(claimer, user, tokenId, "");
        vm.stopPrank();
    }
}
