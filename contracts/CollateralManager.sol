// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title CollateralManager
 * @notice Per-invoice isolated collateral pools. Creator locks 100% upfront,
 * locked forever. 15% CoinTag contributions grow the pool.
 */
contract CollateralManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant INVOICE_MANAGER = keccak256("INVOICE_MANAGER");
    bytes32 public constant COINTAG_MANAGER = keccak256("COINTAG_MANAGER");
    bytes32 public constant GRID_MANAGER = keccak256("GRID_MANAGER");
    bytes32 public constant SWEEP_ROLE = keccak256("SWEEP_ROLE");

    struct CollateralPool {
        uint256 invoiceId;
        address stablecoin;
        uint256 initialCollateral;
        uint256 coinTagContributions;
        uint256 totalCollateral;
        uint256 paidOut;
        uint256 unitsClaimed;
        bool    locked;
    }

    mapping(uint256 => CollateralPool) public pools;

    event CollateralDeposited(uint256 indexed invoiceId, address indexed creator, uint256 amount);
    event CollateralIncreased(uint256 indexed invoiceId, uint256 amount, uint256 newTotal);
    event ClaimPaid(uint256 indexed invoiceId, uint8 unitId, address indexed recipient, uint256 amount);
    event DustSwept(uint256 indexed invoiceId, uint256 amount);

    constructor(address admin) {
        require(admin != address(0), "Invalid admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function depositInitial(
        uint256 invoiceId,
        address stablecoin,
        address creator,
        uint256 amount
    ) external nonReentrant onlyRole(INVOICE_MANAGER) {
        require(invoiceId > 0, "Invalid invoice ID");
        require(stablecoin != address(0), "Invalid stablecoin");
        require(creator != address(0), "Invalid creator");
        require(amount > 0, "Amount must be > 0");
        require(!pools[invoiceId].locked, "Pool already initialized");

        pools[invoiceId] = CollateralPool({
            invoiceId: invoiceId,
            stablecoin: stablecoin,
            initialCollateral: amount,
            coinTagContributions: 0,
            totalCollateral: amount,
            paidOut: 0,
            unitsClaimed: 0,
            locked: true
        });

        IERC20(stablecoin).safeTransferFrom(creator, address(this), amount);

        emit CollateralDeposited(invoiceId, creator, amount);
    }

    function contribute(uint256 invoiceId, uint256 amount)
        external
        nonReentrant
        onlyRole(COINTAG_MANAGER)
    {
        CollateralPool storage pool = pools[invoiceId];
        require(pool.locked, "Pool not initialized");
        require(amount > 0, "Amount must be > 0");

        pool.coinTagContributions += amount;
        pool.totalCollateral += amount;
        uint256 newTotal = pool.totalCollateral;

        IERC20(pool.stablecoin).safeTransferFrom(msg.sender, address(this), amount);

        emit CollateralIncreased(invoiceId, amount, newTotal);
    }

    function payoutClaim(uint256 invoiceId, address recipient)
        external
        nonReentrant
        onlyRole(GRID_MANAGER)
        returns (uint256 payout)
    {
        require(recipient != address(0), "Invalid recipient");
        CollateralPool storage pool = pools[invoiceId];
        require(pool.locked, "Pool not initialized");
        require(pool.unitsClaimed < 100, "All units claimed");

        uint256 remaining = pool.totalCollateral > pool.paidOut ? pool.totalCollateral - pool.paidOut : 0;
        require(remaining > 0, "Pool is empty");

        payout = pool.totalCollateral / 100;
        require(payout > 0, "Payout must be > 0");
        require(remaining >= payout, "Insufficient collateral");

        pool.unitsClaimed += 1;

        // casting to 'uint8' is safe because unitsClaimed is strictly <= 100
        // forge-lint: disable-next-line(unsafe-typecast)
        uint8 unitId = uint8(pool.unitsClaimed);
        pool.paidOut += payout;

        IERC20(pool.stablecoin).safeTransfer(recipient, payout);

        emit ClaimPaid(invoiceId, unitId, recipient, payout);
        return payout;
    }

    function sweepDust(uint256 invoiceId, address to)
        external
        nonReentrant
        onlyRole(SWEEP_ROLE)
    {
        require(to != address(0), "Invalid recipient");
        CollateralPool storage pool = pools[invoiceId];
        require(pool.locked, "Pool not initialized");
        require(pool.unitsClaimed == 100, "Game not completed");

        uint256 dust = pool.totalCollateral > pool.paidOut ? pool.totalCollateral - pool.paidOut : 0;
        require(dust > 0, "No dust to sweep");

        pool.paidOut += dust;
        IERC20(pool.stablecoin).safeTransfer(to, dust);

        emit DustSwept(invoiceId, dust);
    }

    function totalCollateral(uint256 invoiceId) external view returns (uint256) {
        return pools[invoiceId].totalCollateral;
    }
}
