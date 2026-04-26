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

    address internal owner = makeAddr("owner");
    address internal sponsor = makeAddr("sponsor");
    address internal beneficiary = makeAddr("beneficiary");
    address internal issuer = makeAddr("issuer");
    address internal stranger = makeAddr("stranger");

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

        vm.startPrank(owner);
        escrow.setVerifier(address(verifier));
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

    function testVerifyAndReleaseHappyPath() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );

        vm.expectEmit(true, true, true, true, address(verifier));
        emit IAttestationVerifier.Verified(trustId, uid, beneficiary);

        verifier.verifyAndRelease(trustId, beneficiary, uid);

        assertEq(token.balanceOf(beneficiary), AMOUNT);
        assertTrue(escrow.isReleased(trustId, beneficiary));
        assertTrue(verifier.consumed(uid));
    }

    function testVerifyAndReleaseRejectsWrongSchema() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 wrongSchema = keccak256("WrongSchema");
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, wrongSchema, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );

        vm.expectRevert(
            abi.encodeWithSelector(IAttestationVerifier.SchemaMismatch.selector, TEMPLATE_ID, SCHEMA_UID, wrongSchema)
        );
        verifier.verifyAndRelease(trustId, beneficiary, uid);
    }

    function testVerifyAndReleaseRejectsUnknownAttestation() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 unknownUid = keccak256("unknown attestation");

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AttestationNotFound.selector, unknownUid));
        verifier.verifyAndRelease(trustId, beneficiary, unknownUid);
    }

    function testVerifyAndReleaseRejectsUnauthorizedIssuer() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            stranger, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.IssuerNotAllowed.selector, TEMPLATE_ID, stranger));
        verifier.verifyAndRelease(trustId, beneficiary, uid);
    }

    function testVerifyAndReleaseRejectsWrongRecipient() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, stranger, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );

        vm.expectRevert(
            abi.encodeWithSelector(IAttestationVerifier.WrongSubject.selector, trustId, beneficiary, stranger)
        );
        verifier.verifyAndRelease(trustId, beneficiary, uid);
    }

    function testVerifyAndReleaseRejectsAssertedBeneficiaryMismatch() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, stranger, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );

        vm.expectRevert(
            abi.encodeWithSelector(IAttestationVerifier.WrongSubject.selector, trustId, beneficiary, stranger)
        );
        verifier.verifyAndRelease(trustId, stranger, uid);
    }

    function testVerifyAndReleaseRejectsRevokedAttestation() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        uint64 revokedAt = uint64(block.timestamp - 1);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), revokedAt
        );

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AttestationRevoked.selector, uid, revokedAt));
        verifier.verifyAndRelease(trustId, beneficiary, uid);
    }

    function testVerifyAndReleaseRejectsMissingExpiryWhenWindowIsRequired() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), 0, 0);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AttestationExpiryMissing.selector, uid));
        verifier.verifyAndRelease(trustId, beneficiary, uid);
    }

    function testVerifyAndReleaseRejectsExpiryPastTemplateWindow() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        uint64 attestedAt = uint64(block.timestamp);
        uint64 expirationTime = uint64(block.timestamp + EXPIRY_WINDOW + 1);
        bytes32 uid = _seedAttestation(issuer, beneficiary, SCHEMA_UID, attestedAt, expirationTime, 0);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAttestationVerifier.AttestationExpiryTooLong.selector,
                uid,
                expirationTime,
                uint256(attestedAt) + EXPIRY_WINDOW
            )
        );
        verifier.verifyAndRelease(trustId, beneficiary, uid);
    }

    function testVerifyAndReleaseRejectsExpiredAttestation() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        uint64 expiredAt = uint64(block.timestamp - 1);
        bytes32 uid = _seedAttestation(issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp - 1 days), expiredAt, 0);

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AttestationExpired.selector, uid, expiredAt));
        verifier.verifyAndRelease(trustId, beneficiary, uid);
    }

    function testVerifyAndReleaseRejectsStaleAttestation() public {
        uint256 trustId = _createTrust(TEMPLATE_ID);
        uint64 attestedAt = uint64(block.timestamp - STALENESS_WINDOW - 1);
        bytes32 uid =
            _seedAttestation(issuer, beneficiary, SCHEMA_UID, attestedAt, uint64(block.timestamp + 30 days), 0);

        vm.expectRevert(
            abi.encodeWithSelector(IAttestationVerifier.AttestationStale.selector, uid, attestedAt, STALENESS_WINDOW)
        );
        verifier.verifyAndRelease(trustId, beneficiary, uid);
    }

    function testVerifyAndReleaseRejectsConsumedAttestation() public {
        uint256 firstTrustId = _createTrust(TEMPLATE_ID);
        bytes32 uid = _seedAttestation(
            issuer, beneficiary, SCHEMA_UID, uint64(block.timestamp), uint64(block.timestamp + 30 days), 0
        );

        verifier.verifyAndRelease(firstTrustId, beneficiary, uid);

        uint256 secondTrustId = _createTrust(TEMPLATE_ID);
        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.AlreadyConsumed.selector, uid));
        verifier.verifyAndRelease(secondTrustId, beneficiary, uid);
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

        verifier.verifyAndRelease(trustId, beneficiary, uid);

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

        vm.expectRevert(abi.encodeWithSelector(IAttestationVerifier.TemplateNotRegistered.selector, unknownTemplate));
        verifier.verifyAndRelease(trustId, beneficiary, uid);
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
}
