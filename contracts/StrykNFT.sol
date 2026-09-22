// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

contract StrykNFT is ERC721, Ownable {
    using SafeERC20 for IERC20;

    struct InvoiceNFT {
        string invoiceRef;
        address vendor;
        uint256 faceValue;
        uint256 dueDate;
        uint256 collateral;
        bool paid;
        bool redeemed;
        bool tokenizedFromPlatform;
    }

    IERC20 public immutable usdcToken;
    address public gridContract;

    uint256 private _nextTokenId;
    uint256 private _totalMinted;

    mapping(uint256 tokenId => InvoiceNFT) private _invoiceData;
    mapping(address => bool) public authorizedMinters;

    event InvoiceNFTMinted(uint256 indexed tokenId, address indexed vendor, uint256 faceValue, bool fromPlatform);
    event InvoiceNFTRedeemed(uint256 indexed tokenId, address indexed holder, uint256 amount);
    event CollateralWithdrawn(uint256 indexed tokenId, address indexed vendor);
    event RedeemableReady(uint256 indexed tokenId, address indexed holder, uint256 amount);
    event GridContractSet(address indexed gridContract);
    event AuthorizedMinterSet(address indexed minter, bool authorized);

    modifier onlyOwnerOrGrid() {
        require(
            msg.sender == owner() || msg.sender == gridContract || authorizedMinters[msg.sender],
            "Not authorized minter"
        );
        _;
    }

    modifier onlyGridContract() {
        require(msg.sender == gridContract, "Only grid contract");
        _;
    }

    constructor(address usdcAddress, address initialOwner)
        ERC721("Stryk Invoice Receivable", "STRYK-INV")
        Ownable(initialOwner)
    {
        require(usdcAddress != address(0), "Invalid USDC address");

        usdcToken = IERC20(usdcAddress);
        _nextTokenId = 1;
    }

    function setGridContract(address gridContract_) external onlyOwner {
        require(gridContract_ != address(0), "Invalid grid contract");
        gridContract = gridContract_;

        emit GridContractSet(gridContract_);
    }

    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        require(minter != address(0), "Invalid minter");
        authorizedMinters[minter] = authorized;

        emit AuthorizedMinterSet(minter, authorized);
    }

    function mintFromPlatform(address vendor, uint256 faceValue, uint256 dueDate, string calldata invoiceRef)
        external
        onlyOwnerOrGrid
        returns (uint256 tokenId)
    {
        require(vendor != address(0), "Invalid vendor");
        require(faceValue > 0, "Invalid face value");
        require(dueDate > block.timestamp, "Invalid due date");

        tokenId = _nextTokenId++;
        _totalMinted++;

        _safeMint(vendor, tokenId);

        _invoiceData[tokenId] = InvoiceNFT({
            invoiceRef: invoiceRef,
            vendor: vendor,
            faceValue: faceValue,
            dueDate: dueDate,
            collateral: 0,
            paid: false,
            redeemed: false,
            tokenizedFromPlatform: true
        });

        emit InvoiceNFTMinted(tokenId, vendor, faceValue, true);
    }

    function mintExternal(
        address vendor,
        uint256 faceValue,
        uint256 dueDate,
        string calldata invoiceRef,
        uint256 collateralAmount
    ) external returns (uint256 tokenId) {
        require(msg.sender == vendor, "Only vendor");
        require(vendor != address(0), "Invalid vendor");
        require(faceValue > 0, "Invalid face value");
        require(dueDate > block.timestamp, "Invalid due date");
        require(collateralAmount == faceValue, "Collateral must equal face value");

        usdcToken.safeTransferFrom(vendor, address(this), collateralAmount);

        tokenId = _nextTokenId++;
        _totalMinted++;

        _safeMint(vendor, tokenId);

        _invoiceData[tokenId] = InvoiceNFT({
            invoiceRef: invoiceRef,
            vendor: vendor,
            faceValue: faceValue,
            dueDate: dueDate,
            collateral: collateralAmount,
            paid: false,
            redeemed: false,
            tokenizedFromPlatform: false
        });

        emit InvoiceNFTMinted(tokenId, vendor, faceValue, false);
    }

    function redeemNFT(uint256 tokenId, address holder) external onlyGridContract {
        require(_ownerOf(tokenId) != address(0), "Token not found");

        InvoiceNFT storage invoice = _invoiceData[tokenId];
        require(!invoice.redeemed, "Already redeemed");

        address currentOwner = ownerOf(tokenId);

        invoice.redeemed = true;
        invoice.paid = true;

        if (invoice.tokenizedFromPlatform) {
            emit RedeemableReady(tokenId, currentOwner, invoice.faceValue);
        } else {
            require(invoice.collateral >= invoice.faceValue, "Insufficient collateral");
            invoice.collateral -= invoice.faceValue;
            usdcToken.safeTransfer(currentOwner, invoice.faceValue);
        }

        emit InvoiceNFTRedeemed(tokenId, currentOwner, invoice.faceValue);
    }

    function withdrawCollateral(uint256 tokenId) external {
        require(_ownerOf(tokenId) != address(0), "Token not found");

        InvoiceNFT memory invoice = _invoiceData[tokenId];
        require(msg.sender == invoice.vendor, "Only vendor");
        require(!invoice.redeemed, "Already redeemed");
        require(ownerOf(tokenId) == msg.sender, "Vendor must own NFT");

        uint256 collateral = invoice.collateral;

        delete _invoiceData[tokenId];
        _burn(tokenId);

        if (collateral > 0) {
            usdcToken.safeTransfer(msg.sender, collateral);
        }

        emit CollateralWithdrawn(tokenId, msg.sender);
    }

    function getInvoiceNFT(uint256 tokenId) external view returns (InvoiceNFT memory) {
        require(_ownerOf(tokenId) != address(0), "Token not found");
        return _invoiceData[tokenId];
    }

    function totalSupply() external view returns (uint256) {
        return _totalMinted;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token not found");

        InvoiceNFT memory invoice = _invoiceData[tokenId];

        string memory json = string(
            abi.encodePacked(
                '{"name":"Stryk Invoice #',
                Strings.toString(tokenId),
                '","description":"Tokenized invoice receivable","attributes":[',
                '{"trait_type":"Face Value (USDC 6dp)","value":"',
                Strings.toString(invoice.faceValue),
                '"},',
                '{"trait_type":"Vendor","value":"',
                Strings.toHexString(uint160(invoice.vendor), 20),
                '"},',
                '{"trait_type":"Invoice Reference","value":"',
                invoice.invoiceRef,
                '"},',
                '{"trait_type":"Paid","value":"',
                invoice.paid ? "true" : "false",
                '"},',
                '{"trait_type":"Redeemed","value":"',
                invoice.redeemed ? "true" : "false",
                '"}]}'
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }
}
