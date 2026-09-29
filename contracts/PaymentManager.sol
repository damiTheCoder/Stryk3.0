// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IInvoiceManager {
    function getInvoice(uint256 invoiceId) external view returns (
        address creator,
        uint256 amount,
        address stablecoin,
        uint8 status
    );
    function markPaidByPayment(uint256 invoiceId, bytes32 txHash) external;
}

/**
 * @title PaymentManager
 * @notice Handles standard non-tokenized invoice payments routing directly to creator.
 */
contract PaymentManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IInvoiceManager public immutable invoiceManager;
    mapping(uint256 => bool) public isInvoicePaid;

    event InvoicePaid(uint256 indexed invoiceId, address indexed payer, uint256 amount, bytes32 txHash);

    constructor(address admin, address invoiceManager_) {
        require(admin != address(0), "Invalid admin");
        require(invoiceManager_ != address(0), "Invalid invoice manager");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        invoiceManager = IInvoiceManager(invoiceManager_);
    }

    function payInvoice(uint256 invoiceId, uint256 amount) external nonReentrant {
        require(!isInvoicePaid[invoiceId], "Invoice already paid");
        require(amount > 0, "Amount must be > 0");

        (
            address creator,
            uint256 expectedAmount,
            address stablecoin,
            uint8 status
        ) = invoiceManager.getInvoice(invoiceId);

        require(creator != address(0), "Invoice does not exist");
        require(amount == expectedAmount, "Incorrect payment amount");
        require(status == 0 || status == 1, "Invoice not payable");

        isInvoicePaid[invoiceId] = true;

        bytes32 txHash = keccak256(abi.encodePacked(invoiceId, msg.sender, amount, block.timestamp));

        IERC20(stablecoin).safeTransferFrom(msg.sender, creator, amount);
        invoiceManager.markPaidByPayment(invoiceId, txHash);

        emit InvoicePaid(invoiceId, msg.sender, amount, txHash);
    }
}
