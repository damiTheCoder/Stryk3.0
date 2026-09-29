// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICollateralManager {
    function contribute(uint256 invoiceId, uint256 amount) external;
}

interface ITreasury {
    function receiveRevenue(address stablecoin, uint256 amount) external;
}

interface IGridManagerAccess {
    function grantAccess(uint256 invoiceId, address user) external;
    function hasAccess(address user, uint256 invoiceId) external view returns (bool);
}

interface IInvoiceManagerView {
    function getInvoiceCreator(uint256 invoiceId) external view returns (address);
    function getInvoiceStablecoin(uint256 invoiceId) external view returns (address);
}

/**
 * @title CoinTagManager
 * @notice Sells CoinTags (access fees). Enforces 70/15/15 split. Grants board access.
 */
contract CoinTagManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ICollateralManager  public immutable collateralManager;
    ITreasury           public immutable treasury;
    IGridManagerAccess  public immutable gridManager;
    IInvoiceManagerView public immutable invoiceManager;

    mapping(address => bool) public allowlistedStablecoins;
    uint256 public globalCointagPrice;
    mapping(uint256 => uint256) public customCointagPrice;

    event CoinTagPurchased(
        uint256 indexed invoiceId,
        address indexed buyer,
        uint256 amount,
        uint256 creatorAmount,
        uint256 collateralAmount,
        uint256 platformAmount
    );

    constructor(
        address admin,
        address collateralManager_,
        address treasury_,
        address gridManager_,
        address invoiceManager_
    ) {
        require(admin != address(0), "INVALID_ADMIN");
        require(collateralManager_ != address(0), "INVALID_COLLATERAL_MGR");
        require(treasury_ != address(0), "INVALID_TREASURY");
        require(gridManager_ != address(0), "INVALID_GRID_MGR");
        require(invoiceManager_ != address(0), "INVALID_INVOICE_MGR");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        collateralManager = ICollateralManager(collateralManager_);
        treasury = ITreasury(treasury_);
        gridManager = IGridManagerAccess(gridManager_);
        invoiceManager = IInvoiceManagerView(invoiceManager_);
    }

    function setAllowlistedStablecoin(address token, bool allowed)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(token != address(0), "INVALID_TOKEN");
        allowlistedStablecoins[token] = allowed;
    }

    function setGlobalCoinTagPrice(uint256 price)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        globalCointagPrice = price;
    }

    function setCustomCoinTagPrice(uint256 invoiceId, uint256 price)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        customCointagPrice[invoiceId] = price;
    }

    function purchaseCoinTag(
        uint256 invoiceId,
        address stablecoin,
        uint256 amount
    ) public nonReentrant {
        require(allowlistedStablecoins[stablecoin], "TOKEN_NOT_ALLOWED");

        uint256 requiredPrice = customCointagPrice[invoiceId] > 0
            ? customCointagPrice[invoiceId]
            : globalCointagPrice;
        require(requiredPrice > 0, "PRICE_NOT_SET");
        require(amount == requiredPrice, "WRONG_AMOUNT");

        address creator = invoiceManager.getInvoiceCreator(invoiceId);
        require(creator != address(0), "NO_INVOICE");

        uint256 creatorAmount    = (amount * 70) / 100;
        uint256 collateralAmount = (amount * 15) / 100;
        uint256 platformAmount   = amount - creatorAmount - collateralAmount;
        require(creatorAmount + collateralAmount + platformAmount == amount, "SPLIT_MISMATCH");

        IERC20 token = IERC20(stablecoin);
        token.safeTransferFrom(msg.sender, creator, creatorAmount);
        token.safeTransferFrom(msg.sender, address(this), collateralAmount + platformAmount);

        token.forceApprove(address(collateralManager), collateralAmount);
        collateralManager.contribute(invoiceId, collateralAmount);

        token.forceApprove(address(treasury), platformAmount);
        treasury.receiveRevenue(stablecoin, platformAmount);

        gridManager.grantAccess(invoiceId, msg.sender);

        emit CoinTagPurchased(
            invoiceId,
            msg.sender,
            amount,
            creatorAmount,
            collateralAmount,
            platformAmount
        );
    }

    function purchaseCoinTag(uint256 invoiceId, uint256 amount) external {
        address token = invoiceManager.getInvoiceStablecoin(invoiceId);
        purchaseCoinTag(invoiceId, token, amount);
    }

    function hasAccess(address user, uint256 invoiceId) external view returns (bool) {
        return gridManager.hasAccess(user, invoiceId);
    }
}
