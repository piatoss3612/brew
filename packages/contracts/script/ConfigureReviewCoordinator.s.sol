// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {AttestationVerifier} from "../src/AttestationVerifier.sol";

contract ConfigureReviewCoordinator is Script {
    function run() external {
        address verifierAddress = vm.envAddress("BREW_VERIFIER_ADDRESS");
        address coordinator = _reviewCoordinator();

        AttestationVerifier verifier = AttestationVerifier(verifierAddress);

        vm.startBroadcast();
        verifier.setReviewCoordinatorAllowed(coordinator, true);
        vm.stopBroadcast();

        console2.log("Configured Brew review coordinator");
        console2.log("BREW_VERIFIER_ADDRESS", verifierAddress);
        console2.log("BREW_REVIEW_COORDINATOR_ADDRESS", coordinator);
    }

    function _reviewCoordinator() internal view returns (address) {
        if (!vm.envExists("BREW_REVIEW_COORDINATOR_ADDRESS")) {
            return _keystoreSigner();
        }

        string memory raw = vm.envString("BREW_REVIEW_COORDINATOR_ADDRESS");
        bytes memory value = bytes(raw);
        if (value.length == 0 || value.length == 2) {
            return _keystoreSigner();
        }

        return vm.parseAddress(raw);
    }

    function _keystoreSigner() internal view returns (address) {
        address[] memory wallets = vm.getWallets();
        require(wallets.length > 0, "expected at least one keystore signer");

        return wallets[0];
    }
}
