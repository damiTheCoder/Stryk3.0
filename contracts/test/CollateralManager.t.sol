// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CollateralManager} from "../CollateralManager.sol";
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

contract CollateralManagerTest is Test {
    CollateralManager public manager;
    MockUSDC public usdc;

    address public admin = address(0xAD);
    address public invoiceManager = address(0x101);
    address public cointagManager = address(0x102);
    address public gridManager = address(0x103);
    address public sweepRole = address(0x104);
    address public creator = address(0x201);
    address public claimer = address(0x301);
    address public user = address(0x401);

    event CollateralDeposited(uint256 indexed invoiceId, address indexed creator, uint256 amount);
    event CollateralIncreased(uint256 indexed invoiceId, uint256 amount, uint256 newTotal);
    event ClaimPaid(uint256 indexed invoiceId, uint8 unitId, address indexed recipient, uint256 amount);
    event DustSwept(uint256 indexed invoiceId, uint256 amount);

    function setUp() public {
        usdc = new MockUSDC();
        manager = new CollateralManager(admin);

        vm.startPrank(admin);
        manager.grantRole(manager.INVOICE_MANAGER(), invoiceManager);
        manager.grantRole(manager.COINTAG_MANAGER(), cointagManager);
        manager.grantRole(manager.GRID_MANAGER(), gridManager);
        manager.grantRole(manager.SWEEP_ROLE(), sweepRole);
        vm.stopPrank();

        usdc.mint(creator, 1_000_000 * 1e6);
        usdc.mint(cointagManager, 100_000 * 1e6);
    }

    function test_Constructor() public {
        assertTrue(manager.hasRole(manager.DEFAULT_ADMIN_ROLE(), admin));

        vm.expectRevert("Invalid admin");
        new CollateralManager(address(0));
    }

    function test_DepositInitial_HappyPath() public {
        uint256 invoiceId = 1;
        uint256 amount = 10_000 * 1e6;

        vm.prank(creator);
        usdc.approve(address(manager), amount);

        vm.startPrank(invoiceManager);
        vm.expectEmit(true, true, false, true);
        emit CollateralDeposited(invoiceId, creator, amount);

        manager.depositInitial(invoiceId, address(usdc), creator, amount);
        vm.stopPrank();

        assertEq(manager.totalCollateral(invoiceId), amount);
        assertEq(usdc.balanceOf(address(manager)), amount);

        (
            uint256 id,
            address token,
            uint256 initialCollateral,
            uint256 coinTagContrib,
            uint256 totalCollateral,
            uint256 paidOut,
            uint256 unitsClaimed,
            bool locked
        ) = manager.pools(invoiceId);

        assertEq(id, invoiceId);
        assertEq(token, address(usdc));
        assertEq(initialCollateral, amount);
        assertEq(coinTagContrib, 0);
        assertEq(totalCollateral, amount);
        assertEq(paidOut, 0);
        assertEq(unitsClaimed, 0);
        assertTrue(locked);
    }

    function test_DepositInitial_AccessControl() public {
        vm.prank(creator);
        usdc.approve(address(manager), 1_000);

        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                manager.INVOICE_MANAGER()
            )
        );
        manager.depositInitial(1, address(usdc), creator, 1_000);
        vm.stopPrank();
    }

    function test_DepositInitial_EdgeCases() public {
        vm.startPrank(invoiceManager);

        vm.expectRevert("Invalid invoice ID");
        manager.depositInitial(0, address(usdc), creator, 1_000);

        vm.expectRevert("Invalid stablecoin");
        manager.depositInitial(1, address(0), creator, 1_000);

        vm.expectRevert("Invalid creator");
        manager.depositInitial(1, address(usdc), address(0), 1_000);

        vm.expectRevert("Amount must be > 0");
        manager.depositInitial(1, address(usdc), creator, 0);

        // First deposit succeeds
        vm.stopPrank();
        vm.prank(creator);
        usdc.approve(address(manager), 10_000);

        vm.prank(invoiceManager);
        manager.depositInitial(1, address(usdc), creator, 10_000);

        // Double deposit must revert
        vm.prank(invoiceManager);
        vm.expectRevert("Pool already initialized");
        manager.depositInitial(1, address(usdc), creator, 10_000);
    }

    function test_Contribute_HappyPath() public {
        uint256 invoiceId = 2;
        uint256 initialAmount = 10_000 * 1e6;
        uint256 contribution = 150 * 1e6;

        vm.prank(creator);
        usdc.approve(address(manager), initialAmount);
        vm.prank(invoiceManager);
        manager.depositInitial(invoiceId, address(usdc), creator, initialAmount);

        vm.startPrank(cointagManager);
        usdc.approve(address(manager), contribution);

        vm.expectEmit(true, false, false, true);
        emit CollateralIncreased(invoiceId, contribution, initialAmount + contribution);

        manager.contribute(invoiceId, contribution);
        vm.stopPrank();

        assertEq(manager.totalCollateral(invoiceId), initialAmount + contribution);
        assertEq(usdc.balanceOf(address(manager)), initialAmount + contribution);
    }

    function test_Contribute_AccessControl() public {
        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                manager.COINTAG_MANAGER()
            )
        );
        manager.contribute(1, 100);
        vm.stopPrank();
    }

    function test_Contribute_EdgeCases() public {
        vm.startPrank(cointagManager);

        vm.expectRevert("Pool not initialized");
        manager.contribute(999, 100);

        // Initialize pool then zero amount
        vm.stopPrank();
        vm.prank(creator);
        usdc.approve(address(manager), 1_000);
        vm.prank(invoiceManager);
        manager.depositInitial(5, address(usdc), creator, 1_000);

        vm.prank(cointagManager);
        vm.expectRevert("Amount must be > 0");
        manager.contribute(5, 0);
    }

    function test_PayoutClaim_HappyPath() public {
        uint256 invoiceId = 3;
        uint256 total = 10_000 * 1e6;
        uint256 expectedPayout = total / 100; // 100 USDC

        vm.prank(creator);
        usdc.approve(address(manager), total);
        vm.prank(invoiceManager);
        manager.depositInitial(invoiceId, address(usdc), creator, total);

        vm.startPrank(gridManager);
        vm.expectEmit(true, false, true, true);
        emit ClaimPaid(invoiceId, 1, claimer, expectedPayout);

        uint256 payout = manager.payoutClaim(invoiceId, claimer);
        vm.stopPrank();

        assertEq(payout, expectedPayout);
        assertEq(usdc.balanceOf(claimer), expectedPayout);
        assertEq(usdc.balanceOf(address(manager)), total - expectedPayout);
    }

    function test_PayoutClaim_AccessControl() public {
        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                manager.GRID_MANAGER()
            )
        );
        manager.payoutClaim(1, user);
        vm.stopPrank();
    }

    function test_SweepDust_HappyPath() public {
        uint256 invoiceId = 4;
        // Total collateral not cleanly divisible by 100: 10_000.45 USDC = 10_000_450_000 wei
        uint256 total = 10_000_450_000;

        vm.prank(creator);
        usdc.approve(address(manager), total);
        vm.prank(invoiceManager);
        manager.depositInitial(invoiceId, address(usdc), creator, total);

        // Execute all 100 claims
        vm.startPrank(gridManager);
        for (uint256 i = 0; i < 100; i++) {
            manager.payoutClaim(invoiceId, claimer);
        }
        vm.stopPrank();

        // 100 claims paid out total/100 each = 10_000_450_000 / 100 = 100_004_500 each * 100 = 10_000_450_000
        // Wait, here 10_000_450_000 % 100 == 0! Let's add 53 wei dust:
        // Let's contribute 53 wei via cointagManager:
        vm.startPrank(cointagManager);
        usdc.mint(cointagManager, 53);
        usdc.approve(address(manager), 53);
        manager.contribute(invoiceId, 53);
        vm.stopPrank();

        // Now totalCollateral increased by 53, paidOut remains from previous 100 claims, so remaining dust == 53
        address treasuryRecipient = address(0xCAFE);

        vm.startPrank(sweepRole);
        vm.expectEmit(true, false, false, true);
        emit DustSwept(invoiceId, 53);

        manager.sweepDust(invoiceId, treasuryRecipient);
        vm.stopPrank();

        assertEq(usdc.balanceOf(treasuryRecipient), 53);
        assertEq(usdc.balanceOf(address(manager)), 0);
    }

    function test_SweepDust_RevertsBeforeAllUnitsClaimed() public {
        uint256 invoiceId = 6;
        uint256 total = 1_000 * 1e6;

        vm.prank(creator);
        usdc.approve(address(manager), total);
        vm.prank(invoiceManager);
        manager.depositInitial(invoiceId, address(usdc), creator, total);

        vm.prank(gridManager);
        manager.payoutClaim(invoiceId, claimer); // only 1 unit claimed

        vm.startPrank(sweepRole);
        vm.expectRevert("Game not completed");
        manager.sweepDust(invoiceId, address(0xCAFE));
        vm.stopPrank();
    }
}
