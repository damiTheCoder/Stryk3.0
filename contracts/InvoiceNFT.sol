// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title InvoiceNFT
 * @notice Soulbound ERC-721 representing tokenized invoices. tokenId == invoiceId.
 */
contract InvoiceNFT is ERC721, AccessControl {
    bytes32 public constant INVOICE_MANAGER = keccak256("INVOICE_MANAGER");
    bytes32 public constant TRANSFER_ROLE = keccak256("TRANSFER_ROLE");

    enum InvoiceStatus {
        CREATED,
        PENDING,
        TOKENIZED,
        ACTIVE,
        PAID,
        DEFAULTED,
        CANCELLED
    }

    struct InvoiceNFTData {
        uint256 invoiceId;
        address creator;
        uint256 invoiceValue;
        address stablecoin;
        uint64  dueDate;
        uint64  tokenizedAt;
        address collateralPool;
        address gridBoard;
        uint16  totalUnits;
        InvoiceStatus status;
        string  metadataURI;
        bytes32 debtorRef;
    }

    mapping(uint256 => bool) public isTransferable;
    mapping(uint256 => InvoiceNFTData) public nftData;

    event InvoiceTokenized(uint256 indexed invoiceId, address indexed creator);
    event InvoiceNFTMinted(uint256 indexed invoiceId, address indexed to, string metadataURI);
    event InvoiceNFTTransferred(uint256 indexed invoiceId, address indexed from, address indexed to);

    constructor(address admin) ERC721("Veo Invoice NFT", "VEO-INV") {
        require(admin != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mintInvoiceNFT(
        uint256 invoiceId,
        address creator,
        string calldata metadataURI
    ) external onlyRole(INVOICE_MANAGER) returns (uint256 tokenId) {
        require(invoiceId > 0, "Invalid invoice ID");
        require(creator != address(0), "Invalid creator");

        tokenId = invoiceId;

        // casting to 'uint64' is safe because block.timestamp fits in uint64 for millennia
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 nowTimestamp = uint64(block.timestamp);

        nftData[tokenId] = InvoiceNFTData({
            invoiceId: invoiceId,
            creator: creator,
            invoiceValue: 0,
            stablecoin: address(0),
            dueDate: 0,
            tokenizedAt: nowTimestamp,
            collateralPool: address(0),
            gridBoard: address(0),
            totalUnits: 100,
            status: InvoiceStatus.TOKENIZED,
            metadataURI: metadataURI,
            debtorRef: bytes32(0)
        });

        emit InvoiceTokenized(invoiceId, creator);
        emit InvoiceNFTMinted(invoiceId, creator, metadataURI);

        _safeMint(creator, tokenId);

        return tokenId;
    }

    function setCollateralPool(uint256 tokenId, address pool) external onlyRole(INVOICE_MANAGER) {
        _requireOwned(tokenId);
        require(nftData[tokenId].collateralPool == address(0), "Collateral pool already set");
        require(pool != address(0), "Invalid collateral pool");

        nftData[tokenId].collateralPool = pool;
    }

    function setGridBoard(uint256 tokenId, address board) external onlyRole(INVOICE_MANAGER) {
        _requireOwned(tokenId);
        require(nftData[tokenId].gridBoard == address(0), "Grid board already set");
        require(board != address(0), "Invalid grid board");

        nftData[tokenId].gridBoard = board;
    }

    function setInvoiceDetails(
        uint256 tokenId,
        uint256 invoiceValue,
        address stablecoin,
        uint64 dueDate,
        bytes32 debtorRef
    ) external onlyRole(INVOICE_MANAGER) {
        _requireOwned(tokenId);
        InvoiceNFTData storage data = nftData[tokenId];
        data.invoiceValue = invoiceValue;
        data.stablecoin = stablecoin;
        data.dueDate = dueDate;
        data.debtorRef = debtorRef;
    }

    function setInvoiceStatus(uint256 tokenId, InvoiceStatus status) external onlyRole(INVOICE_MANAGER) {
        _requireOwned(tokenId);
        nftData[tokenId].status = status;
    }

    function setTransferable(uint256 tokenId, bool transferable) external onlyRole(TRANSFER_ROLE) {
        _requireOwned(tokenId);
        isTransferable[tokenId] = transferable;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return nftData[tokenId].metadataURI;
    }

    function getInvoiceNFTData(uint256 tokenId)
        external
        view
        returns (InvoiceNFTData memory)
    {
        return nftData[tokenId];
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        require(isTransferable[tokenId], "NFT is soulbound");
        super.transferFrom(from, to, tokenId);
        emit InvoiceNFTTransferred(tokenId, from, to);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
