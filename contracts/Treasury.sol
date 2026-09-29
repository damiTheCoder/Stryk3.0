// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Treasury
 * @notice Isolated platform revenue vault. No reference to CollateralManager.
 */
contract Treasury is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant COINTAG_MANAGER = keccak256("COINTAG_MANAGER");
    bytes32 public constant TREASURY_MANAGER = keccak256("TREASURY_MANAGER");
    bytes32 public constant SWEEP_ROLE = keccak256("SWEEP_ROLE");

    address public platformRecipient;
    mapping(address => uint256) public totalRevenueCollected;

    event RevenueReceived(address indexed stablecoin, uint256 amount);
    event WithdrawalExecuted(address indexed stablecoin, address indexed to, uint256 amount);
    event DustSwept(address indexed stablecoin, uint256 indexed invoiceId, uint256 amount);

    constructor(address admin, address platformRecipient_) {
        require(admin != address(0), "Invalid admin");
        require(platformRecipient_ != address(0), "Invalid platform recipient");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        platformRecipient = platformRecipient_;
    }

    function receiveRevenue(address stablecoin, uint256 amount)
        external
        nonReentrant
        onlyRole(COINTAG_MANAGER)
    {
        require(stablecoin != address(0), "Invalid stablecoin");
        require(amount > 0, "Amount must be > 0");

        totalRevenueCollected[stablecoin] += amount;
        IERC20(stablecoin).safeTransferFrom(msg.sender, address(this), amount);

        emit RevenueReceived(stablecoin, amount);
    }

    function withdraw(address stablecoin, address to, uint256 amount)
        external
        nonReentrant
        onlyRole(TREASURY_MANAGER)
    {
        require(stablecoin != address(0), "Invalid stablecoin");
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");

        IERC20(stablecoin).safeTransfer(to, amount);

        emit WithdrawalExecuted(stablecoin, to, amount);
    }

    function sweepDust(address stablecoin, uint256 invoiceId)
        external
        nonReentrant
        onlyRole(SWEEP_ROLE)
    {
        require(stablecoin != address(0), "Invalid stablecoin");
        uint256 balance = IERC20(stablecoin).balanceOf(address(this));
        require(balance > 0, "No dust to sweep");

        IERC20(stablecoin).safeTransfer(platformRecipient, balance);

        emit DustSwept(stablecoin, invoiceId, balance);
    }
}
