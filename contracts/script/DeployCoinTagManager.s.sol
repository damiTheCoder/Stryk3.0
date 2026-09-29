// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {CoinTagManager}   from "../CoinTagManager.sol";
import {Treasury}         from "../Treasury.sol";
import {CollateralManager}from "../CollateralManager.sol";
import {GridManager}      from "../GridManager.sol";

/**
 * @title DeployCoinTagManager
 * @notice Redeploys CoinTagManager with the correct InvoiceManager reference
 *         (0x9655A3ca774819B241C4e291ef1cb33759d375A2) and migrates COINTAG_MANAGER roles.
 */
contract DeployCoinTagManager is Script {
    address constant COLLATERAL_MANAGER_ADDR = 0x7814f445fd67d10B0ab0b6a67141092D4F6C01f1;
    address constant TREASURY_ADDR           = 0x0948EE3ce053D3c5d9B0D32F8b349785f6BB1ABD;
    address constant GRID_MANAGER_ADDR       = 0x58c702eAa8e273900977230F4c08893d82624D00;
    address constant INVOICE_MANAGER_ADDR    = 0x9655A3ca774819B241C4e291ef1cb33759d375A2;
    address constant OLD_COINTAG_MANAGER_ADDR= 0xFb72b1BD40cAc314c310CdF412E4356ADedE6a77;
    address constant USDC_ADDR               = 0x3600000000000000000000000000000000000000;
    address constant ADMIN_ADDR              = 0x46A5956424A9543AEa584227ED667FD6b8EbD565;

    bytes32 constant DEFAULT_ADMIN_ROLE = bytes32(0);

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        console.log("=== DeployCoinTagManager ===");
        console.log("Deployer: ", deployer);
        console.log("Admin:    ", ADMIN_ADDR);

        Treasury treasury                   = Treasury(TREASURY_ADDR);
        CollateralManager collateralManager = CollateralManager(COLLATERAL_MANAGER_ADDR);
        GridManager gridManager             = GridManager(GRID_MANAGER_ADDR);

        vm.startBroadcast(deployerKey);

        // 1. Deploy new CoinTagManager with deployer as initial admin
        CoinTagManager newCoinTagManager = new CoinTagManager(
            deployer,
            COLLATERAL_MANAGER_ADDR,
            TREASURY_ADDR,
            GRID_MANAGER_ADDR,
            INVOICE_MANAGER_ADDR
        );
        console.log("New CoinTagManager deployed at: ", address(newCoinTagManager));

        // 2. Configure CoinTagManager
        newCoinTagManager.setAllowlistedStablecoin(USDC_ADDR, true);
        newCoinTagManager.setGlobalCoinTagPrice(1_000_000); // 1 USDC (6 decimals)
        newCoinTagManager.grantRole(DEFAULT_ADMIN_ROLE, ADMIN_ADDR);

        // 3. Migrate COINTAG_MANAGER roles on Treasury, CollateralManager, GridManager
        treasury.grantRole(treasury.COINTAG_MANAGER(), address(newCoinTagManager));
        treasury.revokeRole(treasury.COINTAG_MANAGER(), OLD_COINTAG_MANAGER_ADDR);
        console.log("Treasury COINTAG_MANAGER role updated");

        collateralManager.grantRole(collateralManager.COINTAG_MANAGER(), address(newCoinTagManager));
        collateralManager.revokeRole(collateralManager.COINTAG_MANAGER(), OLD_COINTAG_MANAGER_ADDR);
        console.log("CollateralManager COINTAG_MANAGER role updated");

        gridManager.grantRole(gridManager.COINTAG_MANAGER(), address(newCoinTagManager));
        gridManager.revokeRole(gridManager.COINTAG_MANAGER(), OLD_COINTAG_MANAGER_ADDR);
        console.log("GridManager COINTAG_MANAGER role updated");

        vm.stopBroadcast();

        console.log("=== Redeployment Complete ===");
        console.log("CoinTagManager (NEW): ", address(newCoinTagManager));
    }
}
