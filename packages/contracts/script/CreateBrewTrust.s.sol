// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script, console2} from "forge-std/Script.sol";

import {BrewEscrow} from "../src/BrewEscrow.sol";
import {IBrewEscrow} from "../src/interfaces/IBrewEscrow.sol";
import {BrewConfig} from "./BrewConfig.sol";

/// @notice Creates one real Base Sepolia trust for subgraph and UI smoke testing.
contract CreateBrewTrust is Script {
    uint256 internal constant AMOUNT = 10 * 1e6;
    uint64 internal constant DEADLINE = 0;

    function run() external returns (uint256 trustId) {
        console2.log("STEP 1/5 load signer and inputs");
        address sponsor = _keystoreSigner();
        BrewEscrow escrow = BrewEscrow(vm.envAddress("BREW_ESCROW_ADDRESS"));
        IERC20 token = IERC20(_requiredAddress("DEMO_TOKEN_ADDRESS"));
        address beneficiary = _optionalAddress("BREW_BENEFICIARY_ADDRESS");
        if (beneficiary == address(0)) {
            beneficiary = sponsor;
        }

        console2.log("SPONSOR=%s", sponsor);
        console2.log("BENEFICIARY=%s", beneficiary);
        console2.log("BREW_ESCROW_ADDRESS=%s", address(escrow));
        console2.log("TOKEN=%s", address(token));
        console2.log("AMOUNT=%s", AMOUNT);
        console2.log("TEMPLATE_ID=");
        console2.logBytes32(BrewConfig.DAO_GRANT_TEMPLATE_ID);

        console2.log("STEP 2/5 check sponsor balance");
        uint256 balance = token.balanceOf(sponsor);
        console2.log("SPONSOR_TOKEN_BALANCE=%s", balance);
        require(balance >= AMOUNT, "insufficient token balance");

        console2.log("STEP 3/5 approve escrow");
        uint256 allowance = token.allowance(sponsor, address(escrow));
        console2.log("CURRENT_ALLOWANCE=%s", allowance);

        vm.startBroadcast();
        if (allowance < AMOUNT) {
            token.approve(address(escrow), AMOUNT);
            console2.log("APPROVED_AMOUNT=%s", AMOUNT);
        } else {
            console2.log("APPROVAL_ALREADY_SUFFICIENT=true");
        }

        console2.log("STEP 4/5 create trust");
        trustId = escrow.createTrust(beneficiary, address(token), AMOUNT, DEADLINE, BrewConfig.DAO_GRANT_TEMPLATE_ID);
        vm.stopBroadcast();

        console2.log("STEP 5/5 confirm trust state");
        IBrewEscrow.Trust memory trust = escrow.trusts(trustId);
        require(trust.sponsor == sponsor, "unexpected sponsor");
        require(trust.beneficiary == beneficiary, "unexpected beneficiary");
        require(trust.token == address(token), "unexpected token");
        require(trust.amount == AMOUNT, "unexpected amount");
        require(trust.templateId == BrewConfig.DAO_GRANT_TEMPLATE_ID, "unexpected template");
        require(!trust.released && !trust.refunded, "unexpected terminal state");

        console2.log("BREW_TRUST_CREATED=true");
        console2.log("TRUST_ID=%s", trustId);
        console2.log("TRUST_STATUS=PENDING");
        console2.log("TRUST_CREATED_TX_CHECK_SUBGRAPH=true");
    }

    function _keystoreSigner() internal view returns (address) {
        address[] memory wallets = vm.getWallets();
        require(wallets.length == 1, "expected one keystore signer");

        return wallets[0];
    }

    function _requiredAddress(string memory name) internal view returns (address value) {
        value = _optionalAddress(name);
        require(value != address(0), "missing address env");
    }

    function _optionalAddress(string memory name) internal view returns (address) {
        if (!vm.envExists(name)) {
            return address(0);
        }

        string memory raw = vm.envString(name);
        bytes memory value = bytes(raw);
        if (value.length == 0 || value.length == 2) {
            return address(0);
        }
        if (value.length < 2 || value[0] != 0x30 || (value[1] != 0x78 && value[1] != 0x58)) {
            return address(0);
        }

        return vm.parseAddress(raw);
    }
}
