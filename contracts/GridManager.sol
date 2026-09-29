// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ICollateralManager {
    function payoutClaim(uint256 invoiceId, address recipient)
        external
        returns (uint256);
}

interface IUnitClaim {
    function mint(address to, uint256 invoiceId, uint8 unitId)
        external
        returns (uint256);
}

/**
 * @title GridManager
 * @notice The 26x26 discovery board. 676 coordinates, 100 winning, 576 decoys.
 * Handles submitPair with "CPU not found" on ALL failures.
 * Uses a sorted-pair Merkle root for gas-efficient board commitment.
 */
contract GridManager is AccessControl, ReentrancyGuard {
    bytes32 public constant INVOICE_MANAGER = keccak256("INVOICE_MANAGER");
    bytes32 public constant COINTAG_MANAGER = keccak256("COINTAG_MANAGER");

    ICollateralManager public immutable collateralManager;
    IUnitClaim public immutable unitClaim;

    struct Board {
        uint256 invoiceId;
        address stablecoin;
        bytes32 merkleRoot;
        mapping(uint16 => uint8) coordinateToUnit;
        mapping(uint8  => bool)  unitClaimed;
        uint8   unitsClaimed;
        bool    completed;
    }

    mapping(uint256 => Board) internal _boards;
    mapping(address => mapping(uint256 => bool)) public hasAccess;

    event BoardCreated(uint256 indexed invoiceId);
    event AccessGranted(uint256 indexed invoiceId, address indexed user);
    event UnitClaimed(uint256 indexed invoiceId, uint8 unitId, address indexed claimer, uint256 payout);
    event GameCompleted(uint256 indexed invoiceId);

    constructor(
        address admin,
        address collateralManager_,
        address unitClaim_
    ) {
        require(admin != address(0), "INVALID_ADMIN");
        require(collateralManager_ != address(0), "INVALID_COLLATERAL_MGR");
        require(unitClaim_ != address(0), "INVALID_UNIT_CLAIM");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        collateralManager = ICollateralManager(collateralManager_);
        unitClaim = IUnitClaim(unitClaim_);
    }

    function createBoard(
        uint256 invoiceId,
        address stablecoin,
        uint16[100]  calldata winningCoordinates,
        uint8[100]   calldata unitBindings,
        bytes32 merkleRoot
    ) external onlyRole(INVOICE_MANAGER) {
        require(invoiceId > 0, "INVALID_INVOICE");
        require(stablecoin != address(0), "INVALID_STABLECOIN");
        require(_boards[invoiceId].merkleRoot == bytes32(0), "BOARD_EXISTS");

        Board storage b = _boards[invoiceId];
        b.invoiceId = invoiceId;
        b.stablecoin = stablecoin;
        b.merkleRoot = merkleRoot;

        for (uint256 i = 0; i < 100; i++) {
            uint16 coord = winningCoordinates[i];
            require(coord < 676, "INVALID_COORD");
            require(unitBindings[i] == i + 1, "INVALID_BINDING");
            require(b.coordinateToUnit[coord] == 0, "DUPLICATE_COORD");
            b.coordinateToUnit[coord] = unitBindings[i];
        }

        emit BoardCreated(invoiceId);
    }

    function grantAccess(uint256 invoiceId, address user)
        external
        onlyRole(COINTAG_MANAGER)
    {
        require(_boards[invoiceId].stablecoin != address(0), "NO_BOARD");
        require(!_boards[invoiceId].completed, "BOARD_COMPLETED");
        require(user != address(0), "INVALID_USER");

        hasAccess[user][invoiceId] = true;
        emit AccessGranted(invoiceId, user);
    }

    function submitPair(
        uint256 invoiceId,
        uint16  coordinate,
        uint256 pairA,
        uint256 pairB,
        bytes32[] calldata merkleProof
    ) external nonReentrant {
        require(hasAccess[msg.sender][invoiceId], "CPU not found");
        Board storage b = _boards[invoiceId];
        require(!b.completed, "CPU not found");
        require(coordinate < 676, "CPU not found");

        bytes32 pairHash = keccak256(abi.encode(pairA, pairB));
        bytes32 leaf = keccak256(abi.encode(coordinate, pairHash));
        require(_verifyProof(leaf, merkleProof, b.merkleRoot), "CPU not found");

        uint8 unitId = b.coordinateToUnit[coordinate];
        require(unitId != 0, "CPU not found");
        require(!b.unitClaimed[unitId], "CPU not found");

        b.unitClaimed[unitId] = true;
        b.unitsClaimed += 1;

        uint256 payout = collateralManager.payoutClaim(invoiceId, msg.sender);
        unitClaim.mint(msg.sender, invoiceId, unitId);

        emit UnitClaimed(invoiceId, unitId, msg.sender, payout);

        if (b.unitsClaimed == 100) {
            b.completed = true;
            emit GameCompleted(invoiceId);
        }
    }

    /**
     * @dev Verifies a Merkle proof using sorted pairs (RFC 6962 / standard sorted order).
     * @param leaf The leaf hash to verify.
     * @param proof Sibling hashes along the Merkle branch from bottom to root.
     * @param root The expected Merkle root.
     * @return True if the proof proves leaf inclusion in root, false otherwise.
     */
    function _verifyProof(
        bytes32 leaf,
        bytes32[] calldata proof,
        bytes32 root
    ) internal pure returns (bool) {
        bytes32 computed = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            if (computed <= p) {
                computed = keccak256(abi.encodePacked(computed, p));
            } else {
                computed = keccak256(abi.encodePacked(p, computed));
            }
        }
        return computed == root;
    }

    function isCompleted(uint256 invoiceId) external view returns (bool) {
        return _boards[invoiceId].completed;
    }

    function getBoardUnitsClaimed(uint256 invoiceId) external view returns (uint8) {
        return _boards[invoiceId].unitsClaimed;
    }

    function getMerkleRoot(uint256 invoiceId) external view returns (bytes32) {
        return _boards[invoiceId].merkleRoot;
    }

    function getCoordinateToUnit(uint256 invoiceId, uint16 coordinate)
        external
        view
        returns (uint8)
    {
        return _boards[invoiceId].coordinateToUnit[coordinate];
    }

    function isUnitClaimed(uint256 invoiceId, uint8 unitId)
        external
        view
        returns (bool)
    {
        return _boards[invoiceId].unitClaimed[unitId];
    }
}
