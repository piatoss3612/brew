// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Attestation} from "@eas/Common.sol";
import {IEAS} from "@eas/IEAS.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IAttestationVerifier} from "./interfaces/IAttestationVerifier.sol";
import {IBrewEscrow} from "./interfaces/IBrewEscrow.sol";

contract AttestationVerifier is IAttestationVerifier, Ownable {
    IEAS public immutable eas;
    IBrewEscrow public immutable escrow;

    mapping(bytes32 templateId => Template) private _templates;
    mapping(bytes32 templateId => mapping(address issuer => bool)) private _issuerAllowed;
    mapping(bytes32 attestationUid => bool) public consumed;

    constructor(address initialOwner, IEAS eas_, IBrewEscrow escrow_) Ownable(initialOwner) {
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

    function verifyAndRelease(uint256 trustId, address beneficiary, bytes32 attestationUid) external {
        IBrewEscrow.Trust memory trust = escrow.trusts(trustId);
        if (trust.beneficiary != beneficiary) {
            revert WrongSubject(trustId, trust.beneficiary, beneficiary);
        }

        Template memory template = _templates[trust.templateId];
        if (!template.registered) revert TemplateNotRegistered(trust.templateId);

        if (!eas.isAttestationValid(attestationUid)) {
            revert AttestationNotFound(attestationUid);
        }

        Attestation memory attestation = eas.getAttestation(attestationUid);

        if (attestation.schema != template.schemaUid) {
            revert SchemaMismatch(trust.templateId, template.schemaUid, attestation.schema);
        }
        if (!_issuerAllowed[trust.templateId][attestation.attester]) {
            revert IssuerNotAllowed(trust.templateId, attestation.attester);
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

        consumed[attestationUid] = true;
        escrow.releaseTo(trustId, beneficiary);

        emit Verified(trustId, attestationUid, beneficiary);
    }

    function getTemplate(bytes32 templateId) external view returns (Template memory) {
        return _templates[templateId];
    }

    function isIssuerAllowed(bytes32 templateId, address issuer) external view returns (bool) {
        return _issuerAllowed[templateId][issuer];
    }
}
