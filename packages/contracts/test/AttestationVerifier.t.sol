// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Attestation} from "@eas/Common.sol";
import {IEAS} from "@eas/IEAS.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {AttestationVerifier} from "../src/AttestationVerifier.sol";
import {BrewEscrow} from "../src/BrewEscrow.sol";
import {IAttestationVerifier} from "../src/interfaces/IAttestationVerifier.sol";
import {IBrewEscrow} from "../src/interfaces/IBrewEscrow.sol";
import {MockEAS} from "./mocks/MockEAS.sol";

contract VerifierMockToken is ERC20 {
    constructor() ERC20("Verifier Mock Token", "VMOCK") {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract AttestationVerifierTest is Test {
    BrewEscrow internal escrow;
    AttestationVerifier internal verifier;
    MockEAS internal eas;
    VerifierMockToken internal token;

    uint256 internal constant COORDINATOR_PRIVATE_KEY = 0xA11CE;

    address internal owner = makeAddr("owner");
    address internal sponsor = makeAddr("sponsor");
    address internal beneficiary = makeAddr("beneficiary");
    address internal issuer = makeAddr("issuer");
    address internal stranger = makeAddr("stranger");
    address internal coordinator;

    uint256 internal constant AMOUNT = 1_000 ether;
    bytes32 internal constant TEMPLATE_ID = keccak256("degree_verified:0.1.0");
    bytes32 internal constant SCHEMA_UID = keccak256("DegreeVerification");
    uint64 internal constant EXPIRY_WINDOW = 365 days;
    uint64 internal constant STALENESS_WINDOW = 90 days;

    function setUp() public {
        vm.warp(1_000 days);

        eas = new MockEAS();
        token = new VerifierMockToken();
        escrow = new BrewEscrow(owner);
        verifier = new AttestationVerifier(owner, IEAS(address(eas)), IBrewEscrow(address(escrow)));
        coordinator = vm.addr(COORDINATOR_PRIVATE_KEY);

        vm.startPrank(owner);
        escrow.setVerifier(address(verifier));
        verifier.setReviewCoordinatorAllowed(coordinator, true);
        verifier.registerTemplate(TEMPLATE_ID, SCHEMA_UID, EXPIRY_WINDOW, STALENESS_WINDOW);
        verifier.setIssuerAllowed(TEMPLATE_ID, issuer, true);
        vm.stopPrank();

        token.mint(sponsor, AMOUNT * 10);
    }

    function testRegisterTemplateStoresConfig() public {
        bytes32 templateId = keccak256("fellowship_milestone:0.1.0");
        bytes32 schemaUid = keccak256("FellowshipMilestone");

        vm.prank(owner);
        verifier.registerTemplate(templateId, schemaUid, EXPIRY_WINDOW, STALENESS_WINDOW);

        IAttestationVerifier.Template memory template = verifier.getTemplate(templateId);
        assertEq(template.schemaUid, schemaUid);
        assertEq(template.expiryWindowSeconds, EXPIRY_WINDOW);
        assertEq(template.stalenessWindowSeconds, STALENESS_WINDOW);
        assertTrue(template.registered);
    }

    function testConstructorRejectsZeroEAS() public {
        vm.expectRevert(IAttestationVerifier.InvalidVerifierConfig.selector);
        new AttestationVerifier(owner, IEAS(address(0)), IBrewEscrow(address(escrow)));
    }

    function testConstructorRejectsZeroEscrow() public {
        vm.expectRevert(IAttestationVerifier.InvalidVerifierConfig.selector);
        new AttestationVerifier(owner, IEAS(address(eas)), IBrewEscrow(address(0)));
    }

    function testSetIssuerAllowedStoresIssuerFlag() public {
        assertTrue(verifier.isIssuerAllowed(TEMPLATE_ID, issuer));

        vm.prank(owner);
        verifier.setIssuerAllowed(TEMPLATE_ID, issuer, false);

        assertFalse(verifier.isIssuerAllowed(TEMPLATE_ID, issuer));
    }

    function testSetReviewCoordinatorAllowedStoresCoordinatorFlag() public {
        assertTrue(verifier.isReviewCoordinatorAllowed(coordinator));

        vm.prank(owner);
        verifier.setReviewCoordinatorAllowed(coordinator, false);

        assertFalse(verifier.isReviewCoordinatorAllowed(coordinator));
    }

    function testVerifyAndReleaseHappyPath() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        IAttestationVerifier.ReviewReceipt memory receipt = _recommendedReceipt(trustId, beneficiary, uid);
        bytes memory signature = _signReceipt(receipt);

        vm.expectEmit(true, true, true, true, address(verifier));
        emit IAttestationVerifier.Verified(trustId, uid, beneficiary);
        vm.expectEmit(true, true, true, false, address(verifier));
        emit IAttestationVerifier.ReviewReceiptAccepted(
            trustId, uid, coordinator, receipt.receiptRoot, receipt.receiptUri
        );

        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);

        assertEq(token.balanceOf(beneficiary), AMOUNT);
        assertTrue(escrow.isReleased(trustId, beneficiary));
        assertTrue(verifier.consumed(uid));
    }

    function testVerifyAndReleaseRejectsRejectedReceipt() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        IAttestationVerifier.ReviewReceipt memory receipt =
            _reviewReceipt(trustId, beneficiary, uid, TEMPLATE_ID, IAttestationVerifier.ReviewVerdict.Rejected);
        bytes32 digest = verifier.digestReviewReceipt(receipt);
        bytes memory signature = _signReceipt(receipt);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.ReviewReceiptNotRecommended.selector, digest));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsExpiredReceipt() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        IAttestationVerifier.ReviewReceipt memory receipt = _recommendedReceipt(trustId, beneficiary, uid);
        bytes32 digest = verifier.digestReviewReceipt(receipt);
        uint64 expiresAt = receipt.expiresAt;
        bytes memory signature = _signReceipt(receipt);

        vm.warp(uint256(expiresAt));

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.ReviewReceiptExpired.selector, digest, expiresAt));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsWrongBeneficiaryReceipt() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        IAttestationVerifier.ReviewReceipt memory receipt = _recommendedReceipt(trustId, stranger, uid);
        bytes32 digest = verifier.digestReviewReceipt(receipt);
        bytes memory signature = _signReceipt(receipt);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.ReviewReceiptMismatch.selector, digest));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsWrongTemplateReceipt() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        IAttestationVerifier.ReviewReceipt memory receipt = _reviewReceipt(
            trustId,
            beneficiary,
            uid,
            keccak256("wrong_template:0.1.0"),
            IAttestationVerifier.ReviewVerdict.ReleaseRecommended
        );
        bytes32 digest = verifier.digestReviewReceipt(receipt);
        bytes memory signature = _signReceipt(receipt);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.ReviewReceiptMismatch.selector, digest));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsUnallowedCoordinator() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        IAttestationVerifier.ReviewReceipt memory receipt = _recommendedReceipt(trustId, beneficiary, uid);

        vm.prank(owner);
        verifier.setReviewCoordinatorAllowed(coordinator, false);

        bytes memory signature = _signReceipt(receipt);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.ReviewCoordinatorNotAllowed.selector, coordinator));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsWrongSignature() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        IAttestationVerifier.ReviewReceipt memory receipt = _recommendedReceipt(trustId, beneficiary, uid);
        uint256 wrongPrivateKey = 0xB0B;
        address wrongSigner = vm.addr(wrongPrivateKey);
        bytes memory signature = _signReceiptWith(receipt, wrongPrivateKey);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAttestationVerifier.InvalidReviewReceiptSignature.selector, coordinator, wrongSigner
            )
        );
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsInvalidReceiptRoot() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        IAttestationVerifier.ReviewReceipt memory receipt = _recommendedReceipt(trustId, beneficiary, uid);
        receipt.receiptRoot = bytes32(0);
        bytes memory signature = _signReceipt(receipt);

        vm.expectRevert(IAttestationVerifier.InvalidReviewReceipt.selector);
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsWrongSchema() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 wrongSchema = keccak256("WrongSchema");
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, wrongSchema, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, uid);

        vm.expectRevert(
            abi.encodeWithSelector(IAttestationVerifier.SchemaMismatch.selector, TEMPLATE_ID, SCHEMA_UID, wrongSchema)
        );
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsUnknownAttestation() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 unknownUid = keccak256("unknown attestation");
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, unknownUid);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AttestationNotFound.selector, unknownUid));
        verifier.verifyAndRelease(trustId, beneficiary, unknownUid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsUnauthorizedIssuer() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            stranger, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, uid);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.IssuerNotAllowed.selector, TEMPLATE_ID, stranger));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsWrongRecipient() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, stranger, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, uid);

        vm.expectRevert(
            abi.encodeWithSelector(IAttestationVerifier.WrongSubject.selector, trustId, beneficiary, stranger)
        );
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsAssertedBeneficiaryMismatch() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, stranger, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, stranger, uid);

        vm.expectRevert(
            abi.encodeWithSelector(IAttestationVerifier.WrongSubject.selector, trustId, beneficiary, stranger)
        );
        verifier.verifyAndRelease(trustId, stranger, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsRevokedAttestation() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        uint64 revokedAt = uint64(block.timestamp - 1);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), revokedAt
        );
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, uid);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AttestationRevoked.selector, uid, revokedAt));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsMissingExpiryWhenWindowIsRequired() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), 0, 0);
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, uid);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AttestationExpiryMissing.selector, uid));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsExpiryPastTemplateWindow() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        uint64 attestedAt = uint64(block.timestamp);
        uint64 expirationTime = uint64(block.timestamp + EXPIRY_WINDOW + 1);
        bytes32 uid = _seedAttestation(issuer, beneficiary, SCHEMA_UID, attestedAt, expirationTime, 0);
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, uid);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAttestationVerifier.AttestationExpiryTooLong.selector,
                uid,
                expirationTime,
                uint256(attestedAt) + EXPIRY_WINDOW
            )
        );
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsExpiredAttestation() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        uint64 expiredAt = uint64(block.timestamp - 1);
        bytes32 uid = _seedAttestation(issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp - 1 days), expiredAt, 0);
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, uid);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AttestationExpired.selector, uid, expiredAt));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsStaleAttestation() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        uint64 attestedAt = uint64(block.timestamp - STALENESS_WINDOW - 1);
        bytes32 uid =
            _seedAttestation(issuer, beneficiary, SCHEMA_UID, attestedAt, uint64(block.timestamp + 30 days), 0);
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, uid);

        vm.expectRevert(
            abi.encodeWithSelector(IAttestationVerifier.AttestationStale.selector, uid, attestedAt, STALENESS_WINDOW)
        );
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseRejectsConsumedAttestation() public {
        uint256 firstTrustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );

        _verifyAndRelease(firstTrustId, beneficiary, uid);

        uint256 secondTrustId = _createTrust(TEMPLATE_ID);
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(secondTrustId, beneficiary, uid);
        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AlreadyConsumed.selector, uid));
        verifier.verifyAndRelease(secondTrustId, beneficiary, uid, receipt, signature);
    }

    function testVerifyAndReleaseAllowsNoExpiryWhenTemplateWindowIsDisabled() public {
        bytes32 templateId = keccak256("no_expiry_template:0.1.0");
        bytes32 schemaUid = keccak256("NoExpiryTemplate");

        vm.startPrank(owner);
        verifier.registerTemplate(templateId, schemaUid, 0, STALENESS_WINDOW);
        verifier.setIssuerAllowed(templateId, issuer, true);
        vm.stopPrank();

        uint256 trustId = _createTrust(templateId);
        bytes32 uid = _seedAttestation(issuer, beneficiary, schemaUid, uint64(block.timestamp), 0, 0);

        _verifyAndRelease(trustId, beneficiary, uid);

        assertTrue(escrow.isReleased(trustId, beneficiary));
    }

    function testSetIssuerAllowedRejectsUnregisteredTemplate() public {
        bytes32 unknownTemplate = keccak256("unknown:0.1.0");

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.TemplateNotRegistered.selector, unknownTemplate));
        verifier.setIssuerAllowed(unknownTemplate, issuer, true);
    }

    function testSetIssuerAllowedRejectsZeroIssuer() public {
        vm.prank(owner);
        vm.expectRevert(IAttestationVerifier.InvalidIssuer.selector);
        verifier.setIssuerAllowed(TEMPLATE_ID, address(0), true);
    }

    function testRegisterTemplateRejectsDuplicateTemplate() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.TemplateAlreadyRegistered.selector, TEMPLATE_ID));
        verifier.registerTemplate(TEMPLATE_ID, SCHEMA_UID, EXPIRY_WINDOW, STALENESS_WINDOW);
    }

    function testRegisterTemplateRejectsInvalidTemplateId() public {
        vm.prank(owner);
        vm.expectRevert(IAttestationVerifier.InvalidTemplateConfig.selector);
        verifier.registerTemplate(bytes32(0), SCHEMA_UID, EXPIRY_WINDOW, STALENESS_WINDOW);
    }

    function testRegisterTemplateRejectsInvalidSchema() public {
        vm.prank(owner);
        vm.expectRevert(IAttestationVerifier.InvalidTemplateConfig.selector);
        verifier.registerTemplate(keccak256("invalid_schema:0.1.0"), bytes32(0), EXPIRY_WINDOW, STALENESS_WINDOW);
    }

    function testRegisterTemplateRejectsZeroStalenessWindow() public {
        vm.prank(owner);
        vm.expectRevert(IAttestationVerifier.InvalidTemplateConfig.selector);
        verifier.registerTemplate(keccak256("zero_staleness:0.1.0"), SCHEMA_UID, EXPIRY_WINDOW, 0);
    }

    function testVerifyAndReleaseRejectsUnregisteredTrustTemplate() public {
        bytes32 unknownTemplate = keccak256("unregistered:0.1.0");
        uint256 trustId = _createTrust(unknownTemplate);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, beneficiary, uid);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.TemplateNotRegistered.selector, unknownTemplate));
        verifier.verifyAndRelease(trustId, beneficiary, uid, receipt, signature);
    }

    function _createTrust(bytes32 templateId) internal returns (uint256 trustId) {
        vm.startPrank(sponsor);
        token.approve(address(escrow), AMOUNT);
        trustId = escrow.createTrust(beneficiary, address(token), AMOUNT, 0, templateId);
        vm.stopPrank();
    }

    function _seedAttestation(
        address attester,
        address recipient,
        bytes32 schema,
        uint64 attestedAt,
        uint64 expirationTime,
        uint64 revocationTime
    ) internal returns (bytes32 uid) {
        uid = keccak256(abi.encode(attester, recipient, schema, attestedAt, expirationTime, revocationTime));

        eas.setAttestation(
            Attestation({
                uid: uid,
                schema: schema,
                time: attestedAt,
                expirationTime: expirationTime,
                revocationTime: revocationTime,
                refUID: bytes32(0),
                recipient: recipient,
                attester: attester,
                revocable: true,
                data: abi.encode("degree_verified")
            })
        );
    }

    function _verifyAndRelease(uint256 trustId, address releaseBeneficiary, bytes32 attestationUid) internal {
        (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature) =
            _signedRecommendedReceipt(trustId, releaseBeneficiary, attestationUid);
        verifier.verifyAndRelease(trustId, releaseBeneficiary, attestationUid, receipt, signature);
    }

    function _signedRecommendedReceipt(uint256 trustId, address receiptBeneficiary, bytes32 attestationUid)
        internal
        view
        returns (IAttestationVerifier.ReviewReceipt memory receipt, bytes memory signature)
    {
        receipt = _recommendedReceipt(trustId, receiptBeneficiary, attestationUid);
        signature = _signReceipt(receipt);
    }

    function _recommendedReceipt(uint256 trustId, address receiptBeneficiary, bytes32 attestationUid)
        internal
        view
        returns (IAttestationVerifier.ReviewReceipt memory)
    {
        IBrewEscrow.Trust memory trust = escrow.trusts(trustId);
        return _reviewReceipt(
            trustId,
            receiptBeneficiary,
            attestationUid,
            trust.templateId,
            IAttestationVerifier.ReviewVerdict.ReleaseRecommended
        );
    }

    function _reviewReceipt(
        uint256 trustId,
        address receiptBeneficiary,
        bytes32 attestationUid,
        bytes32 templateId,
        IAttestationVerifier.ReviewVerdict verdict
    ) internal view returns (IAttestationVerifier.ReviewReceipt memory) {
        return IAttestationVerifier.ReviewReceipt({
            trustId: trustId,
            beneficiary: receiptBeneficiary,
            attestationUid: attestationUid,
            templateId: templateId,
            receiptRoot: keccak256(abi.encode("review-root", trustId, attestationUid, templateId, verdict)),
            receiptUri: "0g://review-receipts/example",
            coordinator: coordinator,
            verdict: verdict,
            createdAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp + 7 days)
        });
    }

    function _signReceipt(IAttestationVerifier.ReviewReceipt memory receipt) internal view returns (bytes memory) {
        return _signReceiptWith(receipt, COORDINATOR_PRIVATE_KEY);
    }

    function _signReceiptWith(IAttestationVerifier.ReviewReceipt memory receipt, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = verifier.digestReviewReceipt(receipt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
