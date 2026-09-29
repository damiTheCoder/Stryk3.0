// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICollateralManager {
    function depositInitial(
        uint256 invoiceId,
        address stablecoin,
        address creator,
        uint256 amount
    ) external;
}

interface IInvoiceNFT {
    function mintInvoiceNFT(
        uint256 invoiceId,
        address creator,
        string calldata metadataURI
    ) external returns (uint256);
}

interface IGridManagerCreate {
    function createBoard(
        uint256 invoiceId,
        address stablecoin,
        uint16[100]  calldata winningCoordinates,
        uint8[100]   calldata unitBindings,
        bytes32 merkleRoot
    ) external;
}

/**
 * @title InvoiceManager
 * @notice On-chain tokenization registry for Veo.
 * Coordinates collateral deposit, NFT mint, and Merkle board creation in a single atomic transaction.
 */
contract InvoiceManager is AccessControl, ReentrancyGuard {
    enum InvoiceStatus {
        ACTIVE,     // 0: Board created, collateral locked, units claimable
        COMPLETED   // 1: All 100 units claimed or game finished
    }

    struct InvoiceRecord {
        uint256 id;
        address creator;
        uint256 amount;
        address stablecoin;
        uint64  dueDate;
        bytes32 debtorRef;
        string  metadataURI;
        InvoiceStatus status;
    }

    ICollateralManager public immutable collateralManager;
    IInvoiceNFT        public immutable invoiceNFT;
    IGridManagerCreate public immutable gridManager;

    uint256 private _globalInvoiceCounter;
    mapping(address => uint256) public creatorInvoiceSeq;
    mapping(uint256 => InvoiceRecord) internal _invoices;

    event InvoiceTokenized(uint256 indexed invoiceId, address indexed creator);
    event InvoiceStatusChanged(uint256 indexed invoiceId, InvoiceStatus newStatus);

    constructor(
        address admin,
        address collateralManager_,
        address invoiceNFT_,
        address gridManager_,
        uint256 startingInvoiceId
    ) {
        require(admin != address(0), "INVALID_ADMIN");
        require(collateralManager_ != address(0), "INVALID_COLLATERAL_MGR");
        require(invoiceNFT_ != address(0), "INVALID_INVOICE_NFT");
        require(gridManager_ != address(0), "INVALID_GRID_MGR");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);

        collateralManager = ICollateralManager(collateralManager_);
        invoiceNFT = IInvoiceNFT(invoiceNFT_);
        gridManager = IGridManagerCreate(gridManager_);
        _globalInvoiceCounter = startingInvoiceId;
    }

    function tokenizeInvoice(
        uint256 amount,
        address stablecoin,
        uint64  dueDate,
        bytes32 debtorRef,
        string calldata metadataURI,
        uint16[100] calldata winningCoordinates,
        uint8[100]  calldata unitBindings,
        bytes32 merkleRoot
    ) external nonReentrant returns (uint256 invoiceId) {
        require(amount > 0, "INVALID_AMOUNT");
        require(stablecoin != address(0), "INVALID_TOKEN");
        require(dueDate > block.timestamp, "INVALID_DUE_DATE");

        ++creatorInvoiceSeq[msg.sender];
        invoiceId = ++_globalInvoiceCounter;

        InvoiceRecord storage rec = _invoices[invoiceId];
        rec.id = invoiceId;
        rec.creator = msg.sender;
        rec.amount = amount;
        rec.stablecoin = stablecoin;
        rec.dueDate = dueDate;
        rec.debtorRef = debtorRef;
        rec.metadataURI = metadataURI;
        rec.status = InvoiceStatus.ACTIVE;

        // 1. Pull collateral
        collateralManager.depositInitial(invoiceId, stablecoin, msg.sender, amount);

        // 2. Mint NFT
        invoiceNFT.mintInvoiceNFT(invoiceId, msg.sender, metadataURI);

        // 3. Create board
        gridManager.createBoard(
            invoiceId,
            stablecoin,
            winningCoordinates,
            unitBindings,
            merkleRoot
        );

        emit InvoiceTokenized(invoiceId, msg.sender);
        emit InvoiceStatusChanged(invoiceId, InvoiceStatus.ACTIVE);

        return invoiceId;
    }

    function getInvoice(uint256 invoiceId)
        external
        view
        returns (InvoiceRecord memory)
    {
        return _invoices[invoiceId];
    }

    function getInvoiceCreator(uint256 invoiceId)
        external
        view
        returns (address)
    {
        return _invoices[invoiceId].creator;
    }

    function getInvoiceStablecoin(uint256 invoiceId)
        external
        view
        returns (address)
    {
        return _invoices[invoiceId].stablecoin;
    }
}
