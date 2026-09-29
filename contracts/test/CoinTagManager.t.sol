// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CoinTagManager} from "../CoinTagManager.sol";
import {Treasury} from "../Treasury.sol";
import {CollateralManager} from "../CollateralManager.sol";
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

contract MockInvoiceManagerView {
    mapping(uint256 => address) public creators;
    mapping(uint256 => address) public stablecoins;

    function setInvoice(uint256 invoiceId, address creator, address token) external {
        creators[invoiceId] = creator;
        stablecoins[invoiceId] = token;
    }

    function getInvoiceCreator(uint256 invoiceId) external view returns (address) {
        return creators[invoiceId];
    }

    function getInvoiceStablecoin(uint256 invoiceId) external view returns (address) {
        return stablecoins[invoiceId];
    }
}

contract CoinTagManagerTest is Test {
    CoinTagManager public coinTagManager;
    Treasury public treasury;
    CollateralManager public collateralManager;
    GridManager public gridManager;
    UnitClaim public unitClaim;
    MockInvoiceManagerView public mockInvoiceManager;
    MockUSDC public usdc;

    address public admin = address(0xAD);
    address public platformRecipient = address(0xCAFE);
    address public creator = address(0x333);
    address public buyer = address(0x444);
    address public stranger = address(0x555);

    uint256 public constant GLOBAL_PRICE = 100 * 1e6; // 100 USDC

    event CoinTagPurchased(
        uint256 indexed invoiceId,
        address indexed buyer,
        uint256 amount,
        uint256 creatorAmount,
        uint256 collateralAmount,
        uint256 platformAmount
    );

    function setUp() public {
        usdc = new MockUSDC();
        treasury = new Treasury(admin, platformRecipient);
        collateralManager = new CollateralManager(admin);
        unitClaim = new UnitClaim(admin);
        gridManager = new GridManager(admin, address(collateralManager), address(unitClaim));
        mockInvoiceManager = new MockInvoiceManagerView();

        coinTagManager = new CoinTagManager(
            admin,
            address(collateralManager),
            address(treasury),
            address(gridManager),
            address(mockInvoiceManager)
        );

        vm.startPrank(admin);
        // Roles for CoinTagManager
        treasury.grantRole(treasury.COINTAG_MANAGER(), address(coinTagManager));
        collateralManager.grantRole(collateralManager.COINTAG_MANAGER(), address(coinTagManager));
        collateralManager.grantRole(collateralManager.INVOICE_MANAGER(), address(this));
        gridManager.grantRole(gridManager.COINTAG_MANAGER(), address(coinTagManager));
        gridManager.grantRole(gridManager.INVOICE_MANAGER(), address(this));

        // CoinTagManager config
        coinTagManager.setAllowlistedStablecoin(address(usdc), true);
        coinTagManager.setGlobalCoinTagPrice(GLOBAL_PRICE);
        vm.stopPrank();

        // Setup invoice 1
        mockInvoiceManager.setInvoice(1, creator, address(usdc));
        // Initialize pool in CollateralManager
        usdc.mint(creator, 10_000 * 1e6);
        vm.prank(creator);
        usdc.approve(address(collateralManager), 10_000 * 1e6);
        collateralManager.depositInitial(1, address(usdc), creator, 10_000 * 1e6);

        // Create board for invoice 1
        uint16[100] memory winners;
        uint8[100]  memory bindings;

        for (uint256 i = 0; i < 100; i++) {
            winners[i] = uint16(i);
            bindings[i] = uint8(i + 1);
        }

        gridManager.createBoard(1, address(usdc), winners, bindings, bytes32(uint256(1)));

        // Fund buyer
        usdc.mint(buyer, 1_000 * 1e6);
    }

    function test_PurchaseCoinTag_HappyPath() public {
        vm.startPrank(buyer);
        usdc.approve(address(coinTagManager), GLOBAL_PRICE);

        vm.expectEmit(true, true, false, true);
        emit CoinTagPurchased(1, buyer, GLOBAL_PRICE, 70 * 1e6, 15 * 1e6, 15 * 1e6);

        coinTagManager.purchaseCoinTag(1, address(usdc), GLOBAL_PRICE);
        vm.stopPrank();

        assertEq(usdc.balanceOf(creator), 70 * 1e6);
        assertEq(treasury.totalRevenueCollected(address(usdc)), 15 * 1e6);
        assertEq(usdc.balanceOf(address(treasury)), 15 * 1e6);
        assertEq(usdc.balanceOf(address(collateralManager)), (10_000 + 15) * 1e6);

        (,,,, uint256 totalCollateral,,,) = collateralManager.pools(1);
        assertEq(totalCollateral, (10_000 + 15) * 1e6);

        assertTrue(gridManager.hasAccess(buyer, 1));
        assertTrue(coinTagManager.hasAccess(buyer, 1));
    }

    function test_PurchaseCoinTag_Overload_HappyPath() public {
        vm.startPrank(buyer);
        usdc.approve(address(coinTagManager), GLOBAL_PRICE);
        coinTagManager.purchaseCoinTag(1, GLOBAL_PRICE);
        vm.stopPrank();

        assertEq(usdc.balanceOf(creator), 70 * 1e6);
        assertEq(treasury.totalRevenueCollected(address(usdc)), 15 * 1e6);
        assertTrue(gridManager.hasAccess(buyer, 1));
    }

    function test_PurchaseCoinTag_RoundingRemainderAbsorbedByPlatform() public {
        uint256 oddAmount = 101; // not cleanly divisible by 100
        // creator: 101 * 70 / 100 = 70
        // collateral: 101 * 15 / 100 = 15
        // platform: 101 - 70 - 15 = 16 (absorbs remainder)

        vm.prank(admin);
        coinTagManager.setCustomCoinTagPrice(1, oddAmount);

        vm.startPrank(buyer);
        usdc.approve(address(coinTagManager), oddAmount);

        vm.expectEmit(true, true, false, true);
        emit CoinTagPurchased(1, buyer, oddAmount, 70, 15, 16);

        coinTagManager.purchaseCoinTag(1, address(usdc), oddAmount);
        vm.stopPrank();

        assertEq(usdc.balanceOf(creator), 70);
        assertEq(treasury.totalRevenueCollected(address(usdc)), 16);
    }

    function test_PurchaseCoinTag_CustomPriceOverridesGlobal() public {
        uint256 customPrice = 50 * 1e6;
        vm.prank(admin);
        coinTagManager.setCustomCoinTagPrice(1, customPrice);

        vm.startPrank(buyer);
        usdc.approve(address(coinTagManager), GLOBAL_PRICE);

        // Global price fails with WRONG_AMOUNT
        vm.expectRevert("WRONG_AMOUNT");
        coinTagManager.purchaseCoinTag(1, address(usdc), GLOBAL_PRICE);

        // Custom price succeeds
        coinTagManager.purchaseCoinTag(1, address(usdc), customPrice);
        vm.stopPrank();

        assertEq(usdc.balanceOf(creator), 35 * 1e6);
        assertTrue(gridManager.hasAccess(buyer, 1));
    }

    function test_PurchaseCoinTag_RevertsOnNonAllowlistedStablecoin() public {
        MockUSDC randomToken = new MockUSDC();
        randomToken.mint(buyer, 100 * 1e6);

        vm.startPrank(buyer);
        randomToken.approve(address(coinTagManager), GLOBAL_PRICE);
        vm.expectRevert("TOKEN_NOT_ALLOWED");
        coinTagManager.purchaseCoinTag(1, address(randomToken), GLOBAL_PRICE);
        vm.stopPrank();
    }

    function test_PurchaseCoinTag_RevertsWhenPriceNotSet() public {
        vm.prank(admin);
        coinTagManager.setGlobalCoinTagPrice(0);

        vm.startPrank(buyer);
        usdc.approve(address(coinTagManager), GLOBAL_PRICE);
        vm.expectRevert("PRICE_NOT_SET");
        coinTagManager.purchaseCoinTag(1, address(usdc), GLOBAL_PRICE);
        vm.stopPrank();
    }

    function test_PurchaseCoinTag_RevertsOnWrongAmount() public {
        vm.startPrank(buyer);
        usdc.approve(address(coinTagManager), GLOBAL_PRICE);
        vm.expectRevert("WRONG_AMOUNT");
        coinTagManager.purchaseCoinTag(1, address(usdc), GLOBAL_PRICE - 1);
        vm.stopPrank();
    }

    function test_PurchaseCoinTag_RevertsOnNoInvoice() public {
        // Invoice 999 does not exist (creator is address(0))
        vm.startPrank(buyer);
        usdc.approve(address(coinTagManager), GLOBAL_PRICE);
        vm.expectRevert("NO_INVOICE");
        coinTagManager.purchaseCoinTag(999, address(usdc), GLOBAL_PRICE);
        vm.stopPrank();
    }

    function test_PurchaseCoinTag_RepeatPurchaseDoesNotDoubleCreditAccess() public {
        vm.startPrank(buyer);
        usdc.approve(address(coinTagManager), GLOBAL_PRICE * 2);

        coinTagManager.purchaseCoinTag(1, address(usdc), GLOBAL_PRICE);
        assertTrue(gridManager.hasAccess(buyer, 1));

        // Second purchase
        coinTagManager.purchaseCoinTag(1, address(usdc), GLOBAL_PRICE);
        assertTrue(gridManager.hasAccess(buyer, 1));
        vm.stopPrank();

        assertEq(usdc.balanceOf(creator), 140 * 1e6);
        assertEq(treasury.totalRevenueCollected(address(usdc)), 30 * 1e6);
    }

    function test_AdminRoleGuards() public {
        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                coinTagManager.DEFAULT_ADMIN_ROLE()
            )
        );
        coinTagManager.setAllowlistedStablecoin(address(usdc), false);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                coinTagManager.DEFAULT_ADMIN_ROLE()
            )
        );
        coinTagManager.setGlobalCoinTagPrice(50 * 1e6);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                coinTagManager.DEFAULT_ADMIN_ROLE()
            )
        );
        coinTagManager.setCustomCoinTagPrice(1, 50 * 1e6);
        vm.stopPrank();
    }
}
