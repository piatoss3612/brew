// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISchemaRegistry, SchemaRecord} from "@eas/ISchemaRegistry.sol";
import {ISchemaResolver} from "@eas/resolver/ISchemaResolver.sol";
import {Script, console2} from "forge-std/Script.sol";

import {BrewConfig} from "./BrewConfig.sol";

/// @notice Registers or reuses the four public-audit EAS schemas used by Brew v1.
contract RegisterBrewSchemas is Script {
    ISchemaResolver internal constant NO_RESOLVER = ISchemaResolver(address(0));
    bool internal constant REVOCABLE = true;

    function run() external {
        address deployer = _keystoreSigner();
        address registryAddress = BrewConfig.SEPOLIA_SCHEMA_REGISTRY;
        ISchemaRegistry registry = ISchemaRegistry(registryAddress);

        vm.startBroadcast();
        bytes32 workplace = _registerOrReuse(registry, "workplace", BrewConfig.WORKPLACE_SCHEMA);
        bytes32 degree = _registerOrReuse(registry, "degree", BrewConfig.DEGREE_SCHEMA);
        bytes32 daoGrant = _registerOrReuse(registry, "dao_grant", BrewConfig.DAO_GRANT_SCHEMA);
        bytes32 fellowship = _registerOrReuse(registry, "fellowship", BrewConfig.FELLOWSHIP_SCHEMA);
        vm.stopBroadcast();

        console2.log("EAS_SCHEMA_REGISTRY_ADDRESS=%s", registryAddress);
        console2.log("BREW_DEPLOYER_ADDRESS=%s", deployer);
        console2.log("WORKPLACE_SCHEMA_UID=");
        console2.logBytes32(workplace);
        console2.log("DEGREE_SCHEMA_UID=");
        console2.logBytes32(degree);
        console2.log("DAO_GRANT_SCHEMA_UID=");
        console2.logBytes32(daoGrant);
        console2.log("FELLOWSHIP_SCHEMA_UID=");
        console2.logBytes32(fellowship);
    }

    function _registerOrReuse(ISchemaRegistry registry, string memory label, string memory schema)
        internal
        returns (bytes32 uid)
    {
        uid = BrewConfig.schemaUid(schema);
        SchemaRecord memory existing = registry.getSchema(uid);

        if (existing.uid == bytes32(0)) {
            uid = registry.register(schema, NO_RESOLVER, REVOCABLE);
            console2.log("registered %s", label);
        } else {
            console2.log("reused %s", label);
        }
    }

    function _keystoreSigner() internal view returns (address) {
        address[] memory wallets = vm.getWallets();
        require(wallets.length == 1, "expected one keystore signer");

        return wallets[0];
    }
}
