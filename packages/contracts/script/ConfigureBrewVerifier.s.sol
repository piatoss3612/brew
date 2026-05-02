// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";

import {AttestationVerifier} from "../src/AttestationVerifier.sol";
import {BrewConfig} from "./BrewConfig.sol";

/// @notice Registers Brew templates and allowlists their issuers in AttestationVerifier.
contract ConfigureBrewVerifier is Script {
    function run() external {
        address owner = _keystoreSigner();
        address demoIssuer = owner;
        AttestationVerifier verifier = AttestationVerifier(vm.envAddress("BREW_VERIFIER_ADDRESS"));
        bool demoOpenIssuerMode = vm.envOr("BREW_DEMO_OPEN_ISSUER_MODE", false);

        vm.startBroadcast();
        _configure(
            verifier,
            "workplace_verified",
            BrewConfig.WORKPLACE_TEMPLATE_ID,
            BrewConfig.workplaceSchemaUid(),
            BrewConfig.WORKPLACE_EXPIRY_WINDOW,
            BrewConfig.WORKPLACE_STALENESS_WINDOW,
            demoIssuer
        );
        _configure(
            verifier,
            "degree_verified",
            BrewConfig.DEGREE_TEMPLATE_ID,
            BrewConfig.degreeSchemaUid(),
            BrewConfig.DEGREE_EXPIRY_WINDOW,
            BrewConfig.DEGREE_STALENESS_WINDOW,
            demoIssuer
        );
        _configure(
            verifier,
            "dao_grant",
            BrewConfig.DAO_GRANT_TEMPLATE_ID,
            BrewConfig.daoGrantSchemaUid(),
            BrewConfig.DAO_GRANT_EXPIRY_WINDOW,
            BrewConfig.DAO_GRANT_STALENESS_WINDOW,
            demoIssuer
        );
        _configure(
            verifier,
            "fellowship_milestone",
            BrewConfig.FELLOWSHIP_TEMPLATE_ID,
            BrewConfig.fellowshipSchemaUid(),
            BrewConfig.FELLOWSHIP_EXPIRY_WINDOW,
            BrewConfig.FELLOWSHIP_STALENESS_WINDOW,
            demoIssuer
        );
        verifier.setDemoOpenIssuerMode(demoOpenIssuerMode);
        vm.stopBroadcast();

        console2.log("BREW_CONFIG_SENDER=%s", owner);
        console2.log("DEMO_ISSUER_ADDRESS=%s", demoIssuer);
        if (demoOpenIssuerMode) {
            console2.log("DEMO_OPEN_ISSUER_MODE=true");
        } else {
            console2.log("DEMO_OPEN_ISSUER_MODE=false");
        }
    }

    function _configure(
        AttestationVerifier verifier,
        string memory label,
        bytes32 templateId,
        bytes32 schemaUid,
        uint64 expiryWindow,
        uint64 stalenessWindow,
        address issuer
    ) internal {
        AttestationVerifier.Template memory template = verifier.getTemplate(templateId);
        if (!template.registered) {
            verifier.registerTemplate(templateId, schemaUid, expiryWindow, stalenessWindow);
            console2.log("registered template %s", label);
        } else {
            require(template.schemaUid == schemaUid, "template schema mismatch");
            console2.log("template already registered %s", label);
        }

        verifier.setIssuerAllowed(templateId, issuer, true);
        console2.log("allowlisted issuer for %s: %s", label, issuer);
        console2.logBytes32(templateId);
    }

    function _keystoreSigner() internal view returns (address) {
        address[] memory wallets = vm.getWallets();
        require(wallets.length == 1, "expected one keystore signer");

        return wallets[0];
    }
}
