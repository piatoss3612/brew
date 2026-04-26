// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AttestationRequest, AttestationRequestData, IEAS} from "@eas/IEAS.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script, console2} from "forge-std/Script.sol";

import {AttestationVerifier} from "../src/AttestationVerifier.sol";
import {BrewEscrow} from "../src/BrewEscrow.sol";
import {BrewConfig} from "./BrewConfig.sol";

interface IMintableERC20 is IERC20 {
    function mint(address account, uint256 amount) external;
}

contract ForkBrewToken is ERC20 {
    constructor() ERC20("Fork Brew Token", "BREW") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

/// @notice Full happy-path simulation against the deployed Sepolia contracts.
/// @dev Run without --broadcast. EAS UIDs include block.timestamp, so live
///      attestation + release must be split into separate real transactions.
contract SimulateBrewHappyPath is Script {
    uint256 internal constant AMOUNT = 10 * 1e6;

    function run() external {
        console2.log("STEP 1/8 load signer and deployed contracts");
        address actor = _keystoreSigner();
        BrewEscrow escrow = BrewEscrow(vm.envAddress("BREW_ESCROW_ADDRESS"));
        AttestationVerifier verifier = AttestationVerifier(vm.envAddress("BREW_VERIFIER_ADDRESS"));
        IEAS eas = IEAS(BrewConfig.SEPOLIA_EAS);
        console2.log("ACTOR=%s", actor);
        console2.log("BREW_ESCROW_ADDRESS=%s", address(escrow));
        console2.log("BREW_VERIFIER_ADDRESS=%s", address(verifier));
        console2.log("EAS_ADDRESS=%s", address(eas));

        console2.log("STEP 2/8 prepare simulation token");
        address tokenAddress = _optionalAddress("DEMO_TOKEN_ADDRESS");
        IMintableERC20 token;
        if (tokenAddress == address(0)) {
            token = IMintableERC20(address(new ForkBrewToken()));
            console2.log("FORK_TOKEN_DEPLOYED=true");
        } else {
            token = IMintableERC20(tokenAddress);
            console2.log("FORK_TOKEN_DEPLOYED=false");
        }
        console2.log("TOKEN=%s", address(token));

        console2.log("STEP 3/8 record initial beneficiary balance");
        uint256 beforeBalance = token.balanceOf(actor);
        console2.log("BALANCE_BEFORE=%s", beforeBalance);

        vm.startPrank(actor);

        console2.log("STEP 4/8 mint simulation funds");
        token.mint(actor, AMOUNT);
        console2.log("MINTED_AMOUNT=%s", AMOUNT);
        console2.log("BALANCE_AFTER_MINT=%s", token.balanceOf(actor));

        console2.log("STEP 5/8 approve escrow");
        token.approve(address(escrow), AMOUNT);
        console2.log("ESCROW_ALLOWANCE=%s", token.allowance(actor, address(escrow)));

        console2.log("STEP 6/8 create trust");
        uint256 trustId = escrow.createTrust(actor, address(token), AMOUNT, 0, BrewConfig.DAO_GRANT_TEMPLATE_ID);
        console2.log("TRUST_ID=%s", trustId);
        console2.log("TRUST_TEMPLATE_ID=");
        console2.logBytes32(BrewConfig.DAO_GRANT_TEMPLATE_ID);
        console2.log("TRUST_BENEFICIARY=%s", actor);
        console2.log("TRUST_AMOUNT=%s", AMOUNT);

        console2.log("STEP 7/8 issue EAS attestation");
        bytes32 attestationUid = eas.attest(_attestationRequest(actor));
        console2.log("ATTESTATION_SCHEMA_UID=");
        console2.logBytes32(BrewConfig.DAO_GRANT_SCHEMA_UID);
        console2.log("ATTESTATION_UID=");
        console2.logBytes32(attestationUid);

        console2.log("STEP 8/8 verify attestation and release funds");
        verifier.verifyAndRelease(trustId, actor, attestationUid);
        vm.stopPrank();

        require(escrow.isReleased(trustId, actor), "trust was not released");
        require(verifier.consumed(attestationUid), "attestation was not consumed");
        require(token.balanceOf(actor) == beforeBalance + AMOUNT, "unexpected final token balance");
        console2.log("RELEASE_CONFIRMED=true");
        console2.log("ATTESTATION_CONSUMED=true");
        console2.log("BALANCE_AFTER_RELEASE=%s", token.balanceOf(actor));

        console2.log("BREW_HAPPY_PATH_SIMULATED=true");
        console2.log("SMOKE_TRUST_ID=%s", trustId);
        console2.log("SIMULATED_ATTESTATION_UID=");
        console2.logBytes32(attestationUid);
        console2.log("BENEFICIARY=%s", actor);
        console2.log("TOKEN=%s", address(token));
        console2.log("AMOUNT=%s", AMOUNT);
    }

    function _attestationRequest(address beneficiary) internal view returns (AttestationRequest memory) {
        return AttestationRequest({
            schema: BrewConfig.DAO_GRANT_SCHEMA_UID,
            data: AttestationRequestData({
                recipient: beneficiary,
                expirationTime: uint64(block.timestamp + 7 days),
                revocable: true,
                refUID: bytes32(0),
                data: abi.encode(uint8(1), "ipfs://brew-smoke", keccak256("brew-smoke")),
                value: 0
            })
        });
    }

    function _keystoreSigner() internal view returns (address) {
        address[] memory wallets = vm.getWallets();
        require(wallets.length == 1, "expected one keystore signer");

        return wallets[0];
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
