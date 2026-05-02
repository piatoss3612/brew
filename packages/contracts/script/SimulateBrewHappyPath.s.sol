// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AttestationRequest, AttestationRequestData, IEAS} from "@eas/IEAS.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Script, console2} from "forge-std/Script.sol";

import {AttestationVerifier} from "../src/AttestationVerifier.sol";
import {BrewEscrow} from "../src/BrewEscrow.sol";
import {IAttestationVerifier} from "../src/interfaces/IAttestationVerifier.sol";
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

/// @notice Full happy-path simulation against the deployed Base Sepolia contracts.
/// @dev Run without --broadcast. EAS UIDs include block.timestamp, so live
///      attestation + release must be split into separate real transactions.
contract SimulateBrewHappyPath is Script {
    uint256 internal constant AMOUNT = 10 * 1e6;

    address internal actor;
    uint256 internal coordinatorPrivateKey;
    address internal coordinator;
    BrewEscrow internal escrow;
    AttestationVerifier internal verifier;
    IEAS internal eas;
    IMintableERC20 internal token;
    uint256 internal beforeBalance;
    uint256 internal trustId;
    bytes32 internal attestationUid;
    bytes32 internal receiptDigest;

    function run() external {
        console2.log("STEP 1/9 load signer and deployed contracts");
        actor = _keystoreSigner();
        coordinatorPrivateKey = vm.envUint("BREW_REVIEW_COORDINATOR_PRIVATE_KEY");
        coordinator = vm.addr(coordinatorPrivateKey);
        escrow = BrewEscrow(vm.envAddress("BREW_ESCROW_ADDRESS"));
        verifier = AttestationVerifier(vm.envAddress("BREW_VERIFIER_ADDRESS"));
        eas = IEAS(BrewConfig.BASE_SEPOLIA_EAS);
        console2.log("ACTOR=%s", actor);
        console2.log("BREW_REVIEW_COORDINATOR_ADDRESS=%s", coordinator);
        console2.log("BREW_ESCROW_ADDRESS=%s", address(escrow));
        console2.log("BREW_VERIFIER_ADDRESS=%s", address(verifier));
        console2.log("EAS_ADDRESS=%s", address(eas));
        require(verifier.isReviewCoordinatorAllowed(coordinator), "coordinator is not allowlisted");

        console2.log("STEP 2/9 prepare simulation token");
        address tokenAddress = _optionalAddress("DEMO_TOKEN_ADDRESS");
        if (tokenAddress == address(0)) {
            token = IMintableERC20(address(new ForkBrewToken()));
            console2.log("FORK_TOKEN_DEPLOYED=true");
        } else {
            token = IMintableERC20(tokenAddress);
            console2.log("FORK_TOKEN_DEPLOYED=false");
        }
        console2.log("TOKEN=%s", address(token));

        console2.log("STEP 3/9 record initial beneficiary balance");
        beforeBalance = token.balanceOf(actor);
        console2.log("BALANCE_BEFORE=%s", beforeBalance);

        vm.startPrank(actor);

        console2.log("STEP 4/9 mint simulation funds");
        token.mint(actor, AMOUNT);
        console2.log("MINTED_AMOUNT=%s", AMOUNT);
        console2.log("BALANCE_AFTER_MINT=%s", token.balanceOf(actor));

        console2.log("STEP 5/9 approve escrow");
        token.approve(address(escrow), AMOUNT);
        console2.log("ESCROW_ALLOWANCE=%s", token.allowance(actor, address(escrow)));

        console2.log("STEP 6/9 create trust");
        trustId = escrow.createTrust(actor, address(token), AMOUNT, 0, BrewConfig.DAO_GRANT_TEMPLATE_ID);
        console2.log("TRUST_ID=%s", trustId);
        console2.log("TRUST_TEMPLATE_ID=");
        console2.logBytes32(BrewConfig.DAO_GRANT_TEMPLATE_ID);
        console2.log("TRUST_BENEFICIARY=%s", actor);
        console2.log("TRUST_AMOUNT=%s", AMOUNT);

        console2.log("STEP 7/9 issue EAS attestation");
        attestationUid = eas.attest(_attestationRequest(actor));
        console2.log("ATTESTATION_SCHEMA_UID=");
        console2.logBytes32(BrewConfig.DAO_GRANT_SCHEMA_UID);
        console2.log("ATTESTATION_UID=");
        console2.logBytes32(attestationUid);

        console2.log("STEP 8/9 sign review receipt");
        IAttestationVerifier.ReviewReceipt memory reviewReceipt =
            _reviewReceipt(trustId, actor, attestationUid, coordinator);
        bytes memory coordinatorSignature = _signReceipt(reviewReceipt, coordinatorPrivateKey);
        receiptDigest = verifier.digestReviewReceipt(reviewReceipt);
        console2.log("REVIEW_RECEIPT_DIGEST=");
        console2.logBytes32(receiptDigest);

        console2.log("STEP 9/9 verify receipt fields + attestation and release funds");
        verifier.verifyAndReleaseWithReceiptFields(
            trustId,
            actor,
            attestationUid,
            reviewReceipt.receiptRoot,
            reviewReceipt.receiptUri,
            reviewReceipt.coordinator,
            reviewReceipt.createdAt,
            reviewReceipt.expiresAt,
            coordinatorSignature
        );
        vm.stopPrank();

        require(escrow.isReleased(trustId, actor), "trust was not released");
        require(verifier.consumed(attestationUid), "attestation was not consumed");
        require(token.balanceOf(actor) == beforeBalance + AMOUNT, "unexpected final token balance");
        console2.log("RELEASE_CONFIRMED=true");
        console2.log("ATTESTATION_CONSUMED=true");
        console2.log("REVIEW_RECEIPT_ACCEPTED=true");
        console2.log("BALANCE_AFTER_RELEASE=%s", token.balanceOf(actor));

        console2.log("BREW_HAPPY_PATH_SIMULATED=true");
        console2.log("SMOKE_TRUST_ID=%s", trustId);
        console2.log("SIMULATED_ATTESTATION_UID=");
        console2.logBytes32(attestationUid);
        console2.log("SIMULATED_REVIEW_RECEIPT_DIGEST=");
        console2.logBytes32(receiptDigest);
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

    function _reviewReceipt(uint256 receiptTrustId, address receiptBeneficiary, bytes32 uid, address signer)
        internal
        view
        returns (IAttestationVerifier.ReviewReceipt memory)
    {
        return IAttestationVerifier.ReviewReceipt({
            trustId: receiptTrustId,
            beneficiary: receiptBeneficiary,
            attestationUid: uid,
            templateId: BrewConfig.DAO_GRANT_TEMPLATE_ID,
            receiptRoot: keccak256(abi.encode("brew-smoke-review", receiptTrustId, receiptBeneficiary, uid)),
            receiptUri: "0g://review-receipts/fork-smoke",
            coordinator: signer,
            verdict: IAttestationVerifier.ReviewVerdict.ReleaseRecommended,
            createdAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp + 7 days)
        });
    }

    function _signReceipt(IAttestationVerifier.ReviewReceipt memory receipt, uint256 signerPrivateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = verifier.digestReviewReceipt(receipt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
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
