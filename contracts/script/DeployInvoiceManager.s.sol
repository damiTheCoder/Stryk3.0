// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {InvoiceManager} from "../InvoiceManager.sol";
import {CollateralManager} from "../CollateralManager.sol";
import {InvoiceNFT} from "../InvoiceNFT.sol";
import {GridManager} from "../GridManager.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract DeployInvoiceManager is Script {
    address constant COLLATERAL_MANAGER_ADDR = 0x7814f445fd67d10B0ab0b6a67141092D4F6C01f1;
    address constant INVOICE_NFT_ADDR        = 0xBeff9105ae281aE07943cD263466b34C2737e419;
    address constant GRID_MANAGER_ADDR       = 0x58c702eAa8e273900977230F4c08893d82624D00;
    address constant OLD_GRID_MANAGER_ADDR   = 0x1b12076Fe0f6CaD2cA08CBe0920448714F2ba7Ae;
    address constant PREV_INVOICE_MANAGER    = 0x614203460Df6A41f50d5Cf1F20D20E8B130f8967;

    bytes32 constant DEFAULT_ADMIN_ROLE = bytes32(0);
    bytes32 constant INVOICE_MANAGER_ROLE = keccak256("INVOICE_MANAGER");

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        address admin       = vm.envAddress("ADMIN_ADDRESS");

        console.log("=== Deploying Configurable InvoiceManager ===");
        console.log("Deployer: ", deployer);
        console.log("Admin:    ", admin);
        console.log("Starting Invoice ID: 6");

        vm.startBroadcast(deployerKey);

        InvoiceManager newInvoiceManager = new InvoiceManager(
            deployer,
            COLLATERAL_MANAGER_ADDR,
            INVOICE_NFT_ADDR,
            GRID_MANAGER_ADDR,
            6
        );
        console.log("New InvoiceManager deployed at:", address(newInvoiceManager));

        // Grant Admin to admin address
        newInvoiceManager.grantRole(DEFAULT_ADMIN_ROLE, admin);

        // Grant INVOICE_MANAGER role to new InvoiceManager and revoke from previous
        // 1. CollateralManager
        CollateralManager cm = CollateralManager(COLLATERAL_MANAGER_ADDR);
        cm.grantRole(INVOICE_MANAGER_ROLE, address(newInvoiceManager));
        cm.revokeRole(INVOICE_MANAGER_ROLE, PREV_INVOICE_MANAGER);

        // 2. InvoiceNFT
        InvoiceNFT nft = InvoiceNFT(INVOICE_NFT_ADDR);
        nft.grantRole(INVOICE_MANAGER_ROLE, address(newInvoiceManager));
        nft.revokeRole(INVOICE_MANAGER_ROLE, PREV_INVOICE_MANAGER);

        // 3. GridManager (current)
        GridManager gm = GridManager(GRID_MANAGER_ADDR);
        gm.grantRole(INVOICE_MANAGER_ROLE, address(newInvoiceManager));
        gm.revokeRole(INVOICE_MANAGER_ROLE, PREV_INVOICE_MANAGER);

        // 4. Old GridManager (if role still held)
        try IAccessControl(OLD_GRID_MANAGER_ADDR).grantRole(INVOICE_MANAGER_ROLE, address(newInvoiceManager)) {} catch {}
        try IAccessControl(OLD_GRID_MANAGER_ADDR).revokeRole(INVOICE_MANAGER_ROLE, PREV_INVOICE_MANAGER) {} catch {}

        vm.stopBroadcast();

        console.log("Role migration complete.");
    }
}
