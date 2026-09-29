// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Treasury} from "../Treasury.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {
        _mint(msg.sender, 1_000_000 * 1e6);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TreasuryTest is Test {
    Treasury public treasury;
    MockERC20 public token;

    address public admin = address(0xAD);
    address public platformRecipient = address(0xCAFE);
    address public cointagManager = address(0xC01);
    address public treasuryManager = address(0x78E);
    address public sweepRole = address(0x5EE);
    address public user = address(0x45E);

    event RevenueReceived(address indexed stablecoin, uint256 amount);
    event WithdrawalExecuted(address indexed stablecoin, address indexed to, uint256 amount);
    event DustSwept(address indexed stablecoin, uint256 indexed invoiceId, uint256 amount);

    function setUp() public {
        token = new MockERC20();
        treasury = new Treasury(admin, platformRecipient);

        vm.startPrank(admin);
        treasury.grantRole(treasury.COINTAG_MANAGER(), cointagManager);
        treasury.grantRole(treasury.TREASURY_MANAGER(), treasuryManager);
        treasury.grantRole(treasury.SWEEP_ROLE(), sweepRole);
        vm.stopPrank();

        token.mint(cointagManager, 100_000 * 1e6);
    }

    function test_Constructor() public {
        assertEq(treasury.platformRecipient(), platformRecipient);
        assertTrue(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), admin));

        vm.expectRevert("Invalid admin");
        new Treasury(address(0), platformRecipient);

        vm.expectRevert("Invalid platform recipient");
        new Treasury(admin, address(0));
    }

    function test_ReceiveRevenue_HappyPath() public {
        uint256 amount = 1_500 * 1e6;

        vm.startPrank(cointagManager);
        token.approve(address(treasury), amount);

        vm.expectEmit(true, false, false, true);
        emit RevenueReceived(address(token), amount);

        treasury.receiveRevenue(address(token), amount);
        vm.stopPrank();

        assertEq(treasury.totalRevenueCollected(address(token)), amount);
        assertEq(token.balanceOf(address(treasury)), amount);
    }

    function test_ReceiveRevenue_AccessControl() public {
        uint256 amount = 100 * 1e6;
        vm.startPrank(user);
        token.approve(address(treasury), amount);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                treasury.COINTAG_MANAGER()
            )
        );
        treasury.receiveRevenue(address(token), amount);
        vm.stopPrank();
    }

    function test_ReceiveRevenue_EdgeCases() public {
        vm.startPrank(cointagManager);
        vm.expectRevert("Invalid stablecoin");
        treasury.receiveRevenue(address(0), 100);

        vm.expectRevert("Amount must be > 0");
        treasury.receiveRevenue(address(token), 0);
        vm.stopPrank();
    }

    function test_Withdraw_HappyPath() public {
        uint256 amount = 500 * 1e6;
        token.mint(address(treasury), amount);

        address recipient = address(0x999);

        vm.startPrank(treasuryManager);
        vm.expectEmit(true, true, false, true);
        emit WithdrawalExecuted(address(token), recipient, amount);

        treasury.withdraw(address(token), recipient, amount);
        vm.stopPrank();

        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.balanceOf(address(treasury)), 0);
    }

    function test_Withdraw_AccessControl() public {
        token.mint(address(treasury), 100 * 1e6);

        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                treasury.TREASURY_MANAGER()
            )
        );
        treasury.withdraw(address(token), user, 100 * 1e6);
        vm.stopPrank();
    }

    function test_Withdraw_EdgeCases() public {
        vm.startPrank(treasuryManager);
        vm.expectRevert("Invalid stablecoin");
        treasury.withdraw(address(0), user, 100);

        vm.expectRevert("Invalid recipient");
        treasury.withdraw(address(token), address(0), 100);

        vm.expectRevert("Amount must be > 0");
        treasury.withdraw(address(token), user, 0);
        vm.stopPrank();
    }

    function test_SweepDust_HappyPath() public {
        uint256 dustAmount = 42 * 1e6;
        token.mint(address(treasury), dustAmount);

        vm.startPrank(sweepRole);
        vm.expectEmit(true, true, false, true);
        emit DustSwept(address(token), 101, dustAmount);

        treasury.sweepDust(address(token), 101);
        vm.stopPrank();

        assertEq(token.balanceOf(platformRecipient), dustAmount);
        assertEq(token.balanceOf(address(treasury)), 0);
    }

    function test_SweepDust_AccessControl() public {
        token.mint(address(treasury), 10);

        vm.startPrank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                user,
                treasury.SWEEP_ROLE()
            )
        );
        treasury.sweepDust(address(token), 101);
        vm.stopPrank();
    }

    function test_SweepDust_EdgeCases() public {
        vm.startPrank(sweepRole);
        vm.expectRevert("Invalid stablecoin");
        treasury.sweepDust(address(0), 101);

        vm.expectRevert("No dust to sweep");
        treasury.sweepDust(address(token), 101);
        vm.stopPrank();
    }
}
