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

/**
 * @title Deploy
 * @notice Deploys all 8 Veo contracts to Arc Testnet in dependency order,
 *         wires all cross-contract roles, and writes deployed addresses to
 *         contracts/out/deployed-addresses.json for post-deploy tooling.
 *
 *         After forge script completes, run:
 *           bash scripts/write-contract-config.sh
 *         to populate src/contractConfig.ts from the JSON.
 *
 * Usage:
 *   forge script contracts/script/Deploy.s.sol:Deploy \
 *     --rpc-url $ARC_TESTNET_RPC_URL \
 *     --broadcast \
 *     --private-key $DEPLOYER_PRIVATE_KEY
 *
 * Required env vars (from .env):
 *   DEPLOYER_PRIVATE_KEY   - deployer EOA private key (uint256 form, no 0x)
 *   ADMIN_ADDRESS          - Arc Studio wallet that receives admin roles
 *   ARC_USDC_ADDRESS       - USDC contract on Arc Testnet
 */
contract Deploy is Script {
    // ── Addresses ────────────────────────────────────────────────────────────
    address deployer;
    address admin;
    address usdc;

    // ── Deployed contracts ───────────────────────────────────────────────────
    Treasury          treasury;
    InvoiceNFT        invoiceNFT;
    CollateralManager collateralManager;
    UnitClaim         unitClaim;
    GridManager       gridManager;
    InvoiceManager    invoiceManager;
    CoinTagManager    coinTagManager;
    PaymentManager    paymentManager;

    function run() external {
        // ── 1. Load env ───────────────────────────────────────────────────────
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        deployer = vm.addr(deployerKey);
        admin    = vm.envAddress("ADMIN_ADDRESS");
        usdc     = vm.envAddress("ARC_USDC_ADDRESS");

        console.log("=== Veo Deploy ===");
        console.log("Deployer:", deployer);
        console.log("Admin:   ", admin);
        console.log("USDC:    ", usdc);

        vm.startBroadcast(deployerKey);

        // ── 2. Deploy in dependency order ────────────────────────────────────
        // Order: Treasury -> InvoiceNFT -> CollateralManager -> UnitClaim ->
        //        GridManager -> InvoiceManager -> CoinTagManager -> PaymentManager

        // 2.1 Treasury(address admin, address platformRecipient_)
        //     platformRecipient = ADMIN_ADDRESS (Arc Studio wallet)
        treasury = new Treasury(deployer, admin);

        // 2.2 InvoiceNFT(address admin)
        invoiceNFT = new InvoiceNFT(deployer);

        // 2.3 CollateralManager(address admin)
        collateralManager = new CollateralManager(deployer);

        // 2.4 UnitClaim(address admin)
        unitClaim = new UnitClaim(deployer);

        // 2.5 GridManager(address admin, address collateralManager_, address unitClaim_)
        gridManager = new GridManager(deployer, address(collateralManager), address(unitClaim));

        // 2.6 InvoiceManager(address admin, address collateralManager_, address invoiceNFT_, address gridManager_)
        invoiceManager = new InvoiceManager(
            deployer,
            address(collateralManager),
            address(invoiceNFT),
            address(gridManager),
            0
        );

        // 2.7 CoinTagManager(address admin, address collateralManager_, address treasury_,
        //                    address gridManager_, address invoiceManager_)
        coinTagManager = new CoinTagManager(
            deployer,
            address(collateralManager),
            address(treasury),
            address(gridManager),
            address(invoiceManager)
        );

        // 2.8 PaymentManager(address admin, address invoiceManager_)
        paymentManager = new PaymentManager(deployer, address(invoiceManager));

        // ── 3. Wire cross-contract roles ─────────────────────────────────────

        // InvoiceNFT: INVOICE_MANAGER -> InvoiceManager
        invoiceNFT.grantRole(invoiceNFT.INVOICE_MANAGER(), address(invoiceManager));

        // CollateralManager: INVOICE_MANAGER -> InvoiceManager
        collateralManager.grantRole(collateralManager.INVOICE_MANAGER(), address(invoiceManager));

        // CollateralManager: COINTAG_MANAGER -> CoinTagManager
        collateralManager.grantRole(collateralManager.COINTAG_MANAGER(), address(coinTagManager));

        // CollateralManager: GRID_MANAGER -> GridManager
        collateralManager.grantRole(collateralManager.GRID_MANAGER(), address(gridManager));

        // UnitClaim: GRID_MANAGER -> GridManager
        unitClaim.grantRole(unitClaim.GRID_MANAGER(), address(gridManager));

        // GridManager: INVOICE_MANAGER -> InvoiceManager
        gridManager.grantRole(gridManager.INVOICE_MANAGER(), address(invoiceManager));

        // GridManager: COINTAG_MANAGER -> CoinTagManager
        gridManager.grantRole(gridManager.COINTAG_MANAGER(), address(coinTagManager));

        // Treasury: COINTAG_MANAGER -> CoinTagManager
        treasury.grantRole(treasury.COINTAG_MANAGER(), address(coinTagManager));

        // PaymentManager: no cross-contract roles needed.
        // markPaidByPayment() on InvoiceManager is ungated (public).

        // ── 4. Operational roles → Admin ─────────────────────────────────────
        // These gate admin-only functions: withdraw, sweep dust, mark paid, etc.

        // Treasury: Admin can withdraw platform revenue
        treasury.grantRole(treasury.TREASURY_MANAGER(), admin);

        // Treasury: Admin can sweep dust
        treasury.grantRole(treasury.SWEEP_ROLE(), admin);

        // InvoiceNFT: Admin can unlock soulbound NFT transfers
        invoiceNFT.grantRole(invoiceNFT.TRANSFER_ROLE(), admin);

        // CollateralManager: Admin can sweep dust from completed pools
        collateralManager.grantRole(collateralManager.SWEEP_ROLE(), admin);

        // ── 5. CoinTagManager initial config ─────────────────────────────────

        // Allowlist USDC
        coinTagManager.setAllowlistedStablecoin(usdc, true);

        // Global CoinTag price: 1 USDC (6 decimals)
        coinTagManager.setGlobalCoinTagPrice(1_000_000);

        // ── 6. Grant DEFAULT_ADMIN_ROLE to Arc Studio admin on all 8 contracts ─
        // Deployer intentionally keeps its own DEFAULT_ADMIN_ROLE.
        // Renouncing is a mainnet-finalization step, not a testnet step.
        bytes32 dar = bytes32(0); // DEFAULT_ADMIN_ROLE = 0x00

        treasury.grantRole(dar,          admin);
        invoiceNFT.grantRole(dar,        admin);
        collateralManager.grantRole(dar, admin);
        unitClaim.grantRole(dar,         admin);
        gridManager.grantRole(dar,       admin);
        invoiceManager.grantRole(dar,    admin);
        coinTagManager.grantRole(dar,    admin);
        paymentManager.grantRole(dar,    admin);

        vm.stopBroadcast();

        // ── 7. Print summary ─────────────────────────────────────────────────
        console.log("");
        console.log("=== Deployed addresses ===");
        console.log("Treasury:          ", address(treasury));
        console.log("InvoiceNFT:        ", address(invoiceNFT));
        console.log("CollateralManager: ", address(collateralManager));
        console.log("UnitClaim:         ", address(unitClaim));
        console.log("GridManager:       ", address(gridManager));
        console.log("InvoiceManager:    ", address(invoiceManager));
        console.log("CoinTagManager:    ", address(coinTagManager));
        console.log("PaymentManager:    ", address(paymentManager));

        // ── 8. Write addresses JSON for post-deploy contractConfig.ts update ─
        _writeAddressesJson();
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _writeAddressesJson() internal {
        // Write a compact JSON file with just the addresses.
        // The bash post-deploy script (scripts/write-contract-config.sh)
        // reads this file and regenerates src/contractConfig.ts.
        string memory obj = "deployed";
        vm.serializeAddress(obj, "treasury",          address(treasury));
        vm.serializeAddress(obj, "invoiceNFT",        address(invoiceNFT));
        vm.serializeAddress(obj, "collateralManager", address(collateralManager));
        vm.serializeAddress(obj, "unitClaim",         address(unitClaim));
        vm.serializeAddress(obj, "gridManager",       address(gridManager));
        vm.serializeAddress(obj, "invoiceManager",    address(invoiceManager));
        vm.serializeAddress(obj, "coinTagManager",    address(coinTagManager));
        string memory json = vm.serializeAddress(obj, "paymentManager", address(paymentManager));
        vm.writeJson(json, "contracts/out/deployed-addresses.json");
        console.log("");
        console.log("Address JSON: contracts/out/deployed-addresses.json");
        console.log("Run: bash scripts/write-contract-config.sh");
    }
}
