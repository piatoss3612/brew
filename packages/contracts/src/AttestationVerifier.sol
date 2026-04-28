// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Attestation} from "@eas/Common.sol";
import {IEAS} from "@eas/IEAS.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {IAttestationVerifier} from "./interfaces/IAttestationVerifier.sol";
import {IBrewEscrow} from "./interfaces/IBrewEscrow.sol";

contract AttestationVerifier is IAttestationVerifier, Ownable, EIP712 {
    bytes32 private constant _REVIEW_RECEIPT_TYPEHASH = keccak256(
        "ReviewReceipt(uint256 trustId,address beneficiary,bytes32 attestationUid,bytes32 templateId,bytes32 receiptRoot,string receiptUri,address coordinator,uint8 verdict,uint64 createdAt,uint64 expiresAt)"
    );

    IEAS public immutable eas;
    IBrewEscrow public immutable escrow;

    mapping(bytes32 templateId => Template) private _templates;
    mapping(bytes32 templateId => mapping(address issuer => bool)) private _issuerAllowed;
    mapping(address coordinator => bool) private _reviewCoordinatorAllowed;
    mapping(bytes32 attestationUid => bool) public consumed;

    constructor(address initialOwner, IEAS eas_, IBrewEscrow escrow_)
        Ownable(initialOwner)
        EIP712("BrewReviewReceipt", "1")
    {
        if (address(eas_) == address(0) || address(escrow_) == address(0)) {
            revert InvalidVerifierConfig();
        }

        eas = eas_;
        escrow = escrow_;
    }

    function registerTemplate(
        bytes32 templateId,
        bytes32 schemaUid,
        uint64 expiryWindowSeconds,
        uint64 stalenessWindowSeconds
    ) external onlyOwner {
        if (templateId == bytes32(0) || schemaUid == bytes32(0) || stalenessWindowSeconds == 0) {
            revert InvalidTemplateConfig();
        }
        if (_templates[templateId].registered) {
            revert TemplateAlreadyRegistered(templateId);
        }

        _templates[templateId] = Template({
            schemaUid: schemaUid,
            expiryWindowSeconds: expiryWindowSeconds,
            stalenessWindowSeconds: stalenessWindowSeconds,
            registered: true
        });

        emit TemplateRegistered(templateId, schemaUid, expiryWindowSeconds, stalenessWindowSeconds);
    }

    function setIssuerAllowed(bytes32 templateId, address issuer, bool allowed) external onlyOwner {
        if (!_templates[templateId].registered) revert TemplateNotRegistered(templateId);
        if (issuer == address(0)) revert InvalidIssuer();

        _issuerAllowed[templateId][issuer] = allowed;

        emit IssuerAllowlisted(templateId, issuer, allowed);
    }

    function setReviewCoordinatorAllowed(address coordinator, bool allowed) external onlyOwner {
        if (coordinator == address(0)) revert InvalidReviewReceipt();

        _reviewCoordinatorAllowed[coordinator] = allowed;

        emit ReviewCoordinatorAllowlisted(coordinator, allowed);
    }

    function verifyAndRelease(
        uint256 trustId,
        address beneficiary,
        bytes32 attestationUid,
        ReviewReceipt calldata receipt,
        bytes calldata coordinatorSignature
    ) external {
        IBrewEscrow.Trust memory trust = _validateTrust(trustId, beneficiary);
        _verifyReviewReceipt(trustId, beneficiary, attestationUid, trust.templateId, receipt, coordinatorSignature);

        _verifyAttestation(trustId, beneficiary, trust.templateId, attestationUid);
        _consumeAndRelease(trustId, beneficiary, attestationUid);

        emit ReviewReceiptAccepted(
            trustId, attestationUid, receipt.coordinator, receipt.receiptRoot, receipt.receiptUri
        );
    }

    function digestReviewReceipt(ReviewReceipt calldata receipt) external view returns (bytes32) {
        return _digestReviewReceipt(receipt);
    }

    function isReviewCoordinatorAllowed(address coordinator) external view returns (bool) {
        return _reviewCoordinatorAllowed[coordinator];
    }

    function getTemplate(bytes32 templateId) external view returns (Template memory) {
        return _templates[templateId];
    }

    function isIssuerAllowed(bytes32 templateId, address issuer) external view returns (bool) {
        return _issuerAllowed[templateId][issuer];
    }

    function _verifyReviewReceipt(
        uint256 trustId,
        address beneficiary,
        bytes32 attestationUid,
        bytes32 templateId,
        ReviewReceipt calldata receipt,
        bytes calldata coordinatorSignature
    ) private view returns (bytes32 receiptDigest) {
        receiptDigest = _digestReviewReceipt(receipt);

        if (
            receipt.trustId != trustId || receipt.beneficiary != beneficiary || receipt.attestationUid != attestationUid
                || receipt.templateId != templateId
        ) {
            revert ReviewReceiptMismatch(receiptDigest);
        }
        if (receipt.receiptRoot == bytes32(0) || receipt.coordinator == address(0) || receipt.createdAt == 0) {
            revert InvalidReviewReceipt();
        }
        if (receipt.createdAt > block.timestamp || receipt.expiresAt <= receipt.createdAt) {
            revert InvalidReviewReceipt();
        }
        if (receipt.verdict != ReviewVerdict.ReleaseRecommended) {
            revert ReviewReceiptNotRecommended(receiptDigest);
        }
        if (receipt.expiresAt <= block.timestamp) {
            revert ReviewReceiptExpired(receiptDigest, receipt.expiresAt);
        }
        if (!_reviewCoordinatorAllowed[receipt.coordinator]) {
            revert ReviewCoordinatorNotAllowed(receipt.coordinator);
        }

        address signer = ECDSA.recover(receiptDigest, coordinatorSignature);
        if (signer != receipt.coordinator) {
            revert InvalidReviewReceiptSignature(receipt.coordinator, signer);
        }
    }

    function _digestReviewReceipt(ReviewReceipt calldata receipt) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    _REVIEW_RECEIPT_TYPEHASH,
                    receipt.trustId,
                    receipt.beneficiary,
                    receipt.attestationUid,
                    receipt.templateId,
                    receipt.receiptRoot,
                    keccak256(bytes(receipt.receiptUri)),
                    receipt.coordinator,
                    uint8(receipt.verdict),
                    receipt.createdAt,
                    receipt.expiresAt
                )
            )
        );
    }

    function _validateTrust(uint256 trustId, address beneficiary)
        private
        view
        returns (IBrewEscrow.Trust memory trust)
    {
        trust = escrow.trusts(trustId);
        if (trust.beneficiary != beneficiary) {
            revert WrongSubject(trustId, trust.beneficiary, beneficiary);
        }
    }

    function _verifyAttestation(uint256 trustId, address beneficiary, bytes32 templateId, bytes32 attestationUid)
        private
        view
    {
        Template memory template = _templates[templateId];
        if (!template.registered) revert TemplateNotRegistered(templateId);

        if (!eas.isAttestationValid(attestationUid)) {
            revert AttestationNotFound(attestationUid);
        }

        Attestation memory attestation = eas.getAttestation(attestationUid);

        if (attestation.schema != template.schemaUid) {
            revert SchemaMismatch(templateId, template.schemaUid, attestation.schema);
        }
        if (!_issuerAllowed[templateId][attestation.attester]) {
            revert IssuerNotAllowed(templateId, attestation.attester);
        }
        if (attestation.recipient != beneficiary) {
            revert WrongSubject(trustId, beneficiary, attestation.recipient);
        }
        if (attestation.revocationTime != 0) {
            revert AttestationRevoked(attestationUid, attestation.revocationTime);
        }
        if (attestation.expirationTime != 0 && block.timestamp > attestation.expirationTime) {
            revert AttestationExpired(attestationUid, attestation.expirationTime);
        }
        if (template.expiryWindowSeconds != 0) {
            if (attestation.expirationTime == 0) {
                revert AttestationExpiryMissing(attestationUid);
            }

            uint256 maxExpirationTime = uint256(attestation.time) + template.expiryWindowSeconds;
            if (attestation.expirationTime > maxExpirationTime) {
                revert AttestationExpiryTooLong(attestationUid, attestation.expirationTime, maxExpirationTime);
            }
        }
        if (block.timestamp > uint256(attestation.time) + template.stalenessWindowSeconds) {
            revert AttestationStale(attestationUid, attestation.time, template.stalenessWindowSeconds);
        }
        if (consumed[attestationUid]) {
            revert AlreadyConsumed(attestationUid);
        }
    }

    function _consumeAndRelease(uint256 trustId, address beneficiary, bytes32 attestationUid) private {
        consumed[attestationUid] = true;
        escrow.releaseTo(trustId, beneficiary);

        emit Verified(trustId, attestationUid, beneficiary);
    }
}
