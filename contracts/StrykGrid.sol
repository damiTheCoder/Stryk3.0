// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

interface IStrykNFT {
    function redeemNFT(uint256 tokenId, address holder) external;
}

contract StrykGrid is Ownable, ERC721Holder {
    using SafeERC20 for IERC20;

    uint256 public constant GRID_SIZE = 100;
    uint256 public constant MIN_COIN_TAG = 10_000; // 0.01 USDC with 6 decimals

    /// Fee basis points (out of 10 000)
    uint256 public constant CREATOR_BPS  = 8_000; // 80% to NFT creator
    uint256 public constant PLATFORM_BPS = 1_000; // 10% to platform
    uint256 public constant LIQUIDITY_BPS= 1_000; // 10% to NFT liquidity pool

    address public immutable strykNFTContract;
    address public platformFeeAddress;
    address public liquidityPoolAddress;

    struct Listing {
        uint256 gridId;
        address vendor;
        address nftContract;
        uint256 tokenId;
        uint256 cointag;
        address usdcToken;
        bytes32 commitment;
        uint256 winningCell;
        uint256 totalRevealed;
        bool winnerRevealed;
        bool claimed;
        bool active;
    }

    uint256 private _nextGridId;

    mapping(uint256 gridId => Listing) private _listings;
    mapping(uint256 gridId => mapping(uint256 cellIndex => address)) private _revealedCells;

    event ListingCreated(uint256 indexed gridId, address indexed vendor, uint256 indexed tokenId, uint256 cointag);
    event WinnerRevealed(uint256 indexed gridId, uint256 winningCell);
    event CellRevealed(uint256 indexed gridId, uint256 indexed cellIndex, address indexed revealer, bool isWinner);
    event NFTClaimed(uint256 indexed gridId, uint256 indexed tokenId, address indexed claimer);
    event ListingCancelled(uint256 indexed gridId);
    event FeeSplit(uint256 indexed gridId, uint256 creatorAmt, uint256 platformAmt, uint256 liquidityAmt);

    constructor(
        address initialOwner,
        address strykNFT_,
        address platformFeeAddress_,
        address liquidityPoolAddress_
    ) Ownable(initialOwner) {
        require(strykNFT_ != address(0), "Invalid StrykNFT contract");
        require(platformFeeAddress_ != address(0), "Invalid platform address");
        require(liquidityPoolAddress_ != address(0), "Invalid liquidity address");

        strykNFTContract = strykNFT_;
        platformFeeAddress = platformFeeAddress_;
        liquidityPoolAddress = liquidityPoolAddress_;
        _nextGridId = 1;
    }

    function setPlatformFeeAddress(address addr) external onlyOwner {
        require(addr != address(0), "Zero address");
        platformFeeAddress = addr;
    }

    function setLiquidityPoolAddress(address addr) external onlyOwner {
        require(addr != address(0), "Zero address");
        liquidityPoolAddress = addr;
    }

    function createListing(uint256 tokenId, uint256 cointag, address usdcToken, bytes32 commitment)
        external
        returns (uint256 gridId)
    {
        require(usdcToken != address(0), "Invalid USDC token");
        require(cointag >= MIN_COIN_TAG, "Cointag too low");
        require(commitment != bytes32(0), "Invalid commitment");
        require(IERC721(strykNFTContract).ownerOf(tokenId) == msg.sender, "Not token owner");

        gridId = _nextGridId++;

        IERC721(strykNFTContract).safeTransferFrom(msg.sender, address(this), tokenId);

        _listings[gridId] = Listing({
            gridId: gridId,
            vendor: msg.sender,
            nftContract: strykNFTContract,
            tokenId: tokenId,
            cointag: cointag,
            usdcToken: usdcToken,
            commitment: commitment,
            winningCell: 0,
            totalRevealed: 0,
            winnerRevealed: false,
            claimed: false,
            active: true
        });

        emit ListingCreated(gridId, msg.sender, tokenId, cointag);
    }

    function revealWinner(uint256 gridId, bytes32 secret) external {
        Listing storage listing = _listings[gridId];

        require(listing.gridId != 0, "Grid not found");
        require(listing.active, "Listing inactive");
        require(msg.sender == listing.vendor, "Only vendor");
        require(!listing.winnerRevealed, "Winner already revealed");
        require(keccak256(abi.encodePacked(secret)) == listing.commitment, "Invalid secret");

        listing.winningCell = uint256(keccak256(abi.encodePacked(secret, gridId))) % GRID_SIZE;
        listing.winnerRevealed = true;

        emit WinnerRevealed(gridId, listing.winningCell);
    }

    function revealCell(uint256 gridId, uint256 cellIndex, address usdcToken) external {
        Listing storage listing = _listings[gridId];

        require(listing.active, "Listing inactive");
        require(!listing.claimed, "Already claimed");
        require(listing.winnerRevealed, "Winner not revealed");
        require(cellIndex < GRID_SIZE, "Invalid cell index");
        require(_revealedCells[gridId][cellIndex] == address(0), "Cell already revealed");
        require(usdcToken == listing.usdcToken, "USDC token mismatch");

        // Split cointag: 80% creator, 10% platform, 10% liquidity pool
        uint256 creatorAmt   = (listing.cointag * CREATOR_BPS)   / 10_000;
        uint256 platformAmt  = (listing.cointag * PLATFORM_BPS)  / 10_000;
        uint256 liquidityAmt = listing.cointag - creatorAmt - platformAmt; // remainder avoids dust

        IERC20(listing.usdcToken).safeTransferFrom(msg.sender, listing.vendor,       creatorAmt);
        IERC20(listing.usdcToken).safeTransferFrom(msg.sender, platformFeeAddress,   platformAmt);
        IERC20(listing.usdcToken).safeTransferFrom(msg.sender, liquidityPoolAddress, liquidityAmt);

        emit FeeSplit(gridId, creatorAmt, platformAmt, liquidityAmt);

        _revealedCells[gridId][cellIndex] = msg.sender;
        listing.totalRevealed += 1;

        bool isWinner = cellIndex == listing.winningCell;

        if (isWinner) {
            listing.claimed = true;
            listing.active = false;

            IERC721(listing.nftContract).safeTransferFrom(address(this), msg.sender, listing.tokenId);
            IStrykNFT(listing.nftContract).redeemNFT(listing.tokenId, msg.sender);

            emit NFTClaimed(gridId, listing.tokenId, msg.sender);
        }

        emit CellRevealed(gridId, cellIndex, msg.sender, isWinner);
    }

    function getGrid(uint256 gridId)
        external
        view
        returns (
            uint256 listingGridId,
            address vendor,
            address nftContract,
            uint256 tokenId,
            uint256 cointag,
            address usdcToken,
            uint256 totalRevealed,
            bool claimed,
            bool active,
            uint256 revealedWinningCell
        )
    {
        Listing memory listing = _listings[gridId];
        require(listing.gridId != 0, "Grid not found");

        listingGridId = listing.gridId;
        vendor = listing.vendor;
        nftContract = listing.nftContract;
        tokenId = listing.tokenId;
        cointag = listing.cointag;
        usdcToken = listing.usdcToken;
        totalRevealed = listing.totalRevealed;
        claimed = listing.claimed;
        active = listing.active;
        revealedWinningCell = listing.winnerRevealed ? listing.winningCell : type(uint256).max;
    }

    function getRevealedCells(uint256 gridId) external view returns (address[GRID_SIZE] memory cells) {
        Listing memory listing = _listings[gridId];
        require(listing.gridId != 0, "Grid not found");

        for (uint256 i = 0; i < GRID_SIZE; ++i) {
            cells[i] = _revealedCells[gridId][i];
        }
    }

    function cancelListing(uint256 gridId) external {
        Listing storage listing = _listings[gridId];

        require(listing.gridId != 0, "Grid not found");
        require(listing.totalRevealed == 0, "Listing has reveals - cannot cancel");
        require(msg.sender == listing.vendor, "Only vendor");
        require(!listing.claimed, "Already claimed");
        require(listing.active, "Listing inactive");

        listing.active = false;

        IERC721(listing.nftContract).safeTransferFrom(address(this), listing.vendor, listing.tokenId);

        emit ListingCancelled(gridId);
    }
}
