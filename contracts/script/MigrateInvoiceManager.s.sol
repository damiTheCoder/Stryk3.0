// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {InvoiceNFT}        from "../InvoiceNFT.sol";
import {CollateralManager} from "../CollateralManager.sol";
import {GridManager}       from "../GridManager.sol";
import {InvoiceManager}    from "../InvoiceManager.sol";

/**
 * @title MigrateInvoiceManager
 * @notice Deploys the restructured InvoiceManager (with single-transaction tokenizeInvoice)
 *         and performs role migration on CollateralManager, InvoiceNFT, and GridManager.
 */
contract MigrateInvoiceManager is Script {
    address constant COLLATERAL_MANAGER_ADDR = 0x7814f445fd67d10B0ab0b6a67141092D4F6C01f1;
    address constant INVOICE_NFT_ADDR        = 0xBeff9105ae281aE07943cD263466b34C2737e419;
    address constant GRID_MANAGER_ADDR       = 0x58c702eAa8e273900977230F4c08893d82624D00;
    address constant OLD_INVOICE_MANAGER_ADDR = 0xB5e3aCAd7C3A7bd4A159Dc430cE33DF24d8FA41F;

    bytes32 constant DEFAULT_ADMIN_ROLE = bytes32(0);

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        address admin       = vm.envAddress("ADMIN_ADDRESS");

        console.log("=== Veo InvoiceManager Migration ===");
        console.log("Deployer: ", deployer);
        console.log("Admin:    ", admin);

        CollateralManager collateralManager = CollateralManager(COLLATERAL_MANAGER_ADDR);
        InvoiceNFT invoiceNFT               = InvoiceNFT(INVOICE_NFT_ADDR);
        GridManager gridManager             = GridManager(GRID_MANAGER_ADDR);

        vm.startBroadcast(deployerKey);

        // 1. Deploy new restructured InvoiceManager
        InvoiceManager newInvoiceManager = new InvoiceManager(
            deployer,
            COLLATERAL_MANAGER_ADDR,
            INVOICE_NFT_ADDR,
            GRID_MANAGER_ADDR,
            6
        );
        console.log("New InvoiceManager deployed at: ", address(newInvoiceManager));

        // 2. Grant admin role on new InvoiceManager to admin
        newInvoiceManager.grantRole(DEFAULT_ADMIN_ROLE, admin);

        // 3. Role migration on CollateralManager
        collateralManager.grantRole(collateralManager.INVOICE_MANAGER(), address(newInvoiceManager));
        collateralManager.revokeRole(collateralManager.INVOICE_MANAGER(), OLD_INVOICE_MANAGER_ADDR);
        console.log("CollateralManager INVOICE_MANAGER role updated");

        // 4. Role migration on InvoiceNFT
        invoiceNFT.grantRole(invoiceNFT.INVOICE_MANAGER(), address(newInvoiceManager));
        invoiceNFT.revokeRole(invoiceNFT.INVOICE_MANAGER(), OLD_INVOICE_MANAGER_ADDR);
        console.log("InvoiceNFT INVOICE_MANAGER role updated");

        // 5. Role migration on GridManager
        gridManager.grantRole(gridManager.INVOICE_MANAGER(), address(newInvoiceManager));
        gridManager.revokeRole(gridManager.INVOICE_MANAGER(), OLD_INVOICE_MANAGER_ADDR);
        console.log("GridManager INVOICE_MANAGER role updated");

        vm.stopBroadcast();

        console.log("=== Migration Complete ===");
        console.log("InvoiceManager (NEW): ", address(newInvoiceManager));
    }
}
