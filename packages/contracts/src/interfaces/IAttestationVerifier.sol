// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAttestationVerifier {
    enum ReviewVerdict {
        None,
        ReleaseRecommended,
        Rejected
    }

    struct Template {
        bytes32 schemaUid;
        uint64 expiryWindowSeconds;
        uint64 stalenessWindowSeconds;
        bool registered;
    }

    struct ReviewReceipt {
        uint256 trustId;
        address beneficiary;
        bytes32 attestationUid;
        bytes32 templateId;
        bytes32 receiptRoot;
        string receiptUri;
        address coordinator;
        ReviewVerdict verdict;
        uint64 createdAt;
        uint64 expiresAt;
    }

    error IssuerNotAllowed(bytes32 templateId, address issuer);
    error SchemaMismatch(bytes32 templateId, bytes32 expected, bytes32 actual);
    error WrongSubject(uint256 trustId, address expected, address actual);
    error AttestationRevoked(bytes32 attestationUid, uint64 revocationTime);
    error AttestationExpired(bytes32 attestationUid, uint64 expirationTime);
    error AttestationNotFound(bytes32 attestationUid);
    error AttestationExpiryMissing(bytes32 attestationUid);
    error AttestationExpiryTooLong(bytes32 attestationUid, uint64 expirationTime, uint256 maxExpirationTime);
    error AttestationStale(bytes32 attestationUid, uint64 attestationTime, uint64 stalenessWindow);
    error AlreadyConsumed(bytes32 attestationUid);
    error TemplateNotRegistered(bytes32 templateId);
    error TemplateAlreadyRegistered(bytes32 templateId);
    error InvalidVerifierConfig();
    error InvalidTemplateConfig();
    error InvalidIssuer();
    error InvalidReviewReceipt();
    error ReviewCoordinatorNotAllowed(address coordinator);
    error ReviewReceiptMismatch(bytes32 receiptDigest);
    error ReviewReceiptNotRecommended(bytes32 receiptDigest);
    error ReviewReceiptExpired(bytes32 receiptDigest, uint64 expirationTime);
    error InvalidReviewReceiptSignature(address expected, address actual);

    event TemplateRegistered(
        bytes32 indexed templateId, bytes32 schemaUid, uint64 expiryWindowSeconds, uint64 stalenessWindowSeconds
    );

    event IssuerAllowlisted(bytes32 indexed templateId, address indexed issuer, bool allowed);
    event ReviewCoordinatorAllowlisted(address indexed coordinator, bool allowed);
    event Verified(uint256 indexed trustId, bytes32 indexed attestationUid, address beneficiary);
    event ReviewReceiptAccepted(
        uint256 indexed trustId,
        bytes32 indexed attestationUid,
        address indexed coordinator,
        bytes32 receiptRoot,
        string receiptUri
    );

    /// @notice Registers the EAS schema and freshness rules for one template.
    function registerTemplate(
        bytes32 templateId,
        bytes32 schemaUid,
        uint64 expiryWindowSeconds,
        uint64 stalenessWindowSeconds
    ) external;

    /// @notice Allows or blocks an issuer for a registered template.
    function setIssuerAllowed(bytes32 templateId, address issuer, bool allowed) external;

    /// @notice Allows or blocks a coordinator that can sign review receipts.
    function setReviewCoordinatorAllowed(address coordinator, bool allowed) external;

    /// @notice Verifies an EAS attestation and a signed review receipt, then releases.
    function verifyAndRelease(
        uint256 trustId,
        address beneficiary,
        bytes32 attestationUid,
        ReviewReceipt calldata receipt,
        bytes calldata coordinatorSignature
    ) external;

    /// @notice Returns the EIP-712 digest a coordinator must sign for a review receipt.
    function digestReviewReceipt(ReviewReceipt calldata receipt) external view returns (bytes32);

    /// @notice Returns the registered template configuration.
    function getTemplate(bytes32 templateId) external view returns (Template memory);

    /// @notice Returns whether an issuer is allowed for a template.
    function isIssuerAllowed(bytes32 templateId, address issuer) external view returns (bool);

    /// @notice Returns whether a coordinator is allowed to sign review receipts.
    function isReviewCoordinatorAllowed(address coordinator) external view returns (bool);

    /// @notice Returns whether an attestation UID has already been used.
    function consumed(bytes32 attestationUid) external view returns (bool);
}
