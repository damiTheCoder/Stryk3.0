// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PaymentManager, IInvoiceManager} from "../PaymentManager.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000 * 1e6);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockInvoiceManager is IInvoiceManager {
    struct MockInvoice {
        address creator;
        uint256 amount;
        address stablecoin;
        uint8 status;
        bytes32 paidTxHash;
    }

    mapping(uint256 => MockInvoice) public invoices;

    function setInvoice(
        uint256 invoiceId,
        address creator,
        uint256 amount,
        address stablecoin,
        uint8 status
    ) external {
        invoices[invoiceId] = MockInvoice({
            creator: creator,
            amount: amount,
            stablecoin: stablecoin,
            status: status,
            paidTxHash: bytes32(0)
        });
    }

    function getInvoice(uint256 invoiceId) external view returns (
        address creator,
        uint256 amount,
        address stablecoin,
        uint8 status
    ) {
        MockInvoice memory inv = invoices[invoiceId];
        return (inv.creator, inv.amount, inv.stablecoin, inv.status);
    }

    function markPaidByPayment(uint256 invoiceId, bytes32 txHash) external {
        invoices[invoiceId].status = 4; // PAID
        invoices[invoiceId].paidTxHash = txHash;
    }
}

contract PaymentManagerTest is Test {
    PaymentManager public paymentManager;
    MockInvoiceManager public invoiceManager;
    MockUSDC public usdc;

    address public admin = address(0xAD);
    address public creator = address(0xC2);
    address public payer = address(0xFA);

    event InvoicePaid(uint256 indexed invoiceId, address indexed payer, uint256 amount, bytes32 txHash);

    function setUp() public {
        usdc = new MockUSDC();
        invoiceManager = new MockInvoiceManager();
        paymentManager = new PaymentManager(admin, address(invoiceManager));

        usdc.mint(payer, 50_000 * 1e6);
    }

    function test_Constructor() public {
        assertEq(address(paymentManager.invoiceManager()), address(invoiceManager));
        assertTrue(paymentManager.hasRole(paymentManager.DEFAULT_ADMIN_ROLE(), admin));

        vm.expectRevert("Invalid admin");
        new PaymentManager(address(0), address(invoiceManager));

        vm.expectRevert("Invalid invoice manager");
        new PaymentManager(admin, address(0));
    }

    function test_PayInvoice_HappyPath() public {
        uint256 invoiceId = 1001;
        uint256 amount = 2_500 * 1e6;

        invoiceManager.setInvoice(invoiceId, creator, amount, address(usdc), 0); // CREATED

        vm.startPrank(payer);
        usdc.approve(address(paymentManager), amount);

        // Expect InvoicePaid event (checking indexed invoiceId and payer)
        vm.expectEmit(true, true, false, false);
        emit InvoicePaid(invoiceId, payer, amount, bytes32(0));

        paymentManager.payInvoice(invoiceId, amount);
        vm.stopPrank();

        assertTrue(paymentManager.isInvoicePaid(invoiceId));
        assertEq(usdc.balanceOf(creator), amount);

        (, , , uint8 status) = invoiceManager.getInvoice(invoiceId);
        assertEq(status, 4); // PAID
    }

    function test_PayInvoice_DoublePaymentReverts() public {
        uint256 invoiceId = 1002;
        uint256 amount = 1_000 * 1e6;

        invoiceManager.setInvoice(invoiceId, creator, amount, address(usdc), 1); // PENDING

        vm.startPrank(payer);
        usdc.approve(address(paymentManager), amount * 2);

        paymentManager.payInvoice(invoiceId, amount);

        vm.expectRevert("Invoice already paid");
        paymentManager.payInvoice(invoiceId, amount);
        vm.stopPrank();
    }

    function test_PayInvoice_EdgeCases() public {
        uint256 invoiceId = 1003;
        uint256 amount = 500 * 1e6;

        invoiceManager.setInvoice(invoiceId, creator, amount, address(usdc), 0);

        vm.startPrank(payer);
        usdc.approve(address(paymentManager), amount);

        vm.expectRevert("Amount must be > 0");
        paymentManager.payInvoice(invoiceId, 0);

        vm.expectRevert("Incorrect payment amount");
        paymentManager.payInvoice(invoiceId, amount - 1);

        vm.expectRevert("Invoice does not exist");
        paymentManager.payInvoice(9999, amount);

        // Not payable status (status = 2 / TOKENIZED)
        invoiceManager.setInvoice(1004, creator, amount, address(usdc), 2);
        vm.expectRevert("Invoice not payable");
        paymentManager.payInvoice(1004, amount);

        vm.stopPrank();
    }
}
