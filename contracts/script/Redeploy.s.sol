// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {Treasury}          from "../Treasury.sol";
import {InvoiceNFT}        from "../InvoiceNFT.sol";
import {CollateralManager} from "../CollateralManager.sol";
import {UnitClaim}         from "../UnitClaim.sol";
import {GridManager}       from "../GridManager.sol";
import {InvoiceManager}    from "../InvoiceManager.sol";
import {CoinTagManager}    from "../CoinTagManager.sol";
import {PaymentManager}    from "../PaymentManager.sol";
import {IAccessControl}    from "@openzeppelin/contracts/access/IAccessControl.sol";

/**
 * @title Redeploy
 * @notice Redeploys GridManager (Merkle-root version), InvoiceManager (Merkle-root version),
 *         and CoinTagManager (wired to new GridManager & InvoiceManager) to Arc Testnet.
 *         Updates role permissions on existing and newly deployed contracts.
 *
 * Usage:
 *   forge script contracts/script/Redeploy.s.sol:Redeploy \
 *     --rpc-url $ARC_TESTNET_RPC_URL \
 *     --private-key $DEPLOYER_PRIVATE_KEY
 */
contract Redeploy is Script {
    // ── Existing Unchanged Contracts ──────────────────────────────────────────
    address constant TREASURY_ADDR           = 0x0948EE3ce053D3c5d9B0D32F8b349785f6BB1ABD;
    address constant INVOICE_NFT_ADDR        = 0xBeff9105ae281aE07943cD263466b34C2737e419;
    address constant COLLATERAL_MANAGER_ADDR = 0x7814f445fd67d10B0ab0b6a67141092D4F6C01f1;
    address constant UNIT_CLAIM_ADDR         = 0xa4d87D1EFBA64dD07C856eA3989DD8Fa8F267F6E;
    address constant PAYMENT_MANAGER_ADDR    = 0x5AbD73D8e5cF84e5D72ecBa67B0AA339076BfE64;

    // ── Old Deprecated Contracts (to revoke roles from) ──────────────────────
    address constant OLD_GRID_MANAGER_ADDR    = 0x1b12076Fe0f6CaD2cA08CBe0920448714F2ba7Ae;
    address constant OLD_INVOICE_MANAGER_ADDR = 0xa8bd65DE7ABB89dF4E008Ac3CeA064Af399Ce0e6;
    address constant OLD_COINTAG_MANAGER_ADDR = 0x5818823e33574DbcaA983EF2FF784628F43466Fb;

    // ── Roles ────────────────────────────────────────────────────────────────
    bytes32 constant DEFAULT_ADMIN_ROLE = bytes32(0);

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        address admin       = vm.envAddress("ADMIN_ADDRESS");
        address usdc        = vm.envAddress("ARC_USDC_ADDRESS");

        console.log("=== Veo Merkle Redeploy ===");
        console.log("Deployer: ", deployer);
        console.log("Admin:    ", admin);
        console.log("USDC:     ", usdc);

        Treasury treasury                   = Treasury(TREASURY_ADDR);
        InvoiceNFT invoiceNFT               = InvoiceNFT(INVOICE_NFT_ADDR);
        CollateralManager collateralManager = CollateralManager(COLLATERAL_MANAGER_ADDR);
        UnitClaim unitClaim                 = UnitClaim(UNIT_CLAIM_ADDR);

        vm.startBroadcast(deployerKey);

        // ── 1. Deploy new GridManager ─────────────────────────────────────────
        GridManager newGridManager = new GridManager(
            deployer,
            COLLATERAL_MANAGER_ADDR,
            UNIT_CLAIM_ADDR
        );
        console.log("New GridManager deployed at:      ", address(newGridManager));

        // ── 2. Deploy new InvoiceManager ──────────────────────────────────────
        InvoiceManager newInvoiceManager = new InvoiceManager(
            deployer,
            COLLATERAL_MANAGER_ADDR,
            INVOICE_NFT_ADDR,
            address(newGridManager),
            6
        );
        console.log("New InvoiceManager deployed at:   ", address(newInvoiceManager));

        // ── 2b. Deploy new CoinTagManager ─────────────────────────────────────
        CoinTagManager newCoinTagManager = new CoinTagManager(
            deployer,
            COLLATERAL_MANAGER_ADDR,
            TREASURY_ADDR,
            address(newGridManager),
            address(newInvoiceManager)
        );
        console.log("New CoinTagManager deployed at:   ", address(newCoinTagManager));

        // ── 3. Wire roles on new GridManager ──────────────────────────────────
        newGridManager.grantRole(newGridManager.INVOICE_MANAGER(), address(newInvoiceManager));
        newGridManager.grantRole(newGridManager.COINTAG_MANAGER(), address(newCoinTagManager));
        newGridManager.grantRole(DEFAULT_ADMIN_ROLE, admin);

        // ── 4. Wire roles on new InvoiceManager ────────────────────────────────
        newInvoiceManager.grantRole(DEFAULT_ADMIN_ROLE, admin);

        // ── 5. Wire roles on new CoinTagManager ────────────────────────────────
        newCoinTagManager.grantRole(DEFAULT_ADMIN_ROLE, admin);
        newCoinTagManager.setAllowlistedStablecoin(usdc, true);
        newCoinTagManager.setGlobalCoinTagPrice(1_000_000); // 1 USDC

        // ── 6. Update roles on existing contracts ──────────────────────────────
        // 6.1 CollateralManager
        collateralManager.grantRole(collateralManager.INVOICE_MANAGER(), address(newInvoiceManager));
        collateralManager.revokeRole(collateralManager.INVOICE_MANAGER(), OLD_INVOICE_MANAGER_ADDR);

        collateralManager.grantRole(collateralManager.GRID_MANAGER(), address(newGridManager));
        collateralManager.revokeRole(collateralManager.GRID_MANAGER(), OLD_GRID_MANAGER_ADDR);

        collateralManager.grantRole(collateralManager.COINTAG_MANAGER(), address(newCoinTagManager));
        collateralManager.revokeRole(collateralManager.COINTAG_MANAGER(), OLD_COINTAG_MANAGER_ADDR);

        // 6.2 InvoiceNFT
        invoiceNFT.grantRole(invoiceNFT.INVOICE_MANAGER(), address(newInvoiceManager));
        invoiceNFT.revokeRole(invoiceNFT.INVOICE_MANAGER(), OLD_INVOICE_MANAGER_ADDR);

        // 6.3 UnitClaim
        unitClaim.grantRole(unitClaim.GRID_MANAGER(), address(newGridManager));
        unitClaim.revokeRole(unitClaim.GRID_MANAGER(), OLD_GRID_MANAGER_ADDR);

        // 6.4 Treasury
        treasury.grantRole(treasury.COINTAG_MANAGER(), address(newCoinTagManager));
        treasury.revokeRole(treasury.COINTAG_MANAGER(), OLD_COINTAG_MANAGER_ADDR);

        // 6.5 GridManager (OLD)
        IAccessControl(OLD_GRID_MANAGER_ADDR).revokeRole(keccak256("INVOICE_MANAGER"), OLD_INVOICE_MANAGER_ADDR);

        vm.stopBroadcast();

        // ── 7. Summary & Output ───────────────────────────────────────────────
        console.log("");
        console.log("=== Redeployment & Role Wiring Summary ===");
        console.log("Treasury (Unchanged):          ", TREASURY_ADDR);
        console.log("InvoiceNFT (Unchanged):        ", INVOICE_NFT_ADDR);
        console.log("CollateralManager (Unchanged): ", COLLATERAL_MANAGER_ADDR);
        console.log("UnitClaim (Unchanged):         ", UNIT_CLAIM_ADDR);
        console.log("PaymentManager (Unchanged):    ", PAYMENT_MANAGER_ADDR);
        console.log("GridManager (NEW):             ", address(newGridManager));
        console.log("InvoiceManager (NEW):          ", address(newInvoiceManager));
        console.log("CoinTagManager (NEW):          ", address(newCoinTagManager));

        // Write address JSON
        _writeAddressesJson(
            address(newGridManager),
            address(newInvoiceManager),
            address(newCoinTagManager)
        );
    }

    function _writeAddressesJson(
        address newGridManager,
        address newInvoiceManager,
        address newCoinTagManager
    ) internal {
        string memory obj = "deployed";
        vm.serializeAddress(obj, "treasury",          TREASURY_ADDR);
        vm.serializeAddress(obj, "invoiceNFT",        INVOICE_NFT_ADDR);
        vm.serializeAddress(obj, "collateralManager", COLLATERAL_MANAGER_ADDR);
        vm.serializeAddress(obj, "unitClaim",         UNIT_CLAIM_ADDR);
        vm.serializeAddress(obj, "gridManager",       newGridManager);
        vm.serializeAddress(obj, "invoiceManager",    newInvoiceManager);
        vm.serializeAddress(obj, "coinTagManager",    newCoinTagManager);
        string memory json = vm.serializeAddress(obj, "paymentManager", PAYMENT_MANAGER_ADDR);
        vm.writeJson(json, "contracts/out/deployed-addresses.json");
        console.log("");
        console.log("Address JSON written to contracts/out/deployed-addresses.json");
    }
}
