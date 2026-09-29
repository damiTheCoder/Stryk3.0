// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title UnitClaim
 * @notice Soulbound ERC-721 minted as proof of a successful unit claim.
 * One token per (invoiceId, unitId) pair. Non-transferable.
 */
contract UnitClaim is ERC721, AccessControl {
    bytes32 public constant GRID_MANAGER = keccak256("GRID_MANAGER");

    struct ClaimProof {
        uint256 invoiceId;
        uint8   unitId;
        address holder;
        uint64  claimedAt;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => ClaimProof) public claimProofs;
    mapping(uint256 => mapping(uint8 => uint256)) public tokenOf;

    event UnitClaimMinted(
        uint256 indexed tokenId,
        uint256 indexed invoiceId,
        uint8 unitId,
        address indexed holder
    );

    constructor(address admin) ERC721("Veo Unit Claim", "VEO-CLAIM") {
        require(admin != address(0), "INVALID_ADMIN");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(
        address to,
        uint256 invoiceId,
        uint8 unitId
    ) external onlyRole(GRID_MANAGER) returns (uint256 tokenId) {
        require(to != address(0), "INVALID_RECIPIENT");
        require(tokenOf[invoiceId][unitId] == 0, "ALREADY_MINTED");
        require(unitId >= 1 && unitId <= 100, "INVALID_UNIT");

        tokenId = ++_nextTokenId;

        // casting to 'uint64' is safe because block.timestamp fits in uint64 for millennia
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 claimedAt = uint64(block.timestamp);

        claimProofs[tokenId] = ClaimProof({
            invoiceId: invoiceId,
            unitId: unitId,
            holder: to,
            claimedAt: claimedAt
        });
        tokenOf[invoiceId][unitId] = tokenId;

        emit UnitClaimMinted(tokenId, invoiceId, unitId, to);

        _safeMint(to, tokenId);

        return tokenId;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return "";
    }

    function transferFrom(address, address, uint256) public pure override {
        revert("SOULBOUND");
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert("SOULBOUND");
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
