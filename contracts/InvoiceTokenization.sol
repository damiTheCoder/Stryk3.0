// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IInvoiceTokenization {
    function usdcToken() external view returns (IERC20);
}

contract InvoiceToken is ERC20 {
    using SafeERC20 for IERC20;

    uint256 public immutable invoiceId;
    address public immutable originalVendor;
    uint256 public immutable amount;
    address public immutable invoiceContract;

    address private _currentHolder;

    event InvoiceRedeemed(
        uint256 indexed invoiceId,
        address indexed payer,
        address indexed tokenHolder,
        uint256 usdcAmount
    );

    modifier onlyInvoiceContract() {
        require(msg.sender == invoiceContract, "Only invoice contract");
        _;
    }

    constructor(
        uint256 invoiceId_,
        address originalVendor_,
        uint256 amount_,
        address invoiceContract_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {
        require(originalVendor_ != address(0), "Invalid vendor");
        require(invoiceContract_ != address(0), "Invalid invoice contract");

        invoiceId = invoiceId_;
        originalVendor = originalVendor_;
        amount = amount_;
        invoiceContract = invoiceContract_;

        _mint(invoiceContract_, 1);
    }

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function currentHolder() public view returns (address) {
        return _currentHolder;
    }

    function redeemPayment(address payer, uint256 usdcAmount) external onlyInvoiceContract {
        address holder = _currentHolder;
        require(holder != address(0), "No token holder");

        IERC20 usdc = IInvoiceTokenization(invoiceContract).usdcToken();
        usdc.safeTransferFrom(payer, holder, usdcAmount);

        emit InvoiceRedeemed(invoiceId, payer, holder, usdcAmount);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        if (value == 1 && to != address(0)) {
            _currentHolder = to;
        }
    }
}

contract InvoiceTokenization is Ownable {
    using SafeERC20 for IERC20;

    enum InvoiceStatus {
        Pending,
        Paid,
        Tokenized,
        Cancelled
    }

    struct Invoice {
        uint256 id;
        address vendor;
        address client;
        uint256 amount;
        string description;
        uint256 dueDate;
        InvoiceStatus status;
        address tokenContract;
    }

    mapping(uint256 => Invoice) private _invoices;
    mapping(address => uint256[]) private _vendorInvoices;
    mapping(address => uint256[]) private _clientInvoices;

    uint256 private _invoiceCounter;

    IERC20 public immutable usdcToken;

    event InvoiceCreated(
        uint256 indexed id,
        address indexed vendor,
        address indexed client,
        uint256 amount,
        uint256 dueDate
    );
    event InvoicePaid(uint256 indexed id, address indexed payer, uint256 amount);
    event InvoiceTokenized(uint256 indexed id, address tokenContract);
    event InvoiceCancelled(uint256 indexed id);

    constructor(address usdcAddress, address initialOwner) Ownable(initialOwner) {
        require(usdcAddress != address(0), "Invalid USDC address");

        usdcToken = IERC20(usdcAddress);
    }

    function createInvoice(
        address client,
        uint256 amount,
        string calldata description,
        uint256 dueDate
    ) external returns (uint256 invoiceId) {
        require(client != address(0), "Invalid client");
        require(amount > 0, "Amount must be > 0");
        require(dueDate > block.timestamp, "Due date must be future");

        invoiceId = ++_invoiceCounter;

        _invoices[invoiceId] = Invoice({
            id: invoiceId,
            vendor: msg.sender,
            client: client,
            amount: amount,
            description: description,
            dueDate: dueDate,
            status: InvoiceStatus.Pending,
            tokenContract: address(0)
        });

        _vendorInvoices[msg.sender].push(invoiceId);
        _clientInvoices[client].push(invoiceId);

        emit InvoiceCreated(invoiceId, msg.sender, client, amount, dueDate);
    }

    function payInvoice(uint256 invoiceId) external {
        Invoice storage invoice = _invoices[invoiceId];
        require(invoice.id != 0, "Invoice not found");
        require(
            invoice.status == InvoiceStatus.Pending || invoice.status == InvoiceStatus.Tokenized,
            "Invoice not payable"
        );

        invoice.status = InvoiceStatus.Paid;

        if (invoice.tokenContract == address(0)) {
            usdcToken.safeTransferFrom(msg.sender, invoice.vendor, invoice.amount);
        } else {
            InvoiceToken(invoice.tokenContract).redeemPayment(msg.sender, invoice.amount);
        }

        emit InvoicePaid(invoiceId, msg.sender, invoice.amount);
    }

    function tokenizeInvoice(uint256 invoiceId) external {
        Invoice storage invoice = _invoices[invoiceId];
        require(invoice.id != 0, "Invoice not found");
        require(msg.sender == invoice.vendor, "Only vendor");
        require(invoice.status == InvoiceStatus.Pending, "Invoice not pending");
        require(block.timestamp > invoice.dueDate, "Invoice not overdue");

        string memory tokenName = string.concat("Invoice Receivable #", Strings.toString(invoiceId));
        string memory tokenSymbol = string.concat("INV", Strings.toString(invoiceId));

        InvoiceToken token = new InvoiceToken(
            invoiceId,
            invoice.vendor,
            invoice.amount,
            address(this),
            tokenName,
            tokenSymbol
        );

        token.transfer(invoice.vendor, 1);

        invoice.status = InvoiceStatus.Tokenized;
        invoice.tokenContract = address(token);

        emit InvoiceTokenized(invoiceId, address(token));
    }

    function cancelInvoice(uint256 invoiceId) external {
        Invoice storage invoice = _invoices[invoiceId];
        require(invoice.id != 0, "Invoice not found");
        require(msg.sender == invoice.vendor, "Only vendor");
        require(invoice.status == InvoiceStatus.Pending, "Invoice not pending");

        invoice.status = InvoiceStatus.Cancelled;

        emit InvoiceCancelled(invoiceId);
    }

    function getInvoice(uint256 invoiceId) external view returns (Invoice memory) {
        return _invoices[invoiceId];
    }

    function getVendorInvoices(address vendor) external view returns (uint256[] memory) {
        return _vendorInvoices[vendor];
    }

    function getClientInvoices(address client) external view returns (uint256[] memory) {
        return _clientInvoices[client];
    }
}
