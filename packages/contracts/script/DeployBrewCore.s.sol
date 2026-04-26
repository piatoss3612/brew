// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IEAS} from "@eas/IEAS.sol";
import {Script, console2} from "forge-std/Script.sol";

import {AttestationVerifier} from "../src/AttestationVerifier.sol";
import {BrewEscrow} from "../src/BrewEscrow.sol";
import {IBrewEscrow} from "../src/interfaces/IBrewEscrow.sol";
import {BrewConfig} from "./BrewConfig.sol";

/// @notice Deploys BrewEscrow + AttestationVerifier and wires escrow.verifier.
contract DeployBrewCore is Script {
    function run() external returns (BrewEscrow escrow, AttestationVerifier verifier) {
        address deployer = _keystoreSigner();
        address eas = BrewConfig.SEPOLIA_EAS;

        vm.startBroadcast();
        escrow = new BrewEscrow(deployer);
        verifier = new AttestationVerifier(deployer, IEAS(eas), IBrewEscrow(address(escrow)));
        escrow.setVerifier(address(verifier));
        vm.stopBroadcast();

        console2.log("BREW_ESCROW_ADDRESS=%s", address(escrow));
        console2.log("BREW_VERIFIER_ADDRESS=%s", address(verifier));
        console2.log("OWNER_ADDRESS=%s", deployer);
        console2.log("BREW_DEPLOYER_ADDRESS=%s", deployer);
        console2.log("EAS_ADDRESS=%s", eas);
    }

    function _keystoreSigner() internal view returns (address) {
        address[] memory wallets = vm.getWallets();
        require(wallets.length == 1, "expected one keystore signer");

        return wallets[0];
    }
}
