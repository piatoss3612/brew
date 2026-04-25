// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IAttestationVerifier {
    struct Template {
        bytes32 schemaUid;
        uint64 expiryWindowSeconds;
        uint64 stalenessWindowSeconds;
        bool registered;
    }

    error IssuerNotAllowed(bytes32 templateId, address issuer);
    error SchemaMismatch(bytes32 templateId, bytes32 expected, bytes32 actual);
    error WrongSubject(uint256 trustId, address expected, address actual);
    error AttestationRevoked(bytes32 attestationUid, uint64 revocationTime);
    error AttestationExpired(bytes32 attestationUid, uint64 expirationTime);
    error AttestationStale(
        bytes32 attestationUid,
        uint64 attestationTime,
        uint64 stalenessWindow
    );
    error AlreadyConsumed(bytes32 attestationUid);
    error TemplateNotRegistered(bytes32 templateId);
    error TemplateAlreadyRegistered(bytes32 templateId);

    event TemplateRegistered(
        bytes32 indexed templateId,
        bytes32 schemaUid,
        uint64 expiryWindowSeconds,
        uint64 stalenessWindowSeconds
    );

    event IssuerAllowlisted(
        bytes32 indexed templateId,
        address indexed issuer,
        bool allowed
    );
    event Verified(
        uint256 indexed trustId,
        bytes32 indexed attestationUid,
        address beneficiary
    );

    function registerTemplate(
        bytes32 templateId,
        bytes32 schemaUid,
        uint64 expiryWindowSeconds,
        uint64 stalenessWindowSeconds
    ) external;

    function setIssuerAllowed(
        bytes32 templateId,
        address issuer,
        bool allowed
    ) external;

    function verifyAndRelease(
        uint256 trustId,
        address beneficiary,
        bytes32 attestationUid
    ) external;

    function getTemplate(
        bytes32 templateId
    ) external view returns (Template memory);

    function isIssuerAllowed(
        bytes32 templateId,
        address issuer
    ) external view returns (bool);

    function consumed(bytes32 attestationUid) external view returns (bool);
}
